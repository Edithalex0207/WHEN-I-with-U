/*
 * companionSchoolEventService.js —— 「春游 / 秋游」要不要开放、今年做过没。
 *
 * 【这一轮做到什么程度】
 * 只有"判断现在能不能开放这个活动"（getOpenEventForCompanion），给首页
 * 横幅用。真正"完成活动、写进相册/在校生活、发奖励"是下个子切片的事，
 * 所以这个文件里完全没有写库的函数——hasDoneEventThisYear 现在永远读到
 * false（因为还没有任何代码会写 LIFE_KIND.EVENT 这种记录），等下个子
 * 切片把"完成"那一步接上，这个判断自然就会生效，不用再回来改这个文件。
 *
 * 只 import db、companionSchoolData（取 LIFE_KIND）、
 * companionSchoolEventData（取 SEASON_EVENTS）。不 import 任何其它
 * school 的 service 文件。
 */

import db from '../../../db';
import { LIFE_KIND } from './companionSchoolData';
import { SEASON_EVENTS } from './companionSchoolEventData';

/** 当前月份对应哪个活动在开放季节里（没有就是 null），纯函数，不碰数据库 */
export const getSeasonEventByMonth = (now = Date.now()) => {
  const month = new Date(now).getMonth() + 1;
  return Object.values(SEASON_EVENTS).find((e) => e.season.includes(month)) || null;
};

/**
 * 这个小伙伴今年有没有完成过这个活动。
 * companionSchoolLife 没有按 kind/meta 建索引，这里按 companionId 整表
 * 拉出来在内存里过滤——量级参考 companionSchoolReportService.js 里
 * getTodaySets 同样的做法，一个小伙伴的生活记录不会多到查起来有压力。
 */
export const hasDoneEventThisYear = async (companionId, eventId, year) => {
  const rows = await db.companionSchoolLife.where('companionId').equals(companionId).toArray();
  return rows.some((r) => r.kind === LIFE_KIND.EVENT && r.meta?.eventId === eventId && r.meta?.year === year);
};

/**
 * 给学校首页用：现在能不能弹一条"春游/秋游开放中"的横幅。
 * @returns {Promise<object|null>} 能开放就返回 SEASON_EVENTS 里的那个活动定义，不能就 null。
 */
export const getOpenEventForCompanion = async (companionId, now = Date.now()) => {
  const event = getSeasonEventByMonth(now);
  if (!event) return null;
  const year = new Date(now).getFullYear();
  const done = await hasDoneEventThisYear(companionId, event.id, year);
  return done ? null : event;
};