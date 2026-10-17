/**
 * catchService.js
 *
 * 「接住掉落物」小游戏的数据层：每日次数/奖励记录的读写 + 结算时
 * 给小伙伴加成。完全独立新建，不 import companionService.js——照抄
 * fortuneService.js 已经验证过的写法（直接读写 db.companions /
 * db.companionLogs，clamp100 这类小工具就地复制一份，不跨文件
 * import，跟 companionService.js 顶部注释里"每个新功能自成一套"的
 * 既有约定一致）。
 *
 * Dexie 表：catchPlays（db/index.js 里 db.version(78) 新增）
 *   id           自增主键
 *   companionId  关联的小伙伴 id
 *   dateStr      这局发生的日期 'YYYY-MM-DD'
 *   score        这局的最终得分
 *   tierKey      'S' | 'A' | 'B' | 'C'
 *   rewarded     这局有没有真正给小伙伴加成（超过每日次数之后是 false）
 *   effect       { mood, satiety, hearts } | null（没给奖励就是 null）
 *   createdAt    时间戳
 *
 * 不限制"能玩几次"，只限制"前 N 次给加成"——超过之后依然可以提交成绩，
 * 只是 rewarded 为 false，照常能看分数，纯娱乐。
 */

import { db } from '../../../db/index';
import { DAILY_REWARD_LIMIT, tierFor } from './catchData';
import { recordTaskEvent } from '../tasks/companionTaskService';

const clamp100 = (value) => Math.max(0, Math.min(100, Math.round(value)));

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 读取今天的游戏次数/奖励进度，给开局前的提示（"今日 1/3"）用。
 * @returns {{ playsToday:number, rewardedToday:number, dailyLimit:number, bestScoreToday:number }}
 */
export async function getCatchState(companionId) {
  if (!companionId) {
    return {
      playsToday: 0, rewardedToday: 0, dailyLimit: DAILY_REWARD_LIMIT, bestScoreToday: 0,
    };
  }

  const today = todayDateStr();
  const rows = await db.catchPlays
    .where('[companionId+dateStr]')
    .equals([companionId, today])
    .toArray();

  const rewardedToday = rows.filter((r) => r.rewarded).length;
  const bestScoreToday = rows.reduce((max, r) => Math.max(max, r.score), 0);

  return {
    playsToday: rows.length,
    rewardedToday,
    dailyLimit: DAILY_REWARD_LIMIT,
    bestScoreToday,
  };
}

/**
 * 提交一局的最终得分：结算奖励档位 +（如果今天名额还没用完）给小伙伴加成。
 *
 * @param {number} companionId
 * @param {number} score 这一局的最终得分（原始数字，内部会 clamp 到 >=0 整数）
 * @returns {{
 *   tier: object,
 *   rewarded: boolean,
 *   effect: {mood:number, satiety:number, hearts:number} | null,
 *   companion: object | null,
 *   rewardedToday: number,
 *   dailyLimit: number,
 * }}
 */
export async function submitCatchResult(companionId, score) {
  if (!companionId) throw new Error('缺少 companionId');

  const safeScore = Math.max(0, Math.round(score || 0));
  const tier = tierFor(safeScore);
  const today = todayDateStr();

  return db.transaction('rw', db.catchPlays, db.companions, db.companionLogs, async () => {
    const todaysRows = await db.catchPlays
      .where('[companionId+dateStr]')
      .equals([companionId, today])
      .toArray();
    const rewardedSoFar = todaysRows.filter((r) => r.rewarded).length;

    const willReward = rewardedSoFar < DAILY_REWARD_LIMIT;
    let companion = await db.companions.get(companionId);
    let effect = null;

    if (willReward && companion) {
      effect = tier.effect;
      const now = Date.now();
      const updated = {
        ...companion,
        satiety: clamp100(companion.satiety + effect.satiety),
        mood: clamp100(companion.mood + effect.mood),
        hearts: Math.round((companion.hearts + effect.hearts) * 10) / 10,
        lastInteractionAt: now,
        updatedAt: now,
        totalInteractionCount: (companion.totalInteractionCount || 0) + 1,
      };
      await db.companions.put(updated);
      companion = updated;

      await db.companionLogs.add({
        companionId,
        logType: 'user_action',
        actionType: 'catch_game',
        content: `玩「接零食」小游戏接了 ${safeScore} 分，评价是「${tier.label}」。`,
        timestamp: now,
      });
    }

    await db.catchPlays.add({
      companionId,
      dateStr: today,
      score: safeScore,
      tierKey: tier.key,
      rewarded: willReward,
      effect,
      createdAt: Date.now(),
    });

    // 每日任务：玩一次接东西小游戏——不管有没有拿到今天的奖励名额，
    // 玩完一局就算完成。
    const taskResult = await recordTaskEvent(companionId, 'catch_play');
    if (taskResult) companion = taskResult.companion;

    return {
      tier,
      rewarded: willReward,
      effect,
      companion,
      rewardedToday: rewardedSoFar + (willReward ? 1 : 0),
      dailyLimit: DAILY_REWARD_LIMIT,
    };
  });
}