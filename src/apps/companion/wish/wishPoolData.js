/**
 * wishPoolData.js
 *
 * 「心心许愿池」小游戏的静态配置：投入档位、每日次数上限、四种结果的
 * 概率与倍率、以及抽结果用的纯函数。
 *
 * 纯数据 + 纯函数，不碰 Dexie、不碰 React —— 角色分工照抄 catchData.js /
 * marblesData.js。想重新平衡概率或档位，只改这一个文件。
 *
 * 2026-10-20：概率与档位是占位值（用户还没实玩过）。当前期望：
 *   0.35*2 + 0.45*0 + 0.15*0.5 + 0.05*3 = 0.925
 * 即平均每投 1 颗拿回约 0.93 颗，略亏一点，让它是个小小的心心消耗口。
 */

/** 可选的投入档位（颗心心） */
export const WISH_TIERS = [1, 5, 10];

/** 每天最多许愿几次（投几次）；没用完的次数不累积 */
export const WISH_DAILY_LIMIT = 3;

/**
 * 四种结果。key 要和 CompanionWishPoolModal.jsx / wishPool.css 里的 class 对上。
 *   p     概率（四项加起来必须是 1）
 *   mult  返还倍率（返还 = 投入 * mult；0 = 什么都没有）
 */
export const WISH_OUTCOMES = [
  { key: 'win', p: 0.35, mult: 2, title: '愿望成真' },
  { key: 'lose', p: 0.45, mult: 0, title: '池水悄悄收下了' },
  { key: 'half', p: 0.15, mult: 0.5, title: '池水还了一半' },
  { key: 'jackpot', p: 0.05, mult: 3, title: '星光大奖！' },
];

const round1 = (n) => Math.round(n * 10) / 10;

/** 按概率抽一个结果；forcedKey 只给以后调试用，正式流程不传 */
export function rollWishOutcome(forcedKey) {
  if (forcedKey) {
    const hit = WISH_OUTCOMES.find((o) => o.key === forcedKey);
    if (hit) return hit;
  }
  let r = Math.random();
  for (let i = 0; i < WISH_OUTCOMES.length; i += 1) {
    r -= WISH_OUTCOMES[i].p;
    if (r <= 0) return WISH_OUTCOMES[i];
  }
  return WISH_OUTCOMES[1];
}

/** 投入 stake 颗、抽到 outcome 之后拿回多少颗（保留一位小数） */
export function wishPayout(stake, outcome) {
  return round1(stake * outcome.mult);
}