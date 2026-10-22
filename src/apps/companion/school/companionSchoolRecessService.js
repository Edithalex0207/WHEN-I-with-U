/*
 * companionSchoolRecessService.js —— 「可互动课间事件」的概率与落地逻辑。
 *
 * 【这个文件管什么】
 * 1. rollCampusBreak：做完一组题后调一次，替代原来直接调
 *    rollCampusActivity。一次 roll 决定三种结果之一：
 *      - 什么都没有（概率 1 - ACTIVITY_CHANCE）
 *      - 一件固定的校园小事（走原来的 rollCampusActivity，行为不变）
 *      - 一件可互动课间事件（只返回一个"待玩的事件"，这时候不写库）
 *    总的"有小事"概率仍然是 ACTIVITY_CHANCE，可互动事件只是从里面分出
 *    一部分（RECESS_INTERACTIVE_SHARE），不会让一组题的收益变多。
 * 2. finishRecessEvent：玩完之后调一次，把结果写进 companionSchoolLife
 *    （kind = ACTIVITY，meta 里带 recess 标记）并给小伙伴加心情。
 *    只有玩完才会写；中途关掉小窗算放弃，什么都不会写、不会加心情。
 * 3. getRecessMoodBonus：各玩法按结果取心情加成，数值都在
 *    companionSchoolRecessData.js。
 *
 * 【为什么不改 companionSchoolActivityService.js】
 * 固定小事的逻辑原样保留：这里借用它 rng 参数可注入的特点，让它的
 * "有没有小事"那一次 roll 必中（第一次 rng 调用返回 0），其余随机数照旧。
 * 调用方式跟原来一样，失败时都应该让调用方能安全地 catch 掉。
 *
 * 只 import db、companionSchoolData、companionSchoolActivityService、
 * companionSchoolService、companionSchoolRecessData。
 */

import db from '../../../db';
import { ACTIVITY_CHANCE, LIFE_KIND } from './companionSchoolData';
import { rollCampusActivity } from './companionSchoolActivityService';
import { getDayKey } from './companionSchoolService';
import {
  RECESS_INTERACTIVE_SHARE,
  RECESS_LIVE_KINDS,
  RECESS_DEBUG_ALWAYS,
  RECESS_MOOD,
  RECESS_MOOD_CAP,
  RECESS_CLASSMATES,
  RECESS_ENTRY_LINES,
  RECESS_SCENES,
} from './companionSchoolRecessData';

const clamp100 = (value) => Math.max(0, Math.min(100, value));

const pickOne = (list, rng) => list[Math.floor(rng() * list.length)];

const fillTemplate = (text, { name, mate }) => text
  .split('{name}').join(name)
  .split('{mate}').join(mate);

/** 一组题做完后，直接出现一件可互动事件的概率（只在有可用玩法时才非 0）。 */
export const RECESS_INTERACTIVE_CHANCE = ACTIVITY_CHANCE * RECESS_INTERACTIVE_SHARE;

/** 随机挑一个同学；excludeIds 里的同学会被跳过（名册被排光时退回全体）。 */
export const pickClassmate = (rng = Math.random, excludeIds = []) => {
  const pool = RECESS_CLASSMATES.filter((c) => !excludeIds.includes(c.id));
  return pickOne(pool.length ? pool : RECESS_CLASSMATES, rng);
};

/**
 * 造一个"待玩的事件"。只是内存里的一个对象，不写库：玩完才会通过
 * finishRecessEvent 落库，所以放弃的事件不会留下任何痕迹。
 */
export const buildRecessEvent = ({
  kind,
  classId = null,
  teacherId = null,
  companionName = '',
  now = Date.now(),
  rng = Math.random,
} = {}) => {
  const classmate = pickClassmate(rng);
  const names = { name: companionName || '小伙伴', mate: classmate.name };
  return {
    eventId: `recess-${now}-${Math.floor(rng() * 1000000)}`,
    kind,
    classId,
    teacherId,
    classmate,
    entryLine: fillTemplate(pickOne(RECESS_ENTRY_LINES[kind] || ['{mate}来找{name}玩'], rng), names),
    scene: fillTemplate(pickOne(RECESS_SCENES[kind] || ['{mate}来找{name}玩了一会儿。'], rng), names),
    createdAt: now,
  };
};

/**
 * 做完一组题之后调一次。
 *
 * @param {number} companionId
 * @param {{
 *   classId?: string, teacherId?: string,
 *   companionName?: string,
 *   now?: number,
 *   rng?: function,
 * }} options
 * @returns {Promise<{
 *   activity: object|null,   // 固定小事（rollCampusActivity 的返回值）
 *   recess: object|null,     // 待玩的可互动事件（buildRecessEvent 的返回值）
 * }>} 两个字段最多只有一个非 null；都是 null 表示这次什么都没有。
 */
export const rollCampusBreak = async (companionId, {
  classId = null,
  teacherId = null,
  companionName = '',
  now = Date.now(),
  rng = Math.random,
} = {}) => {
  const liveKinds = RECESS_LIVE_KINDS;
  let interactiveChance = liveKinds.length ? RECESS_INTERACTIVE_CHANCE : 0;
  if (liveKinds.length && RECESS_DEBUG_ALWAYS) interactiveChance = 1; // 本地测试：必中
  const roll = rng();

  if (roll < interactiveChance) {
    const kind = pickOne(liveKinds, rng);
    return {
      activity: null,
      recess: buildRecessEvent({ kind, classId, teacherId, companionName, now, rng }),
    };
  }

  if (roll < ACTIVITY_CHANCE) {
    // 让 rollCampusActivity 自己那次 ACTIVITY_CHANCE 的 roll 必中（第一次
    // 取随机数返回 0），后面挑素材、取心情都还是真随机。
    let first = true;
    const forcedHitRng = () => {
      if (first) {
        first = false;
        return 0;
      }
      return rng();
    };
    const activity = await rollCampusActivity(companionId, {
      classId, teacherId, companionName, now, rng: forcedHitRng,
    });
    return { activity, recess: null };
  }

  return { activity: null, recess: null };
};

/**
 * 各玩法按结果取心情加成。
 * @param {string} kind        RECESS_KIND 的取值
 * @param {string|number} outcomeKey  rps: win/draw/lose；guess: 1/2/3/miss；choice 不用
 */
export const getRecessMoodBonus = (kind, outcomeKey, rng = Math.random) => {
  const table = RECESS_MOOD[kind];
  if (Array.isArray(table)) {
    const [min, max] = table;
    return min + Math.floor(rng() * (max - min + 1));
  }
  const value = table ? table[outcomeKey] : null;
  return Number.isFinite(value) ? value : 1;
};

/**
 * 玩完一件可互动事件后调一次：写一条在校生活记录 + 给小伙伴加心情。
 * 同一个 eventId 只会落库一次（手快连点、两个标签页同时点都不会加两遍）。
 *
 * @param {number} companionId
 * @param {{
 *   event: object,          // buildRecessEvent 造的事件
 *   outcome?: string,       // 玩法自己的结果标签，只是记进 meta
 *   moodDelta: number,      // 心情加成，会被夹到 0 到 RECESS_MOOD_CAP，绝不为负
 *   text?: string,          // 记进生活记录的一句话；不传就用一句默认的
 *   companionName?: string,
 *   now?: number,
 * }} payload
 * @returns {Promise<{ row: object, moodDelta: number, duplicate: boolean }>}
 */
export const finishRecessEvent = async (companionId, {
  event,
  outcome = '',
  moodDelta = 1,
  text = '',
  companionName = '',
  now = Date.now(),
} = {}) => {
  if (!event?.eventId) throw new Error('这件课间小事已经找不到啦');

  const bonus = Math.max(0, Math.min(RECESS_MOOD_CAP, Math.round(Number(moodDelta) || 0)));
  const dayKey = getDayKey(now);
  const mateName = event.classmate?.name || '同学';
  const finalText = text || `课间，${companionName || '小伙伴'}和${mateName}一起玩了一会儿。`;

  return db.transaction('rw', [db.companionSchoolLife, db.companions], async () => {
    const todayRows = await db.companionSchoolLife
      .where('[companionId+date]')
      .equals([companionId, dayKey])
      .toArray();
    const existing = todayRows.find((r) => r.meta?.recessEventId === event.eventId);
    if (existing) {
      return { row: existing, moodDelta: existing.meta?.moodDelta ?? 0, duplicate: true };
    }

    const row = {
      companionId,
      date: dayKey,
      kind: LIFE_KIND.ACTIVITY,
      text: finalText,
      meta: {
        recess: true,
        recessKind: event.kind,
        recessEventId: event.eventId,
        classmateId: event.classmate?.id || null,
        outcome,
        moodDelta: bonus,
      },
      createdAt: now,
    };
    row.id = await db.companionSchoolLife.add(row);

    if (bonus > 0) {
      const companion = await db.companions.get(companionId);
      if (companion) {
        await db.companions.update(companionId, {
          mood: clamp100((companion.mood ?? 0) + bonus),
          updatedAt: now,
        });
      }
    }

    return { row, moodDelta: bonus, duplicate: false };
  });
};