/*
 * companionSchoolEventService.js —— 「春游 / 秋游」的开放判断 + 结算落库。
 *
 * 【这一轮（子切片③）新增了什么】
 * 在原来"能不能开放"的判断之上，加了 finishEvent：三轮选择结束后调一次，
 * 一个事务里把 companionSchoolLife（今年完成记录）、companions.hearts
 * （奖励心心）、companionSchoolAlbum（合影，可选）一起写掉。写完以后
 * hasDoneEventThisYear 才会真的读到 true——在这之前（子切片①+②那一轮）
 * 它永远是 false，属于预期内的阶段性行为，现在补上了。
 *
 * tallyEnding 是纯函数：3 轮里 gentle/wild 谁多就是谁，3 轮两个选项不会
 * 打平，不需要处理平局分支。
 *
 * import 方向跟 companionSchoolActivityService.js 一样：只许"这个文件
 * import companionSchoolService.js"，不许反过来，避免循环依赖——
 * getDayKey 和 addAlbumPhoto 都是从那边拿的现成函数，不在这里重新实现。
 */

import db from '../../../db';
import { LIFE_KIND, ALBUM_TYPE } from './companionSchoolData';
import { SEASON_EVENTS, findSeasonEvent, EVENT_HEART_REWARD, findEventEnding } from './companionSchoolEventData';
import { getDayKey, addAlbumPhoto, SchoolError } from './companionSchoolService';

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

/** 纯函数：3 轮选择里 gentle/wild 谁多就是谁，返回 {endingKey, tally} */
export const tallyEnding = (choices) => {
  const tally = { gentle: 0, wild: 0 };
  (choices || []).forEach(({ tag }) => {
    if (tag === 'gentle' || tag === 'wild') tally[tag] += 1;
  });
  const endingKey = tally.wild > tally.gentle ? 'wild' : 'gentle';
  return { endingKey, tally };
};

/**
 * 三轮事件选择结束后调一次，结算这次活动：写"今年完成"的记录、发心心奖励、
 * 把合影（如果生成成功）存进相册。一个事务里一起写，避免半截数据。
 *
 * @param {number} companionId
 * @param {{
 *   eventId: string,
 *   choices: Array<{roundIndex:number, tag:'gentle'|'wild'}>,  // 应该正好 3 条
 *   snackIds?: string[],
 *   photo?: {image:string, title?:string}|null,  // 合影，导出失败就传 null
 *   now?: number,
 * }} options
 * @returns {Promise<{life:object, album:(object|null), endingKey:string, endingText:string, heartsGained:number}>}
 */
export const finishEvent = async (companionId, {
  eventId,
  choices = [],
  snackIds = [],
  photo = null,
  now = Date.now(),
} = {}) => {
  const event = findSeasonEvent(eventId);
  if (!event) throw new SchoolError('bad_event', '活动不存在');

  const year = new Date(now).getFullYear();
  const done = await hasDoneEventThisYear(companionId, eventId, year);
  if (done) throw new SchoolError('event_done', `${event.name}今年已经做过啦`);

  const { endingKey, tally } = tallyEnding(choices);
  const heartsGained = EVENT_HEART_REWARD;

  const companionBefore = await db.companions.get(companionId);
  // 结语文案里的 {name} 在这里填成真实名字，落库的 text 和返回给界面的
  // endingText 用的是同一份已经填好名字的文案，不会出现界面显示填好名字、
  // 相册/在校生活里却还留着 {name} 占位符的不一致。
  const endingText = findEventEnding(eventId, endingKey)
    .split('{name}').join(companionBefore?.name || '小伙伴');

  let life = null;
  let album = null;

  await db.transaction(
    'rw',
    [db.companionSchoolLife, db.companions, db.companionSchoolAlbum, db.companionLogs],
    async () => {
      const row = {
        companionId,
        date: getDayKey(now),
        kind: LIFE_KIND.EVENT,
        text: endingText,
        meta: { eventId, year, tally, endingKey, snackIds, heartsGained },
        createdAt: now,
      };
      row.id = await db.companionSchoolLife.add(row);
      life = row;

      const companion = await db.companions.get(companionId);
      if (companion) {
        await db.companions.update(companionId, {
          hearts: Number(companion.hearts || 0) + heartsGained,
          updatedAt: now,
        });
      }

      if (photo) {
        album = await addAlbumPhoto(companionId, {
          type: ALBUM_TYPE.EVENT,
          title: photo.title || `${event.name}纪念卡`,
          image: photo.image,
          meta: { eventId, year, endingKey },
        });
      }

      await db.companionLogs.add({
        companionId,
        logType: 'user_action',
        actionType: 'school_event',
        content: `参加了${event.name}，得到 ${heartsGained} 心心。`,
        timestamp: now,
      });
    },
  );

  return { life, album, endingKey, endingText, heartsGained };
};