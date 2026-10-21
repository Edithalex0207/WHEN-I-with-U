/*
 * sweetStreetService.js —— 「甜品小街」的数据读写（第一片：只有读取和建档）。
 *
 * 两张表（db.version(99)）：
 *   sweetShopStates   每个小伙伴 × 每家店 一条记录：星级、经验
 *     字段：id, companionId, shopId, star, exp, createdAt, updatedAt
 *   sweetWorkSessions 挂机打工记录，一次打工一条
 *     字段：id, companionId, chatId, shopId, tierId, hours, status,
 *           startedAt, endsAt, settledAt, hearts, reportText, dateStr
 *     status：'working'（进行中） | 'settled'（已结算）
 *     shopId 在开始打工时随机抽一家（这一片还没有开始打工的入口）
 *
 * 心心沿用小伙伴自己的 companion.hearts，不另建货币。
 */

import db from '../../db';
import { getCompanionByChat } from '../companion/companionService';
import { DEFAULT_SHOP_STATE, SWEET_SHOPS } from './sweetStreetData';

/** 取某家店的状态，没有就建一条 */
export const ensureShopState = async (companionId, shopId) => {
  const existing = await db.sweetShopStates
    .where('[companionId+shopId]')
    .equals([companionId, shopId])
    .first();
  if (existing) return existing;

  const now = Date.now();
  const record = {
    companionId,
    shopId,
    star: DEFAULT_SHOP_STATE.star,
    exp: DEFAULT_SHOP_STATE.exp,
    createdAt: now,
    updatedAt: now,
  };
  const id = await db.sweetShopStates.add(record);
  return { ...record, id };
};

/** 一次取出所有店铺的状态，返回 { [shopId]: state } */
export const getAllShopStates = async (companionId) => {
  const result = {};
  for (const shop of SWEET_SHOPS) {
    // eslint-disable-next-line no-await-in-loop
    result[shop.id] = await ensureShopState(companionId, shop.id);
  }
  return result;
};

/** 最近的已结算打工记录（小日志用），新的在前 */
export const getRecentWorkLogs = async (companionId, limit = 10) => {
  const rows = await db.sweetWorkSessions
    .where('[companionId+status]')
    .equals([companionId, 'settled'])
    .toArray();
  rows.sort((a, b) => (b.settledAt || 0) - (a.settledAt || 0));
  return rows.slice(0, limit);
};

/** 当前进行中的打工（没有就返回 null） */
export const getActiveWork = async (companionId) => {
  const row = await db.sweetWorkSessions
    .where('[companionId+status]')
    .equals([companionId, 'working'])
    .first();
  return row || null;
};

/**
 * 进入小街时一次性取齐首页需要的数据。
 * 这个聊天窗还没领养小伙伴时返回 null，由页面显示提示。
 */
export const loadSweetStreetHome = async (chatId) => {
  const companion = await getCompanionByChat(chatId);
  if (!companion) return null;

  const [shopStates, logs, activeWork] = await Promise.all([
    getAllShopStates(companion.id),
    getRecentWorkLogs(companion.id),
    getActiveWork(companion.id),
  ]);

  return { companion, shopStates, logs, activeWork };
};
