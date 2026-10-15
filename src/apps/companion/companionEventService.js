/*
 * "小伙伴"特殊事件——判定/发放/领取逻辑。数据目录在 companionEventData.js，
 * 这里只负责：组装判定用的上下文、按顺序过一遍事件定义、把命中的事件写进
 * companion.activeEvents、以及用户点开事件卡片后的"领取"处理。
 *
 * 跟衰减/喂食逻辑一样，完全是新写的一份，不 import src/apps/pet/ 或
 * src/apps/habitat/ 的任何代码。
 *
 * 【用户确认过的规则】
 *   - 每次最多同时展示 2 个未处理的事件（activeEvents 里未过期的数量
 *     达到 2 就不再判定新的）。
 *   - 事件自然存在 3 天（按自然日，从触发当天 0 点算起，第 4 天 0 点
 *     就自动消失，不管有没有被领取）。
 *   - 判定本身在打开小伙伴页面时触发，但同一只宠物不会每次挂载都重新
 *     判定一遍——至少间隔 EVENT_ROLL_COOLDOWN_MS 才会重新判定一次，
 *     避免来回切页面把概率事件刷爆。
 */

import db from '../../db';
import {
  CHOICE_EVENTS,
  EVENT_KINDS,
  findEventDef,
  FLAVOR_EVENTS,
  LEGENDARY_GRANT_EVENTS,
  RARE_UNLOCK_EVENTS,
} from './companionEventData';
import { findShopItem } from './companionShopData';
import { generateDiaryEntry } from './diary/companionDiaryService';

const MAX_ACTIVE_EVENTS = 2;
const EVENT_ACTIVE_DAYS = 3; // 自然日
const EVENT_ROLL_COOLDOWN_MS = 25 * 60 * 1000; // 25 分钟
const MIN_LEGENDARY_GRANT_GAP_HOURS = 20;

const clamp100 = (value) => Math.max(0, Math.min(100, Math.round(value)));

const hoursSince = (timestamp, now = Date.now()) => {
  if (!timestamp) return Infinity;
  return (now - timestamp) / 3600000;
};

const daysSince = (timestamp, now = Date.now()) => {
  if (!timestamp) return Infinity;
  return (now - timestamp) / 86400000;
};

// 事件在"触发当天 0 点 + EVENT_ACTIVE_DAYS 天"的 0 点自动消失，
// 即触发当天 + 之后 2 个完整自然日都还看得见，第 4 天就没了。
const computeExpiresAt = (triggeredAt) => {
  const d = new Date(triggeredAt);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + EVENT_ACTIVE_DAYS);
  return d.getTime();
};

const getActiveEventsRaw = (companion) => companion.activeEvents || [];

// 未过期（不管有没有被领取）的事件列表，给 UI 展示用。
export const getActiveEvents = (companion, now = Date.now()) => (
  getActiveEventsRaw(companion).filter((event) => event.expiresAt > now)
);

const buildEventContext = (companion, now) => ({
  mood: companion.mood ?? 80,
  satiety: companion.satiety ?? 80,
  hearts: companion.hearts ?? 0,
  daysSinceAdopt: daysSince(companion.createdAt, now),
  daysSinceLastOpen: daysSince(companion.lastPageOpenAt, now),
  moodFullStreak: companion.moodFullStreak || 0,
  cleanActionCount: companion.cleanActionCount || 0,
  feedCount: companion.feedCount || 0,
  totalInteractionCount: companion.totalInteractionCount || 0,
});

const rollProbability = (def, ctx) => {
  if (typeof def.getProbability === 'function') return Math.random() < def.getProbability(ctx);
  if (typeof def.probability === 'number') return Math.random() < def.probability;
  return true; // 没写概率的事件，条件满足就算命中（非随机、条件型）
};

const buildActiveEventEntry = (def, now) => ({
  id: `${def.id}-${now}-${Math.random().toString(36).slice(2, 7)}`,
  defId: def.id,
  kind: def.kind,
  title: def.title,
  bannerText: def.bannerText,
  grantsFoodId: def.grantsFoodId || null,
  // 选项事件：只把 id/label 放进 activeEvent 条目（给 UI 渲染选项按钮用），
  // 不带 outcomeText/reward——避免结果提前"剧透"，真正的结果只在用户选完
  // 之后才通过 findEventDef(entry.defId) 去 def.options 里查。
  options: def.kind === EVENT_KINDS.CHOICE
    ? (def.options || []).map((opt) => ({ id: opt.id, label: opt.label }))
    : null,
  chosenOptionId: null,
  resolvedText: null,
  createdAt: now,
  expiresAt: computeExpiresAt(now),
  claimed: false,
});

/*
 * 往聊天里插一句话（角色口吻），事件触发时的"开场白"和选项事件结算后的
 * "结果反应"共用这一个小工具，避免两处重复写同一段 db.messages.add 逻辑。
 */
const insertCompanionChatLine = async (companion, line, extraMetadata = {}) => {
  if (!line) return;

  const chat = await db.chats.get(companion.chatId);
  const character = chat ? await db.characters.get(chat.characterId) : null;
  if (!chat || !character) return;

  const timestampIso = new Date().toISOString();
  const metadata = { ...extraMetadata };

  await db.messages.add({
    chatId: companion.chatId,
    characterId: chat.characterId,
    sender: 'character',
    type: 'text',
    content: line,
    metadata,
    versions: [{ type: 'text', content: line, metadata, timestamp: timestampIso }],
    currentVersionIndex: 0,
    isRead: false,
    timestamp: timestampIso,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('new-local-message-inserted', { detail: { chatId: companion.chatId } })
    );
  }
};

/*
 * 核心判定：返回 { triggeredEvents, patch }。
 *   - triggeredEvents：这次新命中的事件（完整定义 + 生成的 activeEvent 条目），
 *     调用方用它们去插入聊天消息、决定要不要弹窗。
 *   - patch：需要写回 companion 记录的字段（activeEvents、
 *     unlockedRareFoodIds、legendaryStock、lastLegendaryGrantAt、
 *     firedMilestoneEventIds、lastEventRollAt 等）。
 *
 * 纯逻辑函数，不读写 db——方便以后要写测试。
 */
export const evaluateCompanionEvents = (companion, now = Date.now()) => {
  const activeEvents = getActiveEvents(companion, now);
  const triggeredEvents = [];

  const unlockedRareFoodIds = [...(companion.unlockedRareFoodIds || [])];
  const legendaryStock = { ...(companion.legendaryStock || {}) };
  const firedMilestoneEventIds = [...(companion.firedMilestoneEventIds || [])];
  let lastLegendaryGrantAt = companion.lastLegendaryGrantAt || null;

  const ctx = buildEventContext(companion, now);
  let slotsLeft = MAX_ACTIVE_EVENTS - activeEvents.length;

  const tryTrigger = (def) => {
    if (slotsLeft <= 0) return;
    if (def.isAutoRollable === false) return;
    if (def.oncePerLifetime && firedMilestoneEventIds.includes(def.id)) return;
    if (!def.check(ctx)) return;
    if (!rollProbability(def, ctx)) return;

    const entry = buildActiveEventEntry(def, now);
    triggeredEvents.push({ def, entry });
    activeEvents.push(entry);
    slotsLeft -= 1;

    if (def.oncePerLifetime) firedMilestoneEventIds.push(def.id);
  };

  // 稀有解锁：已经解锁过的食物不再重复判定。
  RARE_UNLOCK_EVENTS.forEach((def) => {
    if (unlockedRareFoodIds.includes(def.grantsFoodId)) return;
    tryTrigger(def);
  });

  // 传说发放：全局冷却，避免短时间内连续刷到。
  if (hoursSince(lastLegendaryGrantAt, now) >= MIN_LEGENDARY_GRANT_GAP_HOURS) {
    LEGENDARY_GRANT_EVENTS.forEach((def) => {
      if (slotsLeft <= 0) return;
      const before = triggeredEvents.length;
      tryTrigger(def);
      if (triggeredEvents.length > before) lastLegendaryGrantAt = now;
    });
  }

  // 选项事件：触发判定逻辑跟氛围事件一样随便触发，但命中之后不会立刻结算
  // 奖励——要等用户在卡片里选完一个选项才真正加数值，见
  // resolveCompanionChoiceEvent。
  CHOICE_EVENTS.forEach((def) => tryTrigger(def));

  // 氛围小事件：随便触发，不解锁/不发放任何东西。
  FLAVOR_EVENTS.forEach((def) => tryTrigger(def));

  // 把这次真正命中的"解锁/发放"事件落到对应的持久状态上。
  triggeredEvents.forEach(({ def }) => {
    if (def.kind === EVENT_KINDS.RARE_UNLOCK) {
      if (!unlockedRareFoodIds.includes(def.grantsFoodId)) {
        unlockedRareFoodIds.push(def.grantsFoodId);
      }
    } else if (def.kind === EVENT_KINDS.LEGENDARY_GRANT) {
      legendaryStock[def.grantsFoodId] = (legendaryStock[def.grantsFoodId] || 0) + 1;
    }
  });

  const patch = {
    activeEvents,
    unlockedRareFoodIds,
    legendaryStock,
    firedMilestoneEventIds,
    lastLegendaryGrantAt,
    lastEventRollAt: now,
  };

  return { triggeredEvents, patch };
};

/*
 * 打开小伙伴页面时调用：按冷却决定要不要真正判定一次，命中的事件会
 * 写进 db，并且（如果这个聊天窗能找到对应角色）往聊天里插一条角色的
 * 话——用的是跟 challengeService.js/interactionService.js 一样的
 * "直接 db.messages.add + dispatch 'new-local-message-inserted'"套路，
 * 不经过 aiService.js 的在线回复流程。
 *
 * 返回这次新出现的事件（完整带 title/bannerText 的那种，供页面弹窗用），
 * 没有新事件就返回空数组——调用方应该始终用 getActiveEvents(companion)
 * 来渲染"当前挂着的事件横幅"，这个返回值只用来决定"要不要自动弹一个
 * 新事件的详情弹窗"。
 */
export const checkCompanionEvents = async (companionId) => {
  const companion = await db.companions.get(companionId);
  if (!companion) return { companion: null, newEvents: [] };

  const now = Date.now();

  // 冷却内直接跳过判定，只做一次"过期事件自然消失"的轻量清理即可。
  if (hoursSince(companion.lastEventRollAt, now) < EVENT_ROLL_COOLDOWN_MS / 3600000) {
    return { companion, newEvents: [] };
  }

  const { triggeredEvents, patch } = evaluateCompanionEvents(companion, now);

  if (triggeredEvents.length === 0) {
    await db.companions.update(companionId, { lastEventRollAt: now });
    return { companion: { ...companion, lastEventRollAt: now }, newEvents: [] };
  }

  await db.companions.update(companionId, patch);
  const updated = { ...companion, ...patch };

  // 往聊天里插一句角色台词，让事件也能在聊天记录里看到。选项事件这里插
  // 的只是"开场白"（剧情设定），选完之后的结果反应是另一条独立消息，
  // 见 resolveCompanionChoiceEvent。
  try {
    for (const { def } of triggeredEvents) {
      const line = typeof def.characterLine === 'function'
        ? def.characterLine(companion.name)
        : def.characterLine;

      // eslint-disable-next-line no-await-in-loop
      await insertCompanionChatLine(companion, line, { companionEventId: def.id });

      // 日记：选项事件要等用户选完才知道"结果"，更值得写一篇，所以这里
      // 跳过，留给 resolveCompanionChoiceEvent 去写；其余几种事件触发
      // 当下就写一篇（用 title 当"发生了什么"，bannerText 当补充细节）。
      if (def.kind !== EVENT_KINDS.CHOICE) {
        // eslint-disable-next-line no-await-in-loop
        await generateDiaryEntry(companionId, {
          triggerDefId: def.id,
          triggerLabel: def.title,
          triggerDetail: def.bannerText,
        });
      }
    }
  } catch (error) {
    console.error('[CompanionEvent] 写入聊天消息/日记失败:', error);
  }

  return {
    companion: updated,
    newEvents: triggeredEvents.map(({ def, entry }) => ({ ...entry, bannerText: def.bannerText, title: def.title })),
  };
};

/*
 * 用户点开事件卡片领取：
 *   - flavor：按定义里的 reward 加一点数值/心心。
 *   - rare_unlock：食物已经在 evaluateCompanionEvents 命中时就解锁了，
 *     这里只是把卡片标记为"已领取"（纯 UI 状态，不影响解锁本身）。
 *   - legendary_grant：传说食物同理，已经在命中时发到库存里了，
 *     这里也只是标记已领取。
 */
export const claimCompanionEvent = async (companionId, activeEventId) => {
  const companion = await db.companions.get(companionId);
  if (!companion) return null;

  const activeEvents = getActiveEventsRaw(companion);
  const index = activeEvents.findIndex((event) => event.id === activeEventId);
  if (index === -1) return companion;

  const target = activeEvents[index];
  if (target.claimed) return companion;
  // 选项事件不走这条"直接领取"的路——必须先选一个选项，见
  // resolveCompanionChoiceEvent，这里直接跳过，不做任何改动。
  if (target.kind === EVENT_KINDS.CHOICE) return companion;

  const def = findEventDef(target.defId);
  const now = Date.now();

  let moodDelta = 0;
  let heartsDelta = 0;
  if (def?.kind === EVENT_KINDS.FLAVOR && def.reward) {
    moodDelta = def.reward.mood || 0;
    heartsDelta = def.reward.hearts || 0;
  }

  const nextActiveEvents = [...activeEvents];
  nextActiveEvents[index] = { ...target, claimed: true };

  const updated = {
    ...companion,
    activeEvents: nextActiveEvents,
    mood: clamp100((companion.mood ?? 80) + moodDelta),
    hearts: Math.round(((companion.hearts || 0) + heartsDelta) * 10) / 10,
    updatedAt: now,
  };

  await db.companions.put(updated);
  return updated;
};

/*
 * 选项事件专用的"领取"：用户在卡片里选了某个选项之后调用。
 *   - 按选中选项的 reward 加数值（mood/satiety/hearts，没写的字段按 0 算，
 *     不会出现惩罚性的倒扣）。
 *   - 选中选项的 outcomeText 当作角色对这次选择的反应，单独插一条聊天
 *     消息（跟触发时插的"开场白"是两条独立消息）。
 *   - activeEvent 条目标记为已选择/已领取，并记下 chosenOptionId/
 *     resolvedText，供 UI 在弹窗里展示"你选的是哪个、结果是什么"。
 *
 * 返回 { companion, outcomeText }；传入的 activeEventId 找不到、已经选过、
 * 或者压根不是选项事件，就原样返回 companion、outcomeText 为 null，
 * 调用方据此判断没有真正发生改变。
 */
export const resolveCompanionChoiceEvent = async (companionId, activeEventId, optionId) => {
  const companion = await db.companions.get(companionId);
  if (!companion) return { companion: null, outcomeText: null };

  const activeEvents = getActiveEventsRaw(companion);
  const index = activeEvents.findIndex((event) => event.id === activeEventId);
  if (index === -1) return { companion, outcomeText: null };

  const target = activeEvents[index];
  if (target.claimed || target.kind !== EVENT_KINDS.CHOICE) {
    return { companion, outcomeText: null };
  }

  const def = findEventDef(target.defId);
  const option = def?.options?.find((opt) => opt.id === optionId);
  if (!option) return { companion, outcomeText: null };

  const now = Date.now();
  const reward = option.reward || {};
  const resolvedText = typeof option.outcomeText === 'function'
    ? option.outcomeText(companion.name)
    : option.outcomeText;

  const nextActiveEvents = [...activeEvents];
  nextActiveEvents[index] = {
    ...target,
    claimed: true,
    chosenOptionId: optionId,
    resolvedText: resolvedText || null,
  };

  const updated = {
    ...companion,
    activeEvents: nextActiveEvents,
    mood: clamp100((companion.mood ?? 80) + (reward.mood || 0)),
    satiety: clamp100((companion.satiety ?? 80) + (reward.satiety || 0)),
    hearts: Math.round(((companion.hearts || 0) + (reward.hearts || 0)) * 10) / 10,
    updatedAt: now,
  };

  await db.companions.put(updated);

  try {
    await insertCompanionChatLine(updated, resolvedText, {
      companionEventId: def.id,
      companionEventChoice: optionId,
    });

    // 选项事件的日记放在"结果出来之后"写，这样日记里写的是真正发生的事，
    // 不是还没选的两个选项（避免剧透/日记内容跟最终结果对不上）。
    await generateDiaryEntry(companionId, {
      triggerDefId: def.id,
      triggerLabel: def.title,
      triggerDetail: resolvedText,
    });
  } catch (error) {
    console.error('[CompanionEvent] 选项结果写入聊天消息/日记失败:', error);
  }

  return { companion: updated, outcomeText: resolvedText || null };
};

export const findShopItemForEvent = (foodId) => findShopItem(foodId);