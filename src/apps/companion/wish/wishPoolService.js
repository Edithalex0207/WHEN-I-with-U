/**
 * wishPoolService.js
 *
 * 「心心许愿池」的数据层：每日次数记录的读写 + 一次投入的结算。
 * 完全独立新建，不 import companionService.js —— 照抄 catchService.js /
 * marblesService.js 的写法（直接读写 db.companions / db.companionLogs）。
 *
 * Dexie 表：wishPlays（db/index.js 里 db.version(98) 新增）
 *   id           自增主键
 *   companionId  关联的小伙伴 id
 *   dateStr      发生的日期 'YYYY-MM-DD'
 *   stake        这次投入的心心数
 *   outcomeKey   'win' | 'lose' | 'half' | 'jackpot'
 *   payout       拿回的心心数
 *   createdAt    时间戳
 *
 * 结果是在这里（服务层）抽的，不是界面抽的：投入扣除、结果抽取、返还
 * 加回、写记录全在同一个 Dexie 事务里完成，界面只负责演出。
 */

import { db } from '../../../db/index';
import {
  WISH_TIERS, WISH_DAILY_LIMIT, rollWishOutcome, wishPayout,
} from './wishPoolData';

const round1 = (n) => Math.round(n * 10) / 10;

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 读取今天已经许愿几次 + 当前心心数，给界面显示用。
 * @returns {{ usedToday:number, dailyLimit:number, hearts:number }}
 */
export async function getWishState(companionId) {
  if (!companionId) return { usedToday: 0, dailyLimit: WISH_DAILY_LIMIT, hearts: 0 };
  const [rows, companion] = await Promise.all([
    db.wishPlays.where('[companionId+dateStr]').equals([companionId, todayDateStr()]).toArray(),
    db.companions.get(companionId),
  ]);
  return {
    usedToday: rows.length,
    dailyLimit: WISH_DAILY_LIMIT,
    hearts: companion ? round1(companion.hearts || 0) : 0,
  };
}

/**
 * 投入 stake 颗心心并抽结果。
 * 次数用完 / 心心不够 / 档位不合法时会 throw（界面应该已经拦住了，这里是兜底）。
 * @returns {{ outcome:object, stake:number, payout:number, companion:object, usedToday:number, dailyLimit:number }}
 */
export async function submitWish(companionId, stake) {
  if (!companionId) throw new Error('缺少 companionId');
  if (!WISH_TIERS.includes(stake)) throw new Error('投入档位不合法');

  const today = todayDateStr();

  return db.transaction('rw', db.wishPlays, db.companions, db.companionLogs, async () => {
    const todaysRows = await db.wishPlays.where('[companionId+dateStr]').equals([companionId, today]).toArray();
    if (todaysRows.length >= WISH_DAILY_LIMIT) throw new Error('今天的许愿次数用完了');

    const companion = await db.companions.get(companionId);
    if (!companion) throw new Error('找不到小伙伴');
    if ((companion.hearts || 0) < stake) throw new Error('心心不够这一档');

    const outcome = rollWishOutcome();
    const payout = wishPayout(stake, outcome);
    const now = Date.now();

    const updated = {
      ...companion,
      hearts: round1((companion.hearts || 0) - stake + payout),
      updatedAt: now,
    };
    await db.companions.put(updated);

    await db.wishPlays.add({
      companionId, dateStr: today, stake, outcomeKey: outcome.key, payout, createdAt: now,
    });

    await db.companionLogs.add({
      companionId,
      logType: 'user_action',
      actionType: 'wish_pool',
      content: payout > 0
        ? `在许愿池投了 ${stake} 颗心心，结果是「${outcome.title}」，拿回 ${payout} 颗。`
        : `在许愿池投了 ${stake} 颗心心，被池水悄悄收下了。`,
      timestamp: now,
    });

    return {
      outcome, stake, payout, companion: updated, usedToday: todaysRows.length + 1, dailyLimit: WISH_DAILY_LIMIT,
    };
  });
}