/*
 * companionClawService.js —— #2 娃娃机的数据 CRUD + 抓取结算。
 *
 * 【流程】
 * 1. UI 先调 startClawPlay(companionId)：检查心心够不够、够的话立刻扣掉
 *    PLAY_COST（不管后面抓不抓得中都不退——跟真实娃娃机一样，投币就是
 *    投币了），然后 UI 自己跑一遍时机/力度小游戏，算出 success。
 * 2. 小游戏结束后，UI 根据 success 调 resolveClawWin / resolveClawLose
 *    其中之一：
 *    - resolveClawWin：按稀有度权重随机抽一款奖品。已经拥有（永久收藏，
 *      查 companionInventory 的 category:'clawPrize'）就不重复入库，改成
 *      返还 DUPLICATE_REFUND 心心；没有就正式写进 companionInventory。
 *    - resolveClawLose：只负责写一条日志，不动心心（已经在 startClawPlay
 *      里扣过了）。
 *
 * 【为什么不放进 companionBackpack】见 companionClawData.js 顶部注释——
 * 这批奖品是永久收藏，跟衣服/场景走同一个"一次性拥有、不消耗"的思路，
 * 复用 companionInventory 这张已经存在的表，不用新建表、不用动
 * db.version。
 *
 * 完全新建的一套，不 import companionService.js（避免循环依赖，参照
 * companionBackpackService.js 顶部注释里说的同一个原因），凡是要动
 * companion.hearts 的地方直接操作 db.companions。
 */

import db from '../../../db';
import { CLAW_PRIZES, CLAW_RARITY, findClawPrize } from './companionClawData';

export const PLAY_COST = 5;
export const DUPLICATE_REFUND = 2;
const CLAW_PRIZE_CATEGORY = 'clawPrize';

// 档位权重：普通每款20、稀有每款6、隐藏2——总权重 100，单次抓中后约
// 80% 出普通、18% 稀有、2% 隐藏。想调整概率只改这里的数字就行。
const RARITY_WEIGHT = {
  [CLAW_RARITY.COMMON]: 20,
  [CLAW_RARITY.RARE]: 6,
  [CLAW_RARITY.HIDDEN]: 2,
};

const round1 = (value) => Math.round(value * 10) / 10;

/*
 * 按稀有度权重，在 8 款奖品里随机抽一款（纯函数，不碰数据库，方便单测/
 * 复用）。
 */
export const pickWeightedPrize = () => {
  const weighted = CLAW_PRIZES.map((item) => ({ item, weight: RARITY_WEIGHT[item.rarity] || 1 }));
  const total = weighted.reduce((sum, row) => sum + row.weight, 0);
  let roll = Math.random() * total;

  for (const row of weighted) {
    roll -= row.weight;
    if (roll <= 0) return row.item;
  }

  return weighted[weighted.length - 1].item;
};

// 免费抓娃娃的次数（陪流星仔玩有概率获得，见 plushPlayService.js），
// 记在 companion.clawFreePlays 上，有次数时投币不扣心心。
export const getFreePlays = (companion) => Math.max(0, Math.floor(companion?.clawFreePlays || 0));

export const canPlayClaw = (companion) => (
  getFreePlays(companion) > 0 || (companion?.hearts || 0) >= PLAY_COST
);

/*
 * 开始一次抓取：校验+扣心心。UI 拿到返回值之后才开始跑自己的时机小
 * 游戏——这里只管"能不能玩、玩的话先把钱收了"，不决定抓不抓得中。
 */
export const startClawPlay = async (companionId) => {
  const companion = await db.companions.get(companionId);
  if (!companion) throw new Error('小伙伴不存在');
  if (!canPlayClaw(companion)) throw new Error('心心不够啦');

  const now = Date.now();
  const freePlays = getFreePlays(companion);

  if (freePlays > 0) {
    // 有免费次数就先用免费次数，不扣心心。
    await db.companions.update(companionId, {
      clawFreePlays: freePlays - 1,
      updatedAt: now,
    });
  } else {
    await db.companions.update(companionId, {
      hearts: round1(companion.hearts - PLAY_COST),
      updatedAt: now,
    });
  }

  return db.companions.get(companionId);
};

const isAlreadyOwned = async (companionId, itemId) => {
  const row = await db.companionInventory
    .where({ companionId, category: CLAW_PRIZE_CATEGORY })
    .filter((r) => r.itemId === itemId)
    .first();
  return Boolean(row);
};

/*
 * 抓中了：抽一款奖品，重复就退 2 心心，没有就正式收进永久收藏。
 * 返回 { prize, isDuplicate, companion }。
 */
export const resolveClawWin = async (companionId) => {
  const prize = pickWeightedPrize();
  const now = Date.now();
  const duplicate = await isAlreadyOwned(companionId, prize.id);

  if (duplicate) {
    const companion = await db.companions.get(companionId);
    await db.companions.update(companionId, {
      hearts: round1((companion?.hearts || 0) + DUPLICATE_REFUND),
      updatedAt: now,
    });
    await db.companionLogs.add({
      companionId,
      logType: 'user_action',
      actionType: 'claw_duplicate',
      content: `娃娃机又抓到了一只「${prize.name}」，已经有过了，换成了${DUPLICATE_REFUND}心心。`,
      timestamp: now,
    });
    return { prize, isDuplicate: true, companion: await db.companions.get(companionId) };
  }

  await db.companionInventory.add({
    companionId,
    itemId: prize.id,
    category: CLAW_PRIZE_CATEGORY,
    acquiredAt: now,
  });
  await db.companionLogs.add({
    companionId,
    logType: 'user_action',
    actionType: 'claw_win',
    content: `从娃娃机抓到了「${prize.name}」！`,
    timestamp: now,
  });

  return { prize, isDuplicate: false, companion: await db.companions.get(companionId) };
};

/*
 * 没抓中：心心在 startClawPlay 已经扣过，这里只留一条日志。
 */
export const resolveClawLose = async (companionId) => {
  await db.companionLogs.add({
    companionId,
    logType: 'user_action',
    actionType: 'claw_lose',
    content: '玩了一次娃娃机，没抓稳，空手而归。',
    timestamp: Date.now(),
  });
};

/*
 * 图鉴列表：遍历 8 款静态数据，标 owned。隐藏款（rarity: 'hidden'）在
 * 没有拿到之前，整条都不放进返回数组——UI 那边图鉴网格看到的就是
 * "7 个普通/稀有款（含未集到的灰色占位）+ 集到隐藏款才会多出来的第 8
 * 格"，不会提前透出"还有一个未知款"的提示。
 */
export const getClawCollection = async (companionId) => {
  const owned = await db.companionInventory
    .where({ companionId, category: CLAW_PRIZE_CATEGORY })
    .toArray();
   const ownedIds = new Set(owned.map((row) => row.itemId));
  const acquiredMap = new Map(owned.map((row) => [row.itemId, row.acquiredAt]));

  return CLAW_PRIZES
    .filter((item) => item.rarity !== CLAW_RARITY.HIDDEN || ownedIds.has(item.id))
        .map((item) => ({ ...item, owned: ownedIds.has(item.id), acquiredAt: acquiredMap.get(item.id) || 0 }));
};

export { findClawPrize };