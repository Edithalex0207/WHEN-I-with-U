/*
 * sweetPlayService.js —— 「小蛋糕店」主动玩法的数据读写（心心、经验、升星）。
 *
 * 不新建表：星级和经验存在第一片已有的 sweetShopStates 里，
 * 心心直接加减 db.companions 里小伙伴自己的 hearts（和弹珠、接东西小游戏同一个做法）。
 * 主动玩不设每日上限，所以也不需要记每日名额。
 *
 * 升星规则（花心心手动升）：累计经验 >= 当前星的 expNeeded，并且心心 >= heartCost。
 */

import db from '../../db';
import { DEFAULT_SHOP_STATE, SHOP_STAR_MAX } from './sweetStreetData';
import { SHOP_UPGRADES } from './sweetPlayData';
import { ensureShopState } from './sweetStreetService';

const round1 = (n) => Math.round(n * 10) / 10;

export const getUpgradeRule = (star) => SHOP_UPGRADES.find((u) => u.fromStar === star) || null;

/**
 * 店铺的升级进度，给「开局前」页面的经验条和升星按钮用。
 * @returns {{ star:number, exp:number, atMax:boolean, expNeeded:number|null, heartCost:number|null,
 *            prevExpNeeded:number, expEnough:boolean }}
 */
export const getShopProgress = (shopState) => {
  const star = shopState?.star ?? DEFAULT_SHOP_STATE.star;
  const exp = shopState?.exp ?? 0;
  const rule = getUpgradeRule(star);
  const prevRule = getUpgradeRule(star - 1);
  return {
    star,
    exp,
    atMax: star >= SHOP_STAR_MAX || !rule,
    expNeeded: rule ? rule.expNeeded : null,
    heartCost: rule ? rule.heartCost : null,
    prevExpNeeded: prevRule ? prevRule.expNeeded : 0,
    expEnough: rule ? exp >= rule.expNeeded : false,
  };
};

/**
 * 提交一局的结算：心心加到小伙伴身上，经验加到这家店，并留一条小伙伴日志。
 * @param {number} companionId
 * @param {string} shopId
 * @param {object} settlement sweetPlayEngine.finishRun 的返回值
 * @returns {Promise<{ companion, shopState, addedHearts:number, addedExp:number }>}
 */
export const submitRunResult = async (companionId, shopId, settlement) => {
  if (!companionId) throw new Error('缺少 companionId');
  const addedHearts = Math.max(0, Math.round(settlement?.totalHearts || 0));
  const addedExp = Math.max(0, Math.round(settlement?.expGain || 0));

  // 先保证这家店有记录（ensureShopState 自己会建档，放在事务外面）
  await ensureShopState(companionId, shopId);

  return db.transaction('rw', db.companions, db.companionLogs, db.sweetShopStates, async () => {
    const companion = await db.companions.get(companionId);
    const shopState = await db.sweetShopStates
      .where('[companionId+shopId]')
      .equals([companionId, shopId])
      .first();
    if (!companion || !shopState) throw new Error('找不到小伙伴或店铺记录');

    const now = Date.now();
    const nextCompanion = {
      ...companion,
      hearts: round1((companion.hearts || 0) + addedHearts),
      updatedAt: now,
    };
    const nextShopState = {
      ...shopState,
      exp: (shopState.exp || 0) + addedExp,
      updatedAt: now,
    };

    await db.companions.put(nextCompanion);
    await db.sweetShopStates.put(nextShopState);
    await db.companionLogs.add({
      companionId,
      logType: 'user_action',
      actionType: 'sweet_street_run',
      content: `在甜品小街的小蛋糕店营业了一局，接待 ${settlement?.servedCount || 0} 位客人，赚到 ${addedHearts} 颗心心。`,
      timestamp: now,
    });

    return {
      companion: nextCompanion,
      shopState: nextShopState,
      addedHearts,
      addedExp,
    };
  });
};

/**
 * 花心心给这家店升一星。条件不满足时不改任何数据，返回 ok:false 和原因：
 *   'max'        已经是最高星级
 *   'exp'        累计经验还不够
 *   'hearts'     心心不够
 *   'missing'    找不到小伙伴或店铺记录
 */
export const upgradeShopStar = async (companionId, shopId) => {
  if (!companionId) throw new Error('缺少 companionId');
  await ensureShopState(companionId, shopId);

  return db.transaction('rw', db.companions, db.companionLogs, db.sweetShopStates, async () => {
    const companion = await db.companions.get(companionId);
    const shopState = await db.sweetShopStates
      .where('[companionId+shopId]')
      .equals([companionId, shopId])
      .first();
    if (!companion || !shopState) return { ok: false, reason: 'missing' };

    const rule = getUpgradeRule(shopState.star);
    if (!rule || shopState.star >= SHOP_STAR_MAX) return { ok: false, reason: 'max' };
    if ((shopState.exp || 0) < rule.expNeeded) return { ok: false, reason: 'exp', rule };
    if ((companion.hearts || 0) < rule.heartCost) return { ok: false, reason: 'hearts', rule };

    const now = Date.now();
    const nextCompanion = {
      ...companion,
      hearts: round1((companion.hearts || 0) - rule.heartCost),
      updatedAt: now,
    };
    const nextShopState = { ...shopState, star: shopState.star + 1, updatedAt: now };

    await db.companions.put(nextCompanion);
    await db.sweetShopStates.put(nextShopState);
    await db.companionLogs.add({
      companionId,
      logType: 'user_action',
      actionType: 'sweet_street_upgrade',
      content: `把甜品小街的小蛋糕店升到了 ${nextShopState.star} 星，花了 ${rule.heartCost} 颗心心。`,
      timestamp: now,
    });

    return {
      ok: true,
      rule,
      companion: nextCompanion,
      shopState: nextShopState,
    };
  });
};