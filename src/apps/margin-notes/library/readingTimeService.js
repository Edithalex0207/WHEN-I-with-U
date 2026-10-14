// src/apps/margin-notes/library/readingTimeService.js
//
// 阅读时长。每本书每天一行（表 readerDailyReading，见 db.version(87)）：
//   bookId   哪本书
//   date     本地日期 'YYYY-MM-DD'（用设备本地时区，不用 UTC）
//   seconds  这一天这本书累计读了多少秒
// 只记「页面在前台、而且最近一分钟内有操作」的时间，由 ReadingTimerBadge 负责计时并定期写入。
// 唯一索引 [bookId+date] 保证同一天同一本书只有一行。

import db from '../../../db';

const pad = (value) => String(value).padStart(2, '0');

/** 本地日期字符串 'YYYY-MM-DD'。 */
export const localDateString = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** 把日期字符串往前/往后挪 n 天（本地日期，跨月跨年都对）。 */
export const shiftDateString = (dateString, days) => {
  const [year, month, day] = String(dateString).split('-').map(Number);
  return localDateString(new Date(year, month - 1, day + days));
};

/**
 * 给某本书今天的阅读时长加上若干秒。
 */
export const addReadingSeconds = async (bookId, seconds) => {
  const add = Math.floor(Number(seconds) || 0);
  if (!bookId || add <= 0) return;

  const date = localDateString();

  try {
    await db.transaction('rw', db.readerDailyReading, async () => {
      const existing = await db.readerDailyReading
        .where('[bookId+date]')
        .equals([bookId, date])
        .first();

      if (existing) {
        await db.readerDailyReading.update(existing.id, {
          seconds: (existing.seconds || 0) + add,
        });
      } else {
        await db.readerDailyReading.add({ bookId, date, seconds: add });
      }
    });
  } catch (error) {
    console.warn('[阅读器] 记录阅读时长失败：', error);
  }
};

/**
 * 由这本书所有的「每天一行」记录算出统计（纯函数，today 由调用方传入，方便测试）：
 *   days          最近 7 天（含今天，最早的在前）：[{ date, seconds }]
 *   weekSeconds   这 7 天合计
 *   todaySeconds  今天
 *   totalSeconds  本书累计
 *   streak        连续阅读天数（从今天往前数；今天还没读就从昨天往前数）
 */
export const buildReadingStats = (rows, today) => {
  const bySeconds = new Map();
  let totalSeconds = 0;

  for (const row of rows || []) {
    const seconds = Math.max(0, Number(row.seconds) || 0);
    bySeconds.set(row.date, (bySeconds.get(row.date) || 0) + seconds);
    totalSeconds += seconds;
  }

  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = shiftDateString(today, -offset);
    days.push({ date, seconds: bySeconds.get(date) || 0 });
  }

  const todaySeconds = bySeconds.get(today) || 0;

  let streak = 0;
  let cursor = todaySeconds > 0 ? today : shiftDateString(today, -1);
  while ((bySeconds.get(cursor) || 0) > 0) {
    streak += 1;
    cursor = shiftDateString(cursor, -1);
  }

  return {
    days,
    weekSeconds: days.reduce((sum, day) => sum + day.seconds, 0),
    todaySeconds,
    totalSeconds,
    streak,
  };
};

/**
 * 读某本书的阅读时长统计。读失败返回全 0 的统计。
 */
export const getBookReadingStats = async (bookId) => {
  const today = localDateString();

  try {
    const rows = await db.readerDailyReading.where('bookId').equals(bookId).toArray();
    return buildReadingStats(rows, today);
  } catch (error) {
    console.warn('[阅读器] 读取阅读时长失败：', error);
    return buildReadingStats([], today);
  }
};

/**
 * 秒数显示成「X 小时 Y 分 / Y 分钟 / 不到 1 分钟」。
 */
export const formatDuration = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total <= 0) return '0 分钟';
  if (total < 60) return '不到 1 分钟';

  const minutes = Math.floor(total / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours <= 0) return `${minutes} 分钟`;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
};