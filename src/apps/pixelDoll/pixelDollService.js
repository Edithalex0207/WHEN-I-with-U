import Dexie from 'dexie';
import db from '../../db';
import { DEFAULT_LOOKS } from './pixelDollParts';
import {
  PART_CATEGORIES,
  applyGiftToLook,
  describeGift,
  getBodyLookHint,
  normalizeLook,
  toStoredPart,
  validatePartData,
} from './pixelDollEngine';

// ============================================================
// 像素衣橱（src/apps/pixelDoll/）—— 数据层。
//
// 跟"小伙伴"一样，是一个要用户自己手动打开才开始使用的东西：某个聊天的
// pixelDollProfiles 行不存在，就说明这个聊天还没开通，聊天室里不会有任何
// 额外负担。第一次打开衣橱页面时 ensurePixelDollProfile 才会建这一行。
//
// 为了不给 ChatRoom 增加启动成本，这个文件（以及整个 pixelDoll 文件夹）
// 只能被衣橱页面 / 挂件 / 调度器这些"懒加载"的入口 import，ChatRoom.jsx
// 和 aiService.js 都不要静态 import 这里的任何东西——aiService 需要的只是
// 消息 metadata 里已经带着的文字，不需要读这个文件。
//
// 三张表：
//   - pixelDollProfiles：每个聊天一行（chatId 唯一），存"你的小人"和"TA 的
//     小人"当前的外观，以及聊天窗挂件是否开启（默认关闭）。
//   - pixelDollParts：自定义部件库。scopeChatId = 0 表示全局共用（用户导入
//     的发型/眼睛/衣着），scopeChatId = 某个 chatId 表示只属于这个聊天
//     （身形——角色设计的自己，或者 AI 帮用户设计的）。
//   - pixelDollGifts：礼物记录，一条一行，每个聊天只保留最近 60 条，更旧的
//     物理删除。
//
// 礼物会同时以一条 type:'pixel_doll_gift' 的真实聊天消息落库（跟异地任务
// 挑战的 challenge_complete 同一个思路），这样角色在下一次正常回复时就能
// 自然看到。这类消息怎么渲染成聊天里的小提示、怎么写进提示词，在后面接
// 聊天室的那一轮再做。
//
// AI 相关的部分（角色决定穿不穿、主动送礼、设计身形）放在单独的
// pixelDollAiService.js 里，这个文件不碰 AI。
// ============================================================

const nowIso = () => new Date().toISOString();

export const GLOBAL_SCOPE = 0;
const MAX_PART_JSON_LENGTH = 20000;
const MAX_PARTS_PER_SCOPE = 80;
const MAX_GIFTS_PER_CHAT = 60;
const MAX_IMPORT_TEXT_LENGTH = 30000;

const LOOK_FIELD = { user: 'userLook', char: 'charLook' };

const dispatchLocalMessageEvent = (chatId) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent('new-local-message-inserted', {
      detail: { chatId },
    })
  );
};

/* ------------------------- 自定义部件 ------------------------- */

// 把数据库里的部件行整理成引擎要的 { hair: {id: part}, ... }。
// 先放全局的，再放这个聊天专属的，同 id 时聊天专属的覆盖全局的。
// 用 Object.create(null) 当字典，避免 id 叫 __proto__ 之类的奇怪名字污染原型。
export const buildCustomParts = (rows) => {
  const parts = {};
  PART_CATEGORIES.forEach((category) => {
    parts[category] = Object.create(null);
  });

  const sorted = [...(rows || [])].sort((a, b) => {
    const scopeA = a.scopeChatId === GLOBAL_SCOPE ? 0 : 1;
    const scopeB = b.scopeChatId === GLOBAL_SCOPE ? 0 : 1;
    if (scopeA !== scopeB) return scopeA - scopeB;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });

  sorted.forEach((row) => {
    if (!PART_CATEGORIES.includes(row.category) || !row.partId || !row.data) return;
    parts[row.category][row.partId] = { ...row.data, name: row.name || row.data.name || row.partId };
  });

  return parts;
};

export const loadCustomPartRows = (chatId) => (
  db.pixelDollParts.where('scopeChatId').anyOf(GLOBAL_SCOPE, chatId).toArray()
);

export const loadCustomParts = async (chatId) => buildCustomParts(await loadCustomPartRows(chatId));

// 新增或覆盖一个自定义部件（同一范围内 category + partId 相同就覆盖）。
// 返回 { ok: true, ... } 或 { ok: false, error }，error 是可以直接展示的中文。
const savePartRow = async ({ scopeChatId, category, partId, part, source }) => {
  const json = JSON.stringify(part);
  if (json.length > MAX_PART_JSON_LENGTH) {
    return { ok: false, error: '这个部件的数据太大了，请精简一下' };
  }

  const stamp = nowIso();

  return db.transaction('rw', db.pixelDollParts, async () => {
    const existing = await db.pixelDollParts
      .where('[scopeChatId+category+partId]')
      .equals([scopeChatId, category, partId])
      .first();

    if (existing) {
      await db.pixelDollParts.update(existing.id, {
        name: part.name,
        data: part,
        source,
        updatedAt: stamp,
      });
      return { ok: true, id: existing.id, category, partId, name: part.name, replaced: true };
    }

    const count = await db.pixelDollParts.where('scopeChatId').equals(scopeChatId).count();
    if (count >= MAX_PARTS_PER_SCOPE) {
      return { ok: false, error: `自定义部件已经有 ${MAX_PARTS_PER_SCOPE} 个了，先删掉一些再导入` };
    }

    const id = await db.pixelDollParts.add({
      scopeChatId,
      category,
      partId,
      name: part.name,
      data: part,
      source,
      createdAt: stamp,
      updatedAt: stamp,
    });
    return { ok: true, id, category, partId, name: part.name, replaced: false };
  });
};

// 用户粘贴 JSON 导入部件。input 可以是字符串或已经解析好的对象。
// 发型/眼睛/衣着是全局共用的，身形只属于当前这个聊天。
export const importPixelDollPart = async (chatId, input, { source = 'import' } = {}) => {
  let data = input;

  if (typeof input === 'string') {
    if (input.length > MAX_IMPORT_TEXT_LENGTH) {
      return { ok: false, error: '粘贴的内容太长了' };
    }
    try {
      data = JSON.parse(input);
    } catch (error) {
      return { ok: false, error: `JSON 格式不对（${error.message}）` };
    }
  }

  const error = validatePartData(data);
  if (error) return { ok: false, error };

  const { category, id, part } = toStoredPart(data);
  const scopeChatId = category === 'body' ? chatId : GLOBAL_SCOPE;

  return savePartRow({ scopeChatId, category, partId: id, part, source });
};

export const deletePixelDollPart = (rowId) => db.pixelDollParts.delete(rowId);

/* ------------------------- 档案（每个聊天一份） ------------------------- */

export const getPixelDollProfile = (chatId) => (
  chatId ? db.pixelDollProfiles.where('chatId').equals(chatId).first() : Promise.resolve(null)
);

// 第一次打开衣橱时调用，建这个聊天的档案。重复调用安全。
export const ensurePixelDollProfile = async (chatId) => {
  if (!chatId) return null;

  const existing = await getPixelDollProfile(chatId);
  if (existing) return existing;

  const stamp = nowIso();

  try {
    const id = await db.pixelDollProfiles.add({
      chatId,
      userLook: { ...DEFAULT_LOOKS.user },
      charLook: { ...DEFAULT_LOOKS.char },
      widgetEnabled: false,
      lastCharGiftAt: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
    return db.pixelDollProfiles.get(id);
  } catch (error) {
    // 两个地方同时打开时 chatId 唯一索引会拦住第二条，直接读已有的那条
    if (error?.name === 'ConstraintError') return getPixelDollProfile(chatId);
    throw error;
  }
};

// 衣橱页面用 liveQuery 订阅这个函数：返回档案、可用的自定义部件、最近的礼物。
// 注意 liveQuery 里不能写库，所以这里只读，建档案要在打开页面时先调
// ensurePixelDollProfile。
export const readPixelDollState = async (chatId) => {
  const [profile, partRows, gifts] = await Promise.all([
    getPixelDollProfile(chatId),
    loadCustomPartRows(chatId),
    db.pixelDollGifts
      .where('[chatId+createdAt]')
      .between([chatId, Dexie.minKey], [chatId, Dexie.maxKey])
      .reverse()
      .limit(MAX_GIFTS_PER_CHAT)
      .toArray(),
  ]);

  const customParts = buildCustomParts(partRows);

  return {
    profile: profile
      ? {
        ...profile,
        userLook: normalizeLook(profile.userLook, customParts, 'user'),
        charLook: normalizeLook(profile.charLook, customParts, 'char'),
      }
      : null,
    customParts,
    partRows,
    gifts,
  };
};

export const setPixelDollWidgetEnabled = async (chatId, enabled) => {
  const profile = await ensurePixelDollProfile(chatId);
  if (!profile) return null;
  await db.pixelDollProfiles.update(profile.id, { widgetEnabled: Boolean(enabled), updatedAt: nowIso() });
  return getPixelDollProfile(chatId);
};

// 直接设置某一方的整套外观（比如"再来一次"时回到设计之前的样子）。
export const setPixelDollLook = async (chatId, who, look) => {
  const field = LOOK_FIELD[who];
  if (!field) return null;

  const profile = await ensurePixelDollProfile(chatId);
  const customParts = await loadCustomParts(chatId);
  const next = normalizeLook(look, customParts, who);

  await db.pixelDollProfiles.update(profile.id, { [field]: next, updatedAt: nowIso() });
  return next;
};

// 选用某个身形（standard 或任何内置/自定义身形 id），顺带套上这个身形
// 建议的肤色/眼睛/衣服。身形 id 不存在会自动退回 standard。
export const selectPixelDollBody = async (chatId, who, bodyId, { applyHint = true } = {}) => {
  const field = LOOK_FIELD[who];
  if (!field) return null;

  const profile = await ensurePixelDollProfile(chatId);
  const customParts = await loadCustomParts(chatId);
  const hint = applyHint && bodyId !== 'standard' ? getBodyLookHint(bodyId, customParts) : {};
  const next = normalizeLook({ ...profile[field], ...hint, body: bodyId }, customParts, who);

  await db.pixelDollProfiles.update(profile.id, { [field]: next, updatedAt: nowIso() });
  return next;
};

// 保存一份 AI 设计出来的身形（角色设计自己，或 AI 帮用户设计），并直接
// 穿上。designData 的形状见 pixelDollParts.js 顶部说明，另外可以带一个
// look 字段（建议的肤色/眼睛/衣服）。通过校验才会保存。
// 返回 { ok, rowId, partId, look } 或 { ok:false, error }；页面如果之后
// 要放弃这次设计，用 deletePixelDollPart(rowId) + setPixelDollLook 还原。
export const saveDesignedBody = async (chatId, who, designData, { source } = {}) => {
  if (!LOOK_FIELD[who]) return { ok: false, error: '不认识的对象' };
  if (!designData || typeof designData !== 'object' || Array.isArray(designData)) {
    return { ok: false, error: '设计数据必须是一个对象' };
  }

  const { look: lookHint, ...bodyFields } = designData;
  const partId = `ai-${who}-${Date.now().toString(36)}`;
  const data = { ...bodyFields, category: 'body', id: partId, lookHint };

  const error = validatePartData(data);
  if (error) return { ok: false, error };

  const { part } = toStoredPart(data);
  const saved = await savePartRow({
    scopeChatId: chatId,
    category: 'body',
    partId,
    part,
    source: source || (who === 'char' ? 'ai-char' : 'ai-user'),
  });
  if (!saved.ok) return saved;

  const look = await selectPixelDollBody(chatId, who, partId, { applyHint: true });
  return { ok: true, rowId: saved.id, partId, look };
};

/* ------------------------- 礼物 ------------------------- */

const trimGifts = async (chatId) => {
  const keys = await db.pixelDollGifts
    .where('[chatId+createdAt]')
    .between([chatId, Dexie.minKey], [chatId, Dexie.maxKey])
    .primaryKeys();

  if (keys.length > MAX_GIFTS_PER_CHAT) {
    await db.pixelDollGifts.bulkDelete(keys.slice(0, keys.length - MAX_GIFTS_PER_CHAT));
  }
};

// 写一条真实的聊天消息，让角色下一次回复时能看到这件礼物的事。
// 用户送的算用户消息（已读），角色送的/角色的回应算角色消息（未读，
// 让聊天列表的未读角标正常显示）。
const insertGiftChatMessage = async ({ chatId, sender, content, metadata }) => {
  const chat = await db.chats.get(chatId);
  if (!chat?.characterId) return null;

  const stamp = nowIso();

  await db.messages.add({
    chatId,
    characterId: chat.characterId,
    sender,
    type: 'pixel_doll_gift',
    content,
    metadata,
    isRead: sender === 'user',
    timestamp: stamp,
  });
  await db.chats.update(chatId, { updatedAt: stamp });

  dispatchLocalMessageEvent(chatId);
  return stamp;
};

const getGift = (giftId) => db.pixelDollGifts.get(giftId);

// 把一件礼物"穿"到某一方身上，只改外观，不写记录/消息。
const wearGift = async (chatId, who, gift) => {
  const field = LOOK_FIELD[who];
  const profile = await ensurePixelDollProfile(chatId);
  const customParts = await loadCustomParts(chatId);
  const next = applyGiftToLook(profile[field], gift, customParts, who);

  await db.pixelDollProfiles.update(profile.id, { [field]: next, updatedAt: nowIso() });
  return next;
};

// 用户送角色一件礼物：先记成 pending，穿不穿由角色自己决定（AI 决定后调
// resolveGiftByCharacter）。同时写一条用户消息，让角色看到"收到礼物了"。
export const sendGiftToCharacter = async (chatId, gift) => {
  const customParts = await loadCustomParts(chatId);
  const label = describeGift(gift, customParts);
  if (!gift || !label) return null;

  await ensurePixelDollProfile(chatId);

  const stamp = nowIso();
  const giftId = await db.pixelDollGifts.add({
    chatId,
    from: 'user',
    to: 'char',
    gift,
    label,
    status: 'pending',
    replyText: '',
    createdAt: stamp,
    resolvedAt: null,
  });

  await insertGiftChatMessage({
    chatId,
    sender: 'user',
    content: `给你的像素小人送了一件礼物：${label}`,
    metadata: { giftId, label, direction: 'user_to_char', status: 'pending' },
  });

  await trimGifts(chatId);
  return getGift(giftId);
};

const FALLBACK_ACCEPT = '谢谢，我现在就换上。';
const FALLBACK_DECLINE = '谢谢你，不过这次我先收着，下次再穿。';

// 角色决定了：accepted 为 true 就穿上，否则婉拒。replyText 是角色自己说的
// 话（AI 生成，没有就用兜底句）。同样写一条角色消息进聊天。
export const resolveGiftByCharacter = async (giftId, { accepted, replyText } = {}) => {
  const gift = await getGift(giftId);
  if (!gift || gift.status !== 'pending') return null;

  const reply = (replyText || '').trim() || (accepted ? FALLBACK_ACCEPT : FALLBACK_DECLINE);

  if (accepted) {
    await wearGift(gift.chatId, 'char', gift.gift);
  }

  await db.pixelDollGifts.update(giftId, {
    status: accepted ? 'worn' : 'declined',
    replyText: reply,
    resolvedAt: nowIso(),
  });

  await insertGiftChatMessage({
    chatId: gift.chatId,
    sender: 'character',
    content: reply,
    metadata: {
      giftId,
      label: gift.label,
      direction: 'char_reply',
      accepted: Boolean(accepted),
    },
  });

  return getGift(giftId);
};

const FALLBACK_CHAR_GIFT = '给你的小人挑了一件，换上看看吧。';

// 角色主动送用户一件：直接穿到用户的小人身上，记一条记录，再写一条角色
// 消息。noteText 是角色自己说的话（AI 生成）。
export const giveGiftToUser = async (chatId, gift, { noteText } = {}) => {
  const customParts = await loadCustomParts(chatId);
  const label = describeGift(gift, customParts);
  if (!gift || !label) return null;

  const profile = await ensurePixelDollProfile(chatId);
  await wearGift(chatId, 'user', gift);

  const stamp = nowIso();
  const note = (noteText || '').trim() || FALLBACK_CHAR_GIFT;

  const giftId = await db.pixelDollGifts.add({
    chatId,
    from: 'char',
    to: 'user',
    gift,
    label,
    status: 'worn',
    replyText: note,
    createdAt: stamp,
    resolvedAt: stamp,
  });

  await db.pixelDollProfiles.update(profile.id, { lastCharGiftAt: stamp, updatedAt: stamp });

  await insertGiftChatMessage({
    chatId,
    sender: 'character',
    content: note,
    metadata: { giftId, label, direction: 'char_to_user', accepted: true },
  });

  await trimGifts(chatId);
  return getGift(giftId);
};

// 角色或用户给自己的小人换了新身形之类、不属于"礼物"的变化，也想在记录里
// 留一笔时用。只写记录，不写聊天消息。
export const logPixelDollEvent = async (chatId, { from, label, status = 'worn' }) => {
  const stamp = nowIso();
  const giftId = await db.pixelDollGifts.add({
    chatId,
    from,
    to: from,
    gift: null,
    label,
    status,
    replyText: '',
    createdAt: stamp,
    resolvedAt: stamp,
  });
  await trimGifts(chatId);
  return getGift(giftId);
};