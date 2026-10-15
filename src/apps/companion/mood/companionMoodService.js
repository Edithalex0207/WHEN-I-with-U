/*
 * 心情日历——数据 CRUD。
 *
 * 【已确认的设计】：日历里每一天一格，左边是 char（角色，也就是小伙伴
 * 背后真正在聊天的那个角色，不是 companion.mood 那个养成数值）当天的
 * 心情——AI 在每天晚上 22 点固定判断一次，见 Slice B 的
 * companionMoodScheduler.js / companionMoodAiService.js，这一片暂时还
 * 没有；右边是用户自己的心情（用户点格子自己选，覆盖式——一天只留最后
 * 一次选择，不留历史版本，跟日记留言、改名是一个思路）。用户只能设置
 * 今天及之前的日期。
 *
 * 完全新表 companionMoods（db.version(91)），跟 companionDiaries/
 * companionLogs 都是两回事，不共用。
 */

import db from '../../../db';

// MOOD_KEYS 的唯一定义在 companionMoodIcons.jsx（跟 MOOD_DEFS 配色放一起），
// 这里转手导出一份，避免两个文件各写一份导致以后改串。
export { MOOD_KEYS } from './companionMoodIcons';

const pad2 = (n) => String(n).padStart(2, '0');

export const toDateStr = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const getTodayDateStr = () => toDateStr(new Date());

/*
 * 按月取整月的心情记录，返回 { 'YYYY-MM-DD': record }，方便日历按格子查。
 * month 是从 1 开始的月份（不是 JS Date 的 0 开始）。
 */
export const getMonthMoods = async (companionId, year, month) => {
  if (!companionId) return {};

  const prefix = `${year}-${pad2(month)}`;
  const rows = await db.companionMoods
    .where('companionId')
    .equals(companionId)
    .filter((row) => typeof row.date === 'string' && row.date.startsWith(prefix))
    .toArray();

  const byDate = {};
  rows.forEach((row) => { byDate[row.date] = row; });
  return byDate;
};

const getRecord = (companionId, dateStr) => (
  db.companionMoods.where('[companionId+date]').equals([companionId, dateStr]).first()
);

/*
 * 用户设置/修改自己当天（或之前某一天）的心情。调用方（日历组件）自己
 * 会把未来日期的格子禁用掉，这里不再重复校验。
 */
export const setUserMood = async (companionId, dateStr, moodKey) => {
  if (!companionId || !dateStr || !moodKey) return null;

  const existing = await getRecord(companionId, dateStr);
  const now = Date.now();

  if (existing) {
    await db.companionMoods.update(existing.id, { userMood: moodKey, userMoodAt: now });
    return await db.companionMoods.get(existing.id);
  }

  const id = await db.companionMoods.add({
    companionId,
    date: dateStr,
    userMood: moodKey,
    userMoodAt: now,
    charMood: null,
    charMoodAt: null,
  });
  return await db.companionMoods.get(id);
};

/*
 * char（角色）当天的心情，由 companionMoodScheduler.js 在每天晚上判断完
 * 之后调用，写入。覆盖式，一天只留最后一次判断结果。
 */
export const setCharMood = async (companionId, dateStr, moodKey) => {
  if (!companionId || !dateStr || !moodKey) return null;

  const existing = await getRecord(companionId, dateStr);
  const now = Date.now();

  if (existing) {
    await db.companionMoods.update(existing.id, { charMood: moodKey, charMoodAt: now });
    return await db.companionMoods.get(existing.id);
  }

  const id = await db.companionMoods.add({
    companionId,
    date: dateStr,
    charMood: moodKey,
    charMoodAt: now,
    userMood: null,
    userMoodAt: null,
  });
  return await db.companionMoods.get(id);
};