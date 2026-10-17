/*
 * companionSchoolCardService.js —— 「随机收藏卡」的落地逻辑。
 *
 * 【这个文件管什么】
 * - rollCollectibleCard：做完一组题之后，由 UI（CompanionSchoolQuizModal.jsx）
 *   主动调一次。按 CARD_DROP_CHANCE 的概率决定要不要掉卡，中了再按
 *   CARD_RARITY_WEIGHTS 的权重决定掉哪个档、从那个档里随机挑一张，
 *   写进 / 累加 companionSchoolCards。没中返回 null，UI 什么都不显示。
 * - getCardCollection：给收藏册界面用，把固定卡池（目录）跟这个小伙伴
 *   已经抽到的记录合并成"每张卡有没有、有几张"的列表，再带一个汇总
 *   （集齐了几种 / 总共几种）。
 *
 * 不是放进 companionSchoolQuizService.js 里一起调的，原因跟
 * companionSchoolActivityService.js 文件头写的一样：那个文件的 import
 * 约定是写死的，"要不要顺带掉卡"这件事交给 UI 层决定调用顺序。
 *
 * 只 import db、companionSchoolData（取 CARD_DROP_CHANCE）、
 * companionSchoolCardCatalog（卡池）。不 import 任何 school 的其它
 * service 文件，这个功能不需要学籍/做题的任何数据，纯粹是"调了就掉"。
 */

import db from '../../../db';
import { CARD_DROP_CHANCE } from './companionSchoolData';
import {
  CARD_RARITY_ORDER,
  CARD_RARITY_WEIGHTS,
  COLLECTIBLE_CARDS,
} from './companionSchoolCardCatalog';

/** 按权重随机挑一个档（CARD_RARITY_ORDER 里的某个值） */
const pickRarity = (rng) => {
  const total = CARD_RARITY_ORDER.reduce((sum, r) => sum + (CARD_RARITY_WEIGHTS[r] || 0), 0);
  if (total <= 0) return CARD_RARITY_ORDER[0];
  let roll = rng() * total;
  for (const rarity of CARD_RARITY_ORDER) {
    roll -= CARD_RARITY_WEIGHTS[rarity] || 0;
    if (roll < 0) return rarity;
  }
  return CARD_RARITY_ORDER[CARD_RARITY_ORDER.length - 1];
};

/**
 * 做完一组题之后调一次。
 *
 * @param {number} companionId
 * @param {{now?:number, rng?:function}} options  rng 可注入，方便测试
 * @returns {Promise<{card:object, isNew:boolean, count:number}|null>}
 *          没中时返回 null；中了返回卡池里的那张卡（含 title/rarity/tone/
 *          text/url），加上 isNew（这个小伙伴是不是头一次抽到）和抽到
 *          之后手里这张卡的总张数。
 */
export const rollCollectibleCard = async (companionId, { now = Date.now(), rng = Math.random } = {}) => {
  if (!COLLECTIBLE_CARDS.length) return null;
  if (rng() >= CARD_DROP_CHANCE) return null;

  const rarity = pickRarity(rng);
  const pool = COLLECTIBLE_CARDS.filter((c) => c.rarity === rarity);
  // 保险：万一某个档位暂时是空的（卡池以后删卡删到只剩别的档），退回全卡池抽。
  const source = pool.length > 0 ? pool : COLLECTIBLE_CARDS;
  const card = source[Math.floor(rng() * source.length)];

  let isNew = false;
  let count = 1;

  await db.transaction('rw', db.companionSchoolCards, async () => {
    const existing = await db.companionSchoolCards
      .where('[companionId+cardId]')
      .equals([companionId, card.id])
      .first();

    if (existing) {
      count = (existing.count || 0) + 1;
      await db.companionSchoolCards.update(existing.id, { count, lastAt: now });
    } else {
      isNew = true;
      await db.companionSchoolCards.add({
        companionId,
        cardId: card.id,
        count: 1,
        firstAt: now,
        lastAt: now,
      });
    }
  });

  return { card, isNew, count };
};

/**
 * 给收藏册界面用：卡池目录 + 这个小伙伴的持有情况，合并成一个数组，
 * 按 CARD_RARITY_ORDER 再按卡池原顺序排好。
 *
 * @param {number} companionId
 * @returns {Promise<{
 *   cards: Array<object & {owned:boolean, count:number, firstAt:(number|null)}>,
 *   ownedKinds:number, totalKinds:number,
 * }>}
 */
export const getCardCollection = async (companionId) => {
  const rows = await db.companionSchoolCards.where('companionId').equals(companionId).toArray();
  const byCardId = new Map(rows.map((r) => [r.cardId, r]));

  const cards = [...CARD_RARITY_ORDER]
    .flatMap((rarity) => COLLECTIBLE_CARDS.filter((c) => c.rarity === rarity))
    .map((c) => {
      const owned = byCardId.get(c.id);
      return {
        ...c,
        owned: Boolean(owned),
        count: owned?.count || 0,
        firstAt: owned?.firstAt || null,
      };
    });

  return {
    cards,
    ownedKinds: byCardId.size,
    totalKinds: COLLECTIBLE_CARDS.length,
  };
};