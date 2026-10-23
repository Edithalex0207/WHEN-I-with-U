/*
 * companionSchoolFestivalService.js —— 「校园节日事件」的概率、冷却与落库逻辑。
 *
 * 【这个文件管什么】
 * 1. rollSchoolFestival：做完一组题后调一次（跟 rollCampusBreak、
 *    rollCollectibleCard、rollHomeworkTask 是四次互不影响的 roll）。
 *    命中了，只返回一个"待玩的节日事件"（内存里的一个对象，不写生活记录），
 *    同时写下冷却记录；没中 / 在冷却里 / 不在日期窗口里 / 没入学 / 需要 AI
 *    却没配置接口，都返回 null。
 * 2. finishSchoolFestival：玩完之后调一次，把结果写进 companionSchoolLife
 *    （kind = ACTIVITY，meta 里带节日标记），并给小伙伴加心情和心心。
 *    只有玩完才会写；中途关掉小窗算放弃，什么都不会写、不会加心情和心心。
 * 3. 一些小工具：getFestival、isInFestivalWindow、hasFestivalApiConfig 等。
 *
 * 【冷却存哪】
 * 不新增 Dexie 表，不改 db 版本：存在 db.settings 的一行，
 * key = 'companionSchoolFestivalLast:<小伙伴 id>:<节日 id>'，
 * value = { at, eventId }。冷却从"横幅出现"那一刻算起（不是从玩完算起），
 * 所以抽到了没点开，这一轮也算用掉了，不会连着弹。
 *
 * 【为什么没配置接口就不出】
 * 需要 AI 现写文字的节日（needsApi），没配置接口的玩家打开后只能看到报错，
 * 所以 roll 的时候就跳过，玩家根本不会看到这个横幅。配置了但调用失败，
 * 是玩法组件里提示的事，不在这里。
 *
 * 只 import db、companionSchoolData、companionSchoolService、
 * companionSchoolRecessService（借 pickClassmate）、companionSchoolFestivalData。
 */

import db from '../../../db';
import { LIFE_KIND } from './companionSchoolData';
import { getSchoolRecord, getDayKey } from './companionSchoolService';
import { pickClassmate } from './companionSchoolRecessService';
import {
  FESTIVALS,
  FESTIVAL_LIVE_IDS,
  FESTIVAL_DEBUG_ALWAYS,
  FESTIVAL_DEBUG_FORCE_ID,
  FESTIVAL_COOLDOWN_KEY_PREFIX,
  FESTIVAL_HEARTS_CAP,
  FESTIVAL_MOOD_CAP,
  OPEN_DAY_ENTRY_LINES,
  OPEN_DAY_SCENES,
  FESTIVAL_ID,
} from './companionSchoolFestivalData';

/* ---------------- 小工具 ---------------- */

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp100 = (value) => Math.max(0, Math.min(100, value));
const round1 = (value) => Math.round(value * 10) / 10;

const pickOne = (list, rng) => list[Math.floor(rng() * list.length)];

const fillTemplate = (text, vars) => Object.keys(vars).reduce(
  (acc, key) => acc.split(`{${key}}`).join(vars[key]),
  text,
);

/** 每个节日自己的"入口横幅一句话"和"开场旁白"素材。 */
const FESTIVAL_TEXTS = {
  [FESTIVAL_ID.OPEN_DAY]: { entry: OPEN_DAY_ENTRY_LINES, scene: OPEN_DAY_SCENES },
};

/** 按 id 取节日登记；不认识返回 null。 */
export const getFestival = (festivalId) => FESTIVALS[festivalId] || null;

export const getFestivalCooldownKey = (companionId, festivalId) => (
  `${FESTIVAL_COOLDOWN_KEY_PREFIX}${companionId}:${festivalId}`
);

/* ---------------- 接口配置 ---------------- */

/**
 * 读玩家配置的 AI 接口。没有 baseUrl 或 apiKey 就算没配置，返回 null。
 * 节日的 AI 服务文件也用这一个（写法跟猜词、嘱托的 getApiConfig 一致）。
 */
export const getFestivalApiConfig = async () => {
  const apiSettings = await db.settings.get('apiConfig');
  const apiConfig = apiSettings?.value || {};
  if (!apiConfig.baseUrl || !apiConfig.apiKey) return null;
  return apiConfig;
};

export const hasFestivalApiConfig = async () => Boolean(await getFestivalApiConfig());

/* ---------------- 日期窗口 ---------------- */

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * 现在是不是在这个节日的日期窗口里。window 为 null 表示全年都可以。
 * from 晚于 to 表示跨年（比如 '12-20' 到 '01-05'）。
 */
export const isInFestivalWindow = (festival, now = Date.now()) => {
  const win = festival?.window;
  if (!win || !win.from || !win.to) return true;
  const d = new Date(now);
  const md = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  if (win.from <= win.to) return md >= win.from && md <= win.to;
  return md >= win.from || md <= win.to;
};

/* ---------------- 冷却 ---------------- */

export const getFestivalLastAt = async (companionId, festivalId) => {
  try {
    const row = await db.settings.get(getFestivalCooldownKey(companionId, festivalId));
    const at = Number(row?.value?.at);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
};

const isCoolingDown = (lastAt, festival, now) => (
  lastAt != null && now - lastAt < festival.cooldownDays * DAY_MS
);

/* ---------------- 造事件 ---------------- */

/**
 * 造一个"待玩的节日事件"。只是内存里的一个对象，不写库：玩完才会通过
 * finishSchoolFestival 落库，所以放弃的事件不会留下任何生活记录。
 *
 * @returns {{
 *   eventId: string, festivalId: string, stage: string|null,
 *   classId: string|null, teacherId: string|null,
 *   classmates: object[],   // RECESS_CLASSMATES 里的几位，互不重复
 *   entryLine: string, scene: string, createdAt: number,
 * }}
 */
export const buildFestivalEvent = ({
  festival,
  stage = null,
  classId = null,
  teacherId = null,
  companionName = '',
  now = Date.now(),
  rng = Math.random,
} = {}) => {
  const def = festival || FESTIVALS[FESTIVAL_ID.OPEN_DAY];
  const names = { name: companionName || '小伙伴' };
  const texts = FESTIVAL_TEXTS[def.id] || { entry: [], scene: [] };

  const classmates = [];
  const usedIds = [];
  for (let i = 0; i < (def.classmateCount || 1); i += 1) {
    const mate = pickClassmate(rng, usedIds);
    classmates.push(mate);
    usedIds.push(mate.id);
  }

  return {
    eventId: `festival-${def.id}-${now}-${Math.floor(rng() * 1000000)}`,
    festivalId: def.id,
    stage,
    classId,
    teacherId,
    classmates,
    entryLine: texts.entry.length ? fillTemplate(pickOne(texts.entry, rng), names) : def.title,
    scene: texts.scene.length ? fillTemplate(pickOne(texts.scene, rng), names) : '',
    createdAt: now,
  };
};

/* ---------------- 触发 ---------------- */

/**
 * 做完一组题之后调一次。
 *
 * @param {number} companionId
 * @param {{
 *   stage?: string,           // SCHOOL_STAGE 的取值；不传就读学籍
 *   classId?: string, teacherId?: string,
 *   companionName?: string,
 *   now?: number,
 *   rng?: function,
 * }} options
 * @returns {Promise<object|null>} 待玩的节日事件（buildFestivalEvent 的返回值）；
 *   没中 / 在冷却里 / 不在窗口里 / 没入学 / 需要接口却没配置，都是 null
 */
export const rollSchoolFestival = async (companionId, {
  stage = null,
  classId = null,
  teacherId = null,
  companionName = '',
  now = Date.now(),
  rng = Math.random,
} = {}) => {
  const liveIds = FESTIVAL_DEBUG_ALWAYS && FESTIVAL_DEBUG_FORCE_ID
    ? FESTIVAL_LIVE_IDS.filter((id) => id === FESTIVAL_DEBUG_FORCE_ID)
    : FESTIVAL_LIVE_IDS;
  if (!liveIds.length) return null;

  let useStage = stage;
  let useClassId = classId;
  let useTeacherId = teacherId;
  if (!useStage) {
    const record = await getSchoolRecord(companionId);
    if (!record) return null; // 没入学，不出节日
    useStage = record.stage;
    useClassId = useClassId || record.classId || null;
    useTeacherId = useTeacherId || record.teacherId || null;
  }

  // 按登记顺序一个一个试，第一个命中的就是这次的节日
  for (let i = 0; i < liveIds.length; i += 1) {
    const festival = getFestival(liveIds[i]);
    if (!festival) continue;

    if (!FESTIVAL_DEBUG_ALWAYS) {
      if (!isInFestivalWindow(festival, now)) continue;
      if (festival.needsApi && !(await hasFestivalApiConfig())) continue;
      if (isCoolingDown(await getFestivalLastAt(companionId, festival.id), festival, now)) continue;
      if (rng() >= festival.chance) continue;
    }

    const event = buildFestivalEvent({
      festival,
      stage: useStage,
      classId: useClassId,
      teacherId: useTeacherId,
      companionName,
      now,
      rng,
    });

    // 检查冷却和写入放进同一个事务，防止两个标签页同时触发出两次
    const key = getFestivalCooldownKey(companionId, festival.id);
    const taken = await db.transaction('rw', db.settings, async () => {
      const row = await db.settings.get(key);
      const lastAt = Number(row?.value?.at);
      if (!FESTIVAL_DEBUG_ALWAYS && Number.isFinite(lastAt) && isCoolingDown(lastAt, festival, now)) {
        return false;
      }
      await db.settings.put({ key, value: { at: now, eventId: event.eventId } });
      return true;
    });
    if (taken) return event;
  }

  return null;
};

/* ---------------- 玩完落库 ---------------- */

/**
 * 玩完一个节日事件后调一次：写一条在校生活记录 + 给小伙伴加心情和心心。
 * 同一个 eventId 只会落库一次（手快连点、两个标签页同时点都不会加两遍），
 * 重复调用时直接返回第一次写下的那一行，duplicate 为 true。
 *
 * 心情只加不减，夹到 0 到 FESTIVAL_MOOD_CAP；心心同理，夹到 0 到
 * FESTIVAL_HEARTS_CAP，保留一位小数。
 *
 * @param {number} companionId
 * @param {{
 *   event: object,          // buildFestivalEvent 造的事件
 *   outcome?: string,       // 结果标签，只是记进 meta
 *   hearts?: number,        // 这次给的心心
 *   moodDelta?: number,     // 这次给的心情
 *   text?: string,          // 记进生活记录的一句话；不传就用一句默认的
 *   meta?: object,          // 额外记进 meta 的内容（职业、同学的话……）
 *   companionName?: string,
 *   now?: number,
 * }} payload
 * @returns {Promise<{ row: object, hearts: number, moodDelta: number, duplicate: boolean }>}
 */
export const finishSchoolFestival = async (companionId, {
  event,
  outcome = '',
  hearts = 0,
  moodDelta = 0,
  text = '',
  meta = {},
  companionName = '',
  now = Date.now(),
} = {}) => {
  if (!event?.eventId) throw new Error('这个节日已经找不到啦');
  const festival = getFestival(event.festivalId);
  if (!festival) throw new Error('这个节日已经找不到啦');

  const gainedHearts = Math.max(0, Math.min(FESTIVAL_HEARTS_CAP, round1(Number(hearts) || 0)));
  const gainedMood = Math.max(0, Math.min(FESTIVAL_MOOD_CAP, Math.round(Number(moodDelta) || 0)));
  const dayKey = getDayKey(now);
  const eventDayKey = getDayKey(event.createdAt || now);
  const finalText = text || `${festival.title}，${companionName || '小伙伴'}和同学们一起度过了一天。`;

  return db.transaction('rw', [db.companionSchoolLife, db.companions], async () => {
    // 事件可能是昨天 23 点多出的横幅，所以今天和出事件那天的记录都查一遍
    const dayKeys = dayKey === eventDayKey ? [dayKey] : [dayKey, eventDayKey];
    for (let i = 0; i < dayKeys.length; i += 1) {
      const rows = await db.companionSchoolLife
        .where('[companionId+date]')
        .equals([companionId, dayKeys[i]])
        .toArray();
      const existing = rows.find((r) => r.meta?.festivalEventId === event.eventId);
      if (existing) {
        return {
          row: existing,
          hearts: existing.meta?.hearts ?? 0,
          moodDelta: existing.meta?.moodDelta ?? 0,
          duplicate: true,
        };
      }
    }

    const row = {
      companionId,
      date: dayKey,
      kind: LIFE_KIND.ACTIVITY,
      text: finalText,
      meta: {
        ...meta,
        festival: true,
        festivalId: event.festivalId,
        festivalEventId: event.eventId,
        classmateIds: (event.classmates || []).map((c) => c.id),
        outcome,
        hearts: gainedHearts,
        moodDelta: gainedMood,
      },
      createdAt: now,
    };
    row.id = await db.companionSchoolLife.add(row);

    if (gainedHearts > 0 || gainedMood > 0) {
      const companion = await db.companions.get(companionId);
      if (companion) {
        await db.companions.update(companionId, {
          mood: clamp100((companion.mood ?? 0) + gainedMood),
          hearts: round1((companion.hearts || 0) + gainedHearts),
          updatedAt: now,
        });
      }
    }

    return { row, hearts: gainedHearts, moodDelta: gainedMood, duplicate: false };
  });
};