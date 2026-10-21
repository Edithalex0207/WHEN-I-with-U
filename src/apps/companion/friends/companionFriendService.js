/*
 * companionFriendService.js —— "好友广场 + 我的朋友"核心逻辑（蹭饭见
 * companionFriendMealService.js，另开一个文件，不往这里塞）。
 *
 * 数据：全部是 db.companions 上"不建索引"的新字段，不升级 schema 版本
 * （跟 custody 的约定一致）：
 *   companion.friendPlaza  当前广场候选数组，见 FriendCandidate 的注释
 *   companion.friends      好友数组，见 FriendRecord 的注释
 *
 * 依赖方向：本文件 import companionFriendAiService.js / 头像池 /
 * companionShopData.js（送礼要知道道具名字/类别）；反过来它们都不
 * import 本文件。送礼直接操作 db.companionBackpack 本身，不 import
 * companionBackpackService.js 的 useBackpackItem——那边是"自己用掉道具、
 * 加到 companion 自己的数值上"，这边是"转手送给朋友"，是两件不同的事，
 * 混用会把送礼也加到小伙伴自己的饱食度/心情上，不对。
 * 调度入口 runFriendTick 由 scheduledMessageService.js 现有的 60 秒
 * 调度器顺路调用，写法照抄 companionCustodyService.js 的 runCustodyTick。
 */

import db from '../../../db';
import { findShopItem } from '../companionShopData';
import { pickRandomAvatar } from './companionFriendAvatars';
import { EXTRA_NPC_ROSTER, pickRosterExamples } from './companionFriendRoster';
import {
  generateFriendCandidates,
  generateFriendReplyText,
} from './companionFriendAiService';
import { generateFriendStory } from './companionFriendStoryAiService';
import { hasDecidingInbox, processInboxDecisions } from './companionFriendInboxService';
import { pickFallbackStory } from './companionFriendStoryData';

// ---- 常量：全部写成常量方便以后调 ----
export const PLAZA_SIZE = 4;
export const REQUEST_WAIT_MS = 10 * 60 * 1000; // 好友申请最少等待 10 分钟才有回复
export const DECLINE_RETRY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 婉拒后 24 小时才能再申请
export const DAILY_SOCIAL_QUOTA = 3; // 每个朋友每天共 3 次（互动/送礼/串门三选一混用）
export const FRIENDSHIP_DELTA = { talk: 3, gift: 8, visit: 5 };
export const FRIEND_MEAL_THRESHOLD = 50; // 友谊值 >= 50 解锁"蹭饭"

// 留言内容影响婉拒概率：没写 / 太短 / 写得用心，三档。
const SHORT_NOTE_CHAR_LIMIT = 8;
const DECLINE_PROBABILITY = { empty: 0.45, short: 0.3, good: 0.15 };

const TICK_MIN_GAP_MS = 60 * 1000; // 调度器最少间隔，避免短时间内重复查库

const todayDateStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/*
 * FriendCandidate（companion.friendPlaza 的一项）：
 *   id, avatarId, name, k1, k2, declaration,
 *   status: 'idle' | 'pending' | 'accepted' | 'declined',
 *   userNote, sentAt, repliedAt, replyText, declinedAt
 *
 * FriendRecord（companion.friends 的一项）：
 *   id（沿用申请时的 id）, avatarId, name, k1, k2, declaration,
 *   friendship（0-100）, daily:{ dateStr, used }, lastStory:{text,label}|null,
 *   createdAt
 */

// ---- AI 生成失败时的本地兜底候选池（纯文字，头像另外从头像池抽）----
const FALLBACK_NPC_POOL = [
  { name: '隙隙', k1: '爱吃', k2: '话多', declaration: '我家糖罐永远是满的，来了就别想空着肚子走！' },
  { name: '渺渺', k1: '安静', k2: '爱睡', declaration: '我不太会说话，但是会一直在你身边晒太阳。' },
  { name: '团团', k1: '活泼', k2: '贪玩', declaration: '草地、小河、大太阳，缺的就是一起滚的你！' },
  { name: '绒绒', k1: '害羞', k2: '细心', declaration: '我有点怕生，但我会偷偷把最喜欢的玩具分给你。' },
  { name: '年年', k1: '好奇', k2: '爱捡', declaration: '口袋里全是我捡来的宝贝，可以拿一件换你的故事。' },
  { name: '穗穗', k1: '温柔', k2: '会做饭', declaration: '小厨房二十四小时营业，专治各种没精神。' },
  { name: '嘟嘟', k1: '贪睡', k2: '随和', declaration: '醒着的时候陪你，睡着的时候也请别走远。' },
  { name: '桃桃', k1: '爱笑', k2: '热心', declaration: '我笑点很低，所以和我做朋友会很容易开心。' },
];

const ACCEPT_FALLBACKS = [
  '很高兴认识你，以后常来找我玩呀。',
  '谢谢你愿意来认识我，交到朋友了！',
  '好呀好呀，以后我们就是朋友啦。',
];
const DECLINE_FALLBACKS = [
  '谢谢你愿意认识我，不过我现在还没准备好，可以再等等我吗？',
  '有点害羞，暂时还不太敢交新朋友，下次再试试好吗。',
  '最近有点忙，要不我们晚一点再认识？',
];
const pickRandom = (pool) => pool[Math.floor(Math.random() * pool.length)];

/*
 * 按规则（留言内容）决定这次申请的结果：true=同意，false=婉拒。
 * 纯本地规则判断，不调 AI——AI 只负责把已经定好的结果写成一句回复。
 */
const decideFriendRequestOutcome = (userNote) => {
  const trimmed = String(userNote || '').trim();
  const probability = trimmed.length === 0
    ? DECLINE_PROBABILITY.empty
    : trimmed.length < SHORT_NOTE_CHAR_LIMIT
      ? DECLINE_PROBABILITY.short
      : DECLINE_PROBABILITY.good;
  return Math.random() >= probability;
};

/*
 * 生成 count 个新候选（AI 优先，兜底池补齐），自动从头像池挑头像、
 * 避开 excludeNames 里的名字。返回的候选 status 全部是 'idle'。
 */
const buildFreshCandidates = async (count, excludeNames) => {
  if (count <= 0) return [];

  let textPool = [];
  try {
    textPool = await generateFriendCandidates(count, excludeNames, pickRosterExamples(3));
  } catch (error) {
    console.warn('[CompanionFriend] AI 生成候选失败，退回本地兜底池:', error);
  }

  const usedNames = new Set(excludeNames);
  const picked = [];

  for (const item of textPool) {
    if (picked.length >= count) break;
    if (usedNames.has(item.name)) continue;
    usedNames.add(item.name);
    picked.push(item);
  }

  // 不够就从本地兜底池补齐，同样避开已用过的名字。
  const fallbackShuffled = [...FALLBACK_NPC_POOL, ...EXTRA_NPC_ROSTER].sort(() => Math.random() - 0.5);
  for (const item of fallbackShuffled) {
    if (picked.length >= count) break;
    if (usedNames.has(item.name)) continue;
    usedNames.add(item.name);
    picked.push(item);
  }

  const usedAvatarIds = [];
  return picked.map((item) => {
    const avatar = pickRandomAvatar(usedAvatarIds);
    usedAvatarIds.push(avatar.id);
    return {
      id: genId(),
      avatarId: avatar.id,
      name: item.name,
      k1: item.k1,
      k2: item.k2,
      declaration: item.declaration,
      status: 'idle',
      userNote: null,
      sentAt: null,
      repliedAt: null,
      replyText: null,
      declinedAt: null,
    };
  });
};

/*
 * 读取（必要时初始化）好友广场。第一次进来（friendPlaza 还没有数据）
 * 会自动生成满 4 张候选——这是"首次填充"，不是"自动刷新"，往后
 * 只有用户点"换一批"才会再生成新的。
 */
export const getFriendPlazaView = async (companionId) => {
  const companion = await db.companions.get(companionId);
  if (!companion) return [];

  if (Array.isArray(companion.friendPlaza) && companion.friendPlaza.length > 0) {
    return companion.friendPlaza;
  }

  const existingFriendNames = (companion.friends || []).map((f) => f.name);
  const fresh = await buildFreshCandidates(PLAZA_SIZE, existingFriendNames);

  await db.companions.update(companionId, { friendPlaza: fresh, updatedAt: Date.now() });
  return fresh;
};

/*
 * 换一批：只替换还没申请的（status: 'idle'）候选，等待中/已回复的
 * 卡片留在原位——跟视觉预览 v2 的 deal() 逻辑一致。
 */
export const rerollFriendPlaza = async (companionId) => {
  const companion = await db.companions.get(companionId);
  if (!companion) return [];

  const current = Array.isArray(companion.friendPlaza) ? companion.friendPlaza : [];
  const kept = current.filter((c) => c.status !== 'idle');
  const needed = Math.max(0, PLAZA_SIZE - kept.length);

  const excludeNames = [
    ...(companion.friends || []).map((f) => f.name),
    ...kept.map((c) => c.name),
  ];
  const fresh = await buildFreshCandidates(needed, excludeNames);

  const next = [...kept, ...fresh];
  await db.companions.update(companionId, { friendPlaza: next, updatedAt: Date.now() });
  return next;
};

/*
 * 发送好友申请：只有 status 'idle' 的候选能发。userNote 选填，
 * 裁到合理长度（UI 上限 40 字，这里再兜一道底防止异常输入）。
 */
export const sendFriendRequest = async (companionId, candidateId, userNote) => {
  const companion = await db.companions.get(companionId);
  if (!companion) throw new Error('小伙伴不存在');

  const plaza = companion.friendPlaza || [];
  const index = plaza.findIndex((c) => c.id === candidateId);
  if (index === -1) throw new Error('这张名片卡好像已经不在广场上了。');
  if (plaza[index].status !== 'idle') throw new Error('这张名片卡已经申请过了。');

  const now = Date.now();
  const next = [...plaza];
  next[index] = {
    ...next[index],
    status: 'pending',
    userNote: String(userNote || '').trim().slice(0, 60) || null,
    sentAt: now,
    repliedAt: null,
    replyText: null,
    declinedAt: null,
  };

  await db.companions.update(companionId, { friendPlaza: next, updatedAt: now });
  return next[index];
};

/*
 * 婉拒之后重新申请：要求已经过了 DECLINE_RETRY_COOLDOWN_MS 冷却时间，
 * 没到就抛错（文案里带上还剩多久，方便 UI 直接展示）。
 */
export const retryFriendRequest = async (companionId, candidateId, userNote) => {
  const companion = await db.companions.get(companionId);
  if (!companion) throw new Error('小伙伴不存在');

  const plaza = companion.friendPlaza || [];
  const index = plaza.findIndex((c) => c.id === candidateId);
  if (index === -1) throw new Error('这张名片卡好像已经不在广场上了。');

  const candidate = plaza[index];
  if (candidate.status !== 'declined') throw new Error('这张名片卡现在不能重新申请。');

  const now = Date.now();
  const readyAt = (candidate.declinedAt || 0) + DECLINE_RETRY_COOLDOWN_MS;
  if (now < readyAt) {
    const leftMs = readyAt - now;
    throw new Error(`还要再等 ${Math.ceil(leftMs / 60000)} 分钟才能重新申请。`);
  }

  const next = [...plaza];
  next[index] = {
    ...candidate,
    status: 'pending',
    userNote: String(userNote || '').trim().slice(0, 60) || null,
    sentAt: now,
    repliedAt: null,
    replyText: null,
    declinedAt: null,
  };

  await db.companions.update(companionId, { friendPlaza: next, updatedAt: now });
  return next[index];
};

/*
 * 到时间后处理一个"等待回复"的候选：本地规则先定同意/婉拒，
 * AI 负责把结果写成一句回复（AI 失败就退回固定文案）；同意的话
 * 顺手把它加进 companion.friends。返回处理后的 { plaza, friends }，
 * 调用方（runFriendTick）负责一次性写回数据库。
 */
const resolveOneCandidate = async (companion, candidate) => {
  const accepted = decideFriendRequestOutcome(candidate.userNote);
  const now = Date.now();

  let replyText = null;
  try {
    replyText = await generateFriendReplyText({ npc: candidate, userNote: candidate.userNote, accepted });
  } catch (error) {
    console.warn('[CompanionFriend] AI 生成回复失败，退回本地兜底文案:', error);
  }
  if (!replyText) {
    replyText = pickRandom(accepted ? ACCEPT_FALLBACKS : DECLINE_FALLBACKS);
  }

  const resolvedCandidate = {
    ...candidate,
    status: accepted ? 'accepted' : 'declined',
    repliedAt: now,
    replyText,
    declinedAt: accepted ? null : now,
  };

  let newFriend = null;
  if (accepted) {
    newFriend = {
      id: candidate.id,
      avatarId: candidate.avatarId,
      name: candidate.name,
      k1: candidate.k1,
      k2: candidate.k2,
      declaration: candidate.declaration,
      friendship: 0,
      daily: { dateStr: todayDateStr(), used: 0 },
      lastStory: null,
      createdAt: now,
    };
  }

  return { resolvedCandidate, newFriend };
};

const runningIds = new Set();

/*
 * 对一只小伙伴处理所有到期的好友申请。同一只同时只跑一轮，
 * 出错只打日志，绝不往外抛（供 runFriendTick 批量调用）。
 */
const processCompanionFriendRequests = async (companionId) => {
  if (runningIds.has(companionId)) return;
  runningIds.add(companionId);

  try {
    const companion = await db.companions.get(companionId);
    if (!companion) return;

    const plaza = companion.friendPlaza || [];
    const now = Date.now();
    const duePending = plaza.filter((c) => c.status === 'pending' && (c.sentAt || 0) + REQUEST_WAIT_MS <= now);
    if (duePending.length === 0) return;

    const nextPlaza = [...plaza];
    const newFriends = [];

    for (const candidate of duePending) {
      const { resolvedCandidate, newFriend } = await resolveOneCandidate(companion, candidate);
      const idx = nextPlaza.findIndex((c) => c.id === candidate.id);
      if (idx !== -1) nextPlaza[idx] = resolvedCandidate;
      if (newFriend) newFriends.push(newFriend);
    }

    if (newFriends.length === 0) {
      await db.companions.update(companionId, { friendPlaza: nextPlaza, updatedAt: now });
      return;
    }

    const fresh = await db.companions.get(companionId);
    const mergedFriends = [...(fresh.friends || []), ...newFriends];
    await db.companions.update(companionId, {
      friendPlaza: nextPlaza,
      friends: mergedFriends,
      updatedAt: now,
    });
  } catch (error) {
    console.error('[CompanionFriend] 处理好友申请失败:', error);
  } finally {
    runningIds.delete(companionId);
  }
};

let lastTickAt = 0;

/*
 * 调度入口：挂在 scheduledMessageService.js 现有的 60 秒 + 切回前台
 * 调度器上，不新增任何定时器，写法照抄 companionCustodyService.js
 * 的 runCustodyTick。只处理有"等待中"好友申请的小伙伴。
 */
export const runFriendTick = async () => {
  const now = Date.now();
  if (now - lastTickAt < TICK_MIN_GAP_MS) return;
  lastTickAt = now;

  try {
    const companions = await db.companions.toArray();
    for (const companion of companions) {
      const hasPending = (companion.friendPlaza || []).some((c) => c.status === 'pending');
      if (hasPending) {
        await processCompanionFriendRequests(companion.id);
      }
      // 用户在信箱里"交给小伙伴决定"的信，到点后顺路处理（见 companionFriendInboxService.js）。
      if (hasDecidingInbox(companion)) {
        await processInboxDecisions(companion.id);
      }
    }
  } catch (error) {
    console.error('[CompanionFriend] 好友申请巡检失败:', error);
  }
};

// ---- 我的朋友：互动 / 送礼 / 串门，三个按钮共用每个朋友每天 3 次额度 ----

const clamp100 = (value) => Math.max(0, Math.min(100, Math.round(value)));

// 互动/串门的 AI 长短文失败时的本地兜底，已搬到 companionFriendStoryData.js
// 的 pickFallbackStory（每条 100 字以上）。送礼反应仍走下面的固定文案池，
// 已跟用户确认不调 AI，省 token。
const GIFT_REACTION_TEXTS = {
  food: ['眼睛一下子亮了，立刻拆开吃了起来。', '闻了闻，满意地眯起眼睛收下了。', '开心地抱着礼物转了个圈。'],
  clean: ['好奇地研究了一下，很喜欢这个礼物。', '用了用，整个人都精神了。', '捧在手里爱不释手。'],
  toy: ['立刻抱着玩具玩了起来，根本停不下来。', '眼睛发光，马上试了试新玩具。', '开心地蹦跳着收下了。'],
  default: ['收到礼物，笑得眼睛都眯起来了。', '很惊喜，连声说谢谢。'],
};

// 每个朋友每天的额度，跟好友申请那边的 todayDateStr 同一套逻辑：
// 不是今天的记录就当作"今天还没用过"。
const getOrResetFriendDaily = (friend) => {
  const dateStr = todayDateStr();
  return friend.daily?.dateStr === dateStr ? friend.daily : { dateStr, used: 0 };
};

// 供 UI 判断按钮要不要变灰。
export const isFriendSocialExhausted = (friend) => (
  (getOrResetFriendDaily(friend).used || 0) >= DAILY_SOCIAL_QUOTA
);

/*
 * 互动/送礼/串门落地的最后一步：扣额度、加友谊值（封顶 100）、覆盖
 * lastStory（已确认不存档，只留最新一条）。调用方已经自己处理完
 * "这次具体要做什么"（AI 短文/送礼扣背包），这里只管写数据。
 */
const applyFriendSocialResult = async (companionId, friendId, { friendshipDelta, lastStory }) => {
  const companion = await db.companions.get(companionId);
  if (!companion) throw new Error('小伙伴不存在');

  const friends = companion.friends || [];
  const index = friends.findIndex((f) => f.id === friendId);
  if (index === -1) throw new Error('这位朋友不见了。');

  const friend = friends[index];
  const daily = getOrResetFriendDaily(friend);
  if ((daily.used || 0) >= DAILY_SOCIAL_QUOTA) {
    throw new Error('今天跟这位朋友的互动次数已经用完啦，明天再来吧。');
  }

  const next = [...friends];
  next[index] = {
    ...friend,
    friendship: clamp100(friend.friendship + friendshipDelta),
    daily: { dateStr: daily.dateStr, used: (daily.used || 0) + 1 },
    lastStory,
  };

  await db.companions.update(companionId, { friends: next, updatedAt: Date.now() });
  return next[index];
};

/*
 * 互动（+3 友谊值）：调 AI 生成一段"小伙伴和朋友聊天/互动"的短文，
 * AI 失败就退回本地兜底池。
 */
export const interactWithFriend = async (companionId, friendId) => {
  const companion = await db.companions.get(companionId);
  const friend = (companion?.friends || []).find((f) => f.id === friendId);
  if (!friend) throw new Error('这位朋友不见了。');
  if (isFriendSocialExhausted(friend)) throw new Error('今天跟这位朋友的互动次数已经用完啦，明天再来吧。');

  let text = null;
  try {
    text = await generateFriendStory({ companion, friend, mode: 'talk' });
  } catch (error) {
    console.warn('[CompanionFriend] AI 生成互动短文失败，退回本地兜底:', error);
  }
  if (!text) text = pickFallbackStory('talk', { petName: companion.name, friendName: friend.name });

  return applyFriendSocialResult(companionId, friendId, {
    friendshipDelta: FRIENDSHIP_DELTA.talk,
    lastStory: { text, label: '聊了一会儿' },
  });
};

/*
 * 串门（+5 友谊值）：调 AI 生成一段"小伙伴去朋友家串门玩耍"的短文，
 * AI 失败就退回本地兜底池。
 */
export const visitFriend = async (companionId, friendId) => {
  const companion = await db.companions.get(companionId);
  const friend = (companion?.friends || []).find((f) => f.id === friendId);
  if (!friend) throw new Error('这位朋友不见了。');
  if (isFriendSocialExhausted(friend)) throw new Error('今天跟这位朋友的互动次数已经用完啦，明天再来吧。');

  let text = null;
  try {
    text = await generateFriendStory({ companion, friend, mode: 'visit' });
  } catch (error) {
    console.warn('[CompanionFriend] AI 生成串门短文失败，退回本地兜底:', error);
  }
  if (!text) text = pickFallbackStory('visit', { petName: companion.name, friendName: friend.name });

  return applyFriendSocialResult(companionId, friendId, {
    friendshipDelta: FRIENDSHIP_DELTA.visit,
    lastStory: { text, label: '串门记' },
  });
};

/*
 * 送礼（+8 友谊值）：从背包里挑一件送出，数量 -1；反应文案走固定
 * 文案池（已确认不调 AI），按道具类别（food/clean/toy）挑一句。
 * 额度检查放在真的扣背包之前，避免"额度用完了但东西已经送出去"。
 */
export const giftToFriend = async (companionId, friendId, itemId) => {
  const companion = await db.companions.get(companionId);
  const friend = (companion?.friends || []).find((f) => f.id === friendId);
  if (!friend) throw new Error('这位朋友不见了。');
  if (isFriendSocialExhausted(friend)) throw new Error('今天跟这位朋友的互动次数已经用完啦，明天再来吧。');

  const row = await db.companionBackpack.where({ companionId, itemId }).first();
  if (!row || (row.quantity || 0) <= 0) throw new Error('背包里没有这个东西了。');

  const item = findShopItem(itemId);
  if (!item) throw new Error('这件道具的数据不见了，没法送出。');

  if ((row.quantity || 0) <= 1) {
    await db.companionBackpack.delete(row.id);
  } else {
    await db.companionBackpack.update(row.id, { quantity: row.quantity - 1 });
  }

  const pool = GIFT_REACTION_TEXTS[item.category] || GIFT_REACTION_TEXTS.default;
  const text = pickRandom(pool);

  return applyFriendSocialResult(companionId, friendId, {
    friendshipDelta: FRIENDSHIP_DELTA.gift,
    lastStory: { text, label: `送出了「${item.name}」` },
  });
};

/*
 * dock 红色数字角标：今天还没在 3 次社交额度里用完的好友数。
 * 没有好友时返回 0（UI 那边 0 就不显示角标）。纯同步计算，
 * 不查库——直接从已经加载好的 companion 对象算。
 */
export const getFriendDockBadgeCount = (companion) => {
  const friends = companion?.friends || [];
  if (friends.length === 0) return 0;
  return friends.filter((f) => !isFriendSocialExhausted(f)).length;
};

/*
 * 好友页用来"刷新一下 companion 对象"的轻量读取——不像 reload() 那样
 * 还要顺带查日志/背包/事件，好友页的操作（发申请/换一批/……）之后
 * 只需要拿到最新的 friendPlaza/friends 就够了。
 */
export const getCompanionSnapshot = (companionId) => db.companions.get(companionId);