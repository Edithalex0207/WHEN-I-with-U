// src/apps/flightchess/flightChessDeckService.js
//
// 飞行棋「卡组管理」：让用户编辑 5 副内置卡组（心动试探/心跳升温/灵魂深
// 聊/甜蜜暴击/赢家福利）的题目——改文字、增删卡片，入口在大厅顶部。
//
// 存储方式：db.flightChessDeckOverrides 只存「跟内置默认不一样的部
// 分」，一副卡组一条记录（deckId 当主键）。库里没有对应记录就说明用户
// 没改过这副卡，直接用 flightChessCardData.js 里的内置默认；这样大多
// 数用户（没改过卡组的）完全不用碰这张表。
//
// 赢家福利卡这种带固定 effect 的卡组（见 FIXED_EFFECT_DECK_IDS）：卡片
// 数量、顺序、effect 都锁死在内置默认上，saveDeckCards 只会把传进来的
// 文字按位置搬过去，界面上也不提供增删——因为新卡没有效果可配，增删了
// 反而会破坏「赢家抽到就能前进/免罚」这类设计。
//
// 真正抽卡时（flightChessCardData.drawCardFromDeck）调用方自己把
// getEffectiveDeckCards 读出来的列表当 cardsOverride 传进去，这个文件
// 不碰抽卡逻辑本身。

import db from '../../db';
import { CARD_DECKS, DECK_IDS } from './flightChessCardData';

/** 大厅「卡组管理」页里可以编辑的 5 副卡组，顺序就是 tab 的顺序 */
export const EDITABLE_DECK_IDS = [
  DECK_IDS.CRUSH,
  DECK_IDS.WARM,
  DECK_IDS.SOUL,
  DECK_IDS.SWEET,
  DECK_IDS.WINNER,
];

/** 带固定 effect、不能增删卡片、只能改文字的卡组 */
export const FIXED_EFFECT_DECK_IDS = [DECK_IDS.WINNER];

/**
 * 取某副卡组「当前生效」的卡片列表：数据库里有覆盖记录就用覆盖的，
 * 没有就用代码里的内置默认文案。真正抽卡（drawCardFromDeck）和卡组
 * 管理页都走这个。
 */
export const getEffectiveDeckCards = async (deckId) => {
  const builtin = CARD_DECKS[deckId];
  if (!builtin) return [];
  try {
    const override = await db.flightChessDeckOverrides.get(deckId);
    if (override && Array.isArray(override.cards) && override.cards.length > 0) {
      return override.cards;
    }
  } catch (err) {
    console.error('[flightChessDeckService] 读取卡组覆盖失败:', err);
  }
  return builtin.cards;
};

/**
 * 一次性取所有可编辑卡组「当前生效」的卡片，卡组管理页和对局房间加载时
 * 用这个，不用挨个调 getEffectiveDeckCards。返回 { [deckId]: cards[] }。
 */
export const getAllEffectiveDecks = async () => {
  let overrides = [];
  try {
    overrides = await db.flightChessDeckOverrides.toArray();
  } catch (err) {
    console.error('[flightChessDeckService] 读取卡组覆盖失败:', err);
  }
  const overrideById = Object.fromEntries(overrides.map((o) => [o.deckId, o]));

  const result = {};
  EDITABLE_DECK_IDS.forEach((deckId) => {
    const builtin = CARD_DECKS[deckId];
    if (!builtin) return;
    const override = overrideById[deckId];
    result[deckId] = (override && Array.isArray(override.cards) && override.cards.length > 0)
      ? override.cards
      : builtin.cards;
  });
  return result;
};

/**
 * 保存某副卡组的卡片列表（整副覆盖写入）。
 *
 * 普通卡组：直接按传入的 cards 存（文字必填，空的会被过滤掉；没带 id
 * 的新卡自动生成一个）。
 *
 * 固定效果卡组（FIXED_EFFECT_DECK_IDS）：不信任调用方传来的张数/顺
 * 序/effect，强制按内置默认的 4 张位置重新对齐，只把文字搬过去——这样
 * 就算界面逻辑之外不小心传了别的结构，也不会把「前进2格」这些效果搞丢
 * 或错位。
 *
 * 返回是否保存成功。
 */
export const saveDeckCards = async (deckId, cards) => {
  const builtin = CARD_DECKS[deckId];
  if (!builtin || !EDITABLE_DECK_IDS.includes(deckId)) return false;

  let nextCards;
  if (FIXED_EFFECT_DECK_IDS.includes(deckId)) {
    nextCards = builtin.cards.map((card, index) => {
      const incomingText = String(cards?.[index]?.text ?? '').trim();
      return { ...card, text: incomingText || card.text };
    });
  } else {
    nextCards = (cards || [])
      .map((card, index) => ({
        id: card.id || `${deckId}-user-${index + 1}-${Date.now()}`,
        deckId,
        text: String(card.text || '').trim(),
      }))
      .filter((card) => card.text);
  }

  try {
    await db.flightChessDeckOverrides.put({
      deckId,
      cards: nextCards,
      updatedAt: Date.now(),
    });
    return true;
  } catch (err) {
    console.error('[flightChessDeckService] 保存卡组失败:', err);
    return false;
  }
};

export default {
  EDITABLE_DECK_IDS,
  FIXED_EFFECT_DECK_IDS,
  getEffectiveDeckCards,
  getAllEffectiveDecks,
  saveDeckCards,
};