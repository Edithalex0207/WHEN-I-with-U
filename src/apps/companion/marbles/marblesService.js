/**
 * marblesService.js
 *
 * 「小伙伴弹珠」小游戏的数据层：每日奖励名额的读写 + 通关/全通关时
 * 给小伙伴加成。完全独立新建，不 import companionService.js / 其它
 * 小游戏的 service —— 照抄 catchService.js 已经验证过的写法（直接
 * 读写 db.companions / db.companionLogs，clamp100 这类小工具就地
 * 复制一份，不跨文件 import）。
 *
 * Dexie 表：marblePlays（db/index.js 里 db.version(97) 新增）
 *   id           自增主键
 *   companionId  关联的小伙伴 id
 *   dateStr      这条记录发生的日期 'YYYY-MM-DD'
 *   kind         'level'（过了某一关）| 'fullClear'（当天三关都通关的额外奖励）
 *   level        kind==='level' 时是 0/1/2（对应第1/2/3关），fullClear 时是 null
 *   score        这一关/这一局的得分（fullClear 行固定 0，纯记录用）
 *   bestCombo    这一关打出的最高连锁
 *   rewarded     这条记录有没有真正给小伙伴加成（超过每日名额之后是 false）
 *   effect       { mood, satiety, hearts } | null（没给奖励就是 null）
 *   createdAt    时间戳
 *
 * 规则（2026-10-20 跟用户确认）：
 *   - 「过关奖励」每日名额跟接东西小游戏用同一个数字 DAILY_REWARD_LIMIT，
 *     但各自独立计数（两边互不影响，玩法里都读的是 marblesData.js 自己的
 *     常量）——超过名额之后依然可以通关、依然能看分数，只是不再给加成。
 *   - 「全通关」额外奖励：按「今天三关是否都通过一次」累计判定，不要求
 *     三关在同一局/连续顺序打完——只要今天分别打赢过第1/2/3关各一次，
 *     第三次满足条件的那一刻就发一次额外奖励，之后同一天不会再发。这个
 *     额外奖励完全独立于上面的每日名额，不占用、也不受它限制。
 *     （如果这个判定方式跟你想的「全通关」不一样，告诉我，改这一个函数
 *     就行，不影响其它文件。）
 */

import { db } from '../../../db/index';
import {
  LEVEL_CLEAR_EFFECTS, FULL_CLEAR_BONUS_EFFECT, DAILY_REWARD_LIMIT,
} from './marblesData';

const clamp100 = (value) => Math.max(0, Math.min(100, Math.round(value)));

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function applyEffect(companion, effect) {
  const now = Date.now();
  return {
    ...companion,
    satiety: clamp100(companion.satiety + effect.satiety),
    mood: clamp100(companion.mood + effect.mood),
    hearts: Math.round((companion.hearts + effect.hearts) * 10) / 10,
    lastInteractionAt: now,
    updatedAt: now,
    totalInteractionCount: (companion.totalInteractionCount || 0) + 1,
  };
}

/**
 * 读取今天的奖励进度，给关卡选择界面的提示（"今日 1/3"）和全通关徽标用。
 * @returns {{ rewardedToday:number, dailyLimit:number, fullClearRewardedToday:boolean, clearedLevelsToday:number[] }}
 */
export async function getMarblesState(companionId) {
  if (!companionId) {
    return {
      rewardedToday: 0, dailyLimit: DAILY_REWARD_LIMIT, fullClearRewardedToday: false, clearedLevelsToday: [],
    };
  }
  const today = todayDateStr();
  const rows = await db.marblePlays
    .where('[companionId+dateStr]')
    .equals([companionId, today])
    .toArray();

  return {
    rewardedToday: rows.filter((r) => r.kind === 'level' && r.rewarded).length,
    dailyLimit: DAILY_REWARD_LIMIT,
    fullClearRewardedToday: rows.some((r) => r.kind === 'fullClear' && r.rewarded),
    clearedLevelsToday: [...new Set(rows.filter((r) => r.kind === 'level').map((r) => r.level))],
  };
}

/**
 * 提交一关的通关结果：结算这一关的奖励（如果今天名额还没用完）+ 检查
 * 今天是否凑齐三关从而触发全通关额外奖励。
 *
 * @param {number} companionId
 * @param {number} levelIndex 0/1/2
 * @param {number} score 这一关的最终得分
 * @param {number} bestCombo 这一关打出的最高连锁
 */
export async function submitMarblesLevelClear(companionId, levelIndex, score, bestCombo) {
  if (!companionId) throw new Error('缺少 companionId');

  const safeLevel = Math.max(0, Math.min(LEVEL_CLEAR_EFFECTS.length - 1, Math.round(levelIndex)));
  const safeScore = Math.max(0, Math.round(score || 0));
  const safeCombo = Math.max(0, Math.round(bestCombo || 0));
  const today = todayDateStr();

  return db.transaction('rw', db.marblePlays, db.companions, db.companionLogs, async () => {
    const todaysRows = await db.marblePlays
      .where('[companionId+dateStr]')
      .equals([companionId, today])
      .toArray();
    const rewardedSoFar = todaysRows.filter((r) => r.kind === 'level' && r.rewarded).length;
    const willReward = rewardedSoFar < DAILY_REWARD_LIMIT;

    let companion = await db.companions.get(companionId);
    let levelEffect = null;

    if (willReward && companion) {
      levelEffect = LEVEL_CLEAR_EFFECTS[safeLevel];
      companion = applyEffect(companion, levelEffect);
      await db.companionLogs.add({
        companionId,
        logType: 'user_action',
        actionType: 'marbles_level_clear',
        content: `玩「小伙伴弹珠」过了第${safeLevel + 1}关，得分 ${safeScore}，最高连锁 ×${safeCombo}。`,
        timestamp: Date.now(),
      });
    }

    await db.marblePlays.add({
      companionId,
      dateStr: today,
      kind: 'level',
      level: safeLevel,
      score: safeScore,
      bestCombo: safeCombo,
      rewarded: willReward,
      effect: levelEffect,
      createdAt: Date.now(),
    });

    // 全通关判定：今天三关是否都通过一次（累计，不要求连续打完）。
    const clearedLevelsToday = new Set(todaysRows.filter((r) => r.kind === 'level').map((r) => r.level));
    clearedLevelsToday.add(safeLevel);
    const fullClearAlreadyRewarded = todaysRows.some((r) => r.kind === 'fullClear' && r.rewarded);
    let fullClearEffect = null;
    let fullClearRewarded = false;

    if (!fullClearAlreadyRewarded && [0, 1, 2].every((lv) => clearedLevelsToday.has(lv))) {
      fullClearEffect = FULL_CLEAR_BONUS_EFFECT;
      companion = applyEffect(companion || (await db.companions.get(companionId)), fullClearEffect);
      fullClearRewarded = true;
      await db.companionLogs.add({
        companionId,
        logType: 'user_action',
        actionType: 'marbles_full_clear',
        content: '玩「小伙伴弹珠」今天三关都通关啦，拿到了全通关额外奖励。',
        timestamp: Date.now(),
      });
      await db.marblePlays.add({
        companionId,
        dateStr: today,
        kind: 'fullClear',
        level: null,
        score: 0,
        bestCombo: 0,
        rewarded: true,
        effect: fullClearEffect,
        createdAt: Date.now(),
      });
    }

    if (companion) await db.companions.put(companion);

    return {
      levelEffect,
      levelRewarded: willReward,
      fullClearEffect,
      fullClearRewarded,
      companion,
      rewardedToday: rewardedSoFar + (willReward ? 1 : 0),
      dailyLimit: DAILY_REWARD_LIMIT,
      clearedLevelsToday: [...clearedLevelsToday],
    };
  });
}

// 2026-10-20：companionTaskData.js 里暂时没有给「玩弹珠」单独定义每日任务
// eventKey（只有 catch_play / claw_play 这些已有小游戏的 key），所以这一轮
// 先不调 recordTaskEvent——避免传一个任务池里根本不存在的 key。以后如果要
// 给弹珠也加一个每日任务，在 companionTaskData.js 加一条 eventKey:
// 'marbles_play' 的定义，再在这里 import recordTaskEvent（来自
// ../tasks/companionTaskService）并加一行 recordTaskEvent(companionId,
// 'marbles_play') 就行，不需要动这个文件的其它部分。