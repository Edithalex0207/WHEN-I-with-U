/*
 * plushPlayService.js —— 陪小伙伴玩娃娃的结算。
 *
 * 【规则】
 * - 只有已经抓到（companionInventory 里有 category:'clawPrize' 那一行）的
 *   娃娃才能玩。
 * - 每只娃娃单独冷却 PLUSH_PLAY_COOLDOWN_HOURS 小时，冷却时间记在那一行的
 *   lastPlayedAt 上（不加索引的普通字段，不用改 db 版本）。
 * - 玩一次：按这款娃娃的 effects 加心情/饱食/整洁/心心，各自限制在 0-100
 *   （心心不设上限），再写一条动态日志。娃娃是干净的，所以不像玩具那样扣
 *   整洁度。
 * - 语录按「玩之前」的状态挑：饱食低于阈值用「饿了」，否则整洁低于阈值
 *   用「脏了」，都没有就用「正常」。
 * - 流星仔玩一次有一定概率给小伙伴记一次免费抓娃娃机会
 *   （companion.clawFreePlays，普通字段，不用改库版本），这个次数在
 *   companionClawService.js 的 startClawPlay 里被消耗。
 *
 * 跟 companionClawService.js 一样，不 import companionService.js（避免循环
 * 依赖），要动 companion 的地方直接操作 db.companions。
 */

import db from '../../../db';
import {
  PLUSH_PLAY_COOLDOWN_HOURS,
  PLUSH_LOW_STAT_THRESHOLD,
  findPlushPlay,
} from './plushPlayData';

const CLAW_PRIZE_CATEGORY = 'clawPrize';
const COOLDOWN_MS = PLUSH_PLAY_COOLDOWN_HOURS * 3600 * 1000;

const clamp100 = (value) => Math.max(0, Math.min(100, Math.round(value)));
const round1 = (value) => Math.round(value * 10) / 10;
const pickRandom = (pool) => pool[Math.floor(Math.random() * pool.length)];

/*
 * 根据玩之前的状态挑一句语录（纯函数，不碰数据库）。
 */
export const pickPlushLine = (companion, itemId) => {
  const config = findPlushPlay(itemId);
  if (!config) return '';

  if ((companion?.satiety ?? 100) < PLUSH_LOW_STAT_THRESHOLD) return pickRandom(config.lines.hungry);
  if ((companion?.cleanliness ?? 100) < PLUSH_LOW_STAT_THRESHOLD) return pickRandom(config.lines.dirty);
  return pickRandom(config.lines.normal);
};

const getOwnedRow = (companionId, itemId) => (
  db.companionInventory
    .where({ companionId, category: CLAW_PRIZE_CATEGORY })
    .filter((row) => row.itemId === itemId)
    .first()
);

const remainingMsOf = (row, now = Date.now()) => {
  if (!row?.lastPlayedAt) return 0;
  return Math.max(0, COOLDOWN_MS - (now - row.lastPlayedAt));
};

/*
 * 图鉴用：一次性取回所有已拥有娃娃的剩余冷却时间。
 * 返回 { [itemId]: remainingMs }，只包含已经拥有的娃娃；0 表示现在能玩。
 */
export const getPlushCooldowns = async (companionId) => {
  if (!companionId) return {};

  const rows = await db.companionInventory
    .where({ companionId, category: CLAW_PRIZE_CATEGORY })
    .toArray();
  const now = Date.now();

  return rows.reduce((map, row) => {
    map[row.itemId] = remainingMsOf(row, now);
    return map;
  }, {});
};

/*
 * 陪小伙伴玩一次。
 *
 * 在冷却中：不改任何东西，返回
 *   { played: false, remainingMs, feedbackText, companion }
 * 玩成功：返回
 *   { played: true, companion, feedbackText, delta, freePlayGranted, config }
 *   delta 是实际增加的数值（已经算过上限），UI 用来飘 +心情 之类的小字。
 */
export const playWithPlush = async (companionId, itemId) => {
  const config = findPlushPlay(itemId);
  if (!config) throw new Error('这只娃娃还不会玩哦');

  const companion = await db.companions.get(companionId);
  if (!companion) throw new Error('小伙伴不存在');

  const row = await getOwnedRow(companionId, itemId);
  if (!row) throw new Error('你还没有这只娃娃');

  const now = Date.now();
  const remainingMs = remainingMsOf(row, now);
  if (remainingMs > 0) {
    return { played: false, remainingMs, feedbackText: config.lines.rest, companion };
  }

  const feedbackText = pickPlushLine(companion, itemId);
  const effects = config.effects || {};

  const next = {
    mood: clamp100((companion.mood ?? 0) + (effects.mood || 0)),
    satiety: clamp100((companion.satiety ?? 0) + (effects.satiety || 0)),
    cleanliness: clamp100((companion.cleanliness ?? 100) + (effects.cleanliness || 0)),
    hearts: round1((companion.hearts || 0) + (effects.hearts || 0)),
  };

  const delta = {
    mood: next.mood - (companion.mood ?? 0),
    satiety: next.satiety - (companion.satiety ?? 0),
    cleanliness: next.cleanliness - (companion.cleanliness ?? 100),
    hearts: round1(next.hearts - (companion.hearts || 0)),
  };

  const freePlayGranted = Boolean(config.freePlayChance) && Math.random() < config.freePlayChance;

  await db.companions.update(companionId, {
    ...next,
    clawFreePlays: (companion.clawFreePlays || 0) + (freePlayGranted ? 1 : 0),
    lastInteractionAt: now,
    updatedAt: now,
    totalInteractionCount: (companion.totalInteractionCount || 0) + 1,
  });
  await db.companionInventory.update(row.id, { lastPlayedAt: now });
  await db.companionLogs.add({
    companionId,
    logType: 'user_action',
    actionType: 'plush_play',
    content: freePlayGranted && config.freePlayLine
      ? `${feedbackText}${config.freePlayLine}`
      : feedbackText,
    timestamp: now,
  });

  return {
    played: true,
    companion: await db.companions.get(companionId),
    feedbackText: freePlayGranted && config.freePlayLine
      ? `${feedbackText}${config.freePlayLine}`
      : feedbackText,
    delta,
    freePlayGranted,
    config,
  };
};