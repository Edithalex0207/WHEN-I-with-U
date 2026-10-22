/*
 * companionSchoolHomeworkService.js —— 「老师的嘱托」的触发与待批嘱托读写。
 *
 * 【这个文件管什么】
 * 1. rollHomeworkTask：做完一组题后调一次（跟 rollCampusBreak 是两次独立的
 *    roll，互不影响）。当前没有未批嘱托，并且命中概率时，造一份新作业，
 *    存进 db.settings，返回它；没中 / 已经有一份未批的 / 没入学，返回 null。
 * 2. getHomeworkTask / clearHomeworkTask：学校页横幅和弹窗读、批完删。
 * 3. 造作业用的纯函数（buildHomeworkTask、pickQuizItems、pickEssayTopic、
 *    pickFixedEssay、describeHomework），后面切片 B / C 也会用。
 *
 * 【未批嘱托存哪】
 * 不新增 Dexie 表，不改 db 版本：存在 db.settings 的一行，
 * key = 'companionSchoolHomeworkTask:<小伙伴 id>'，刷新页面不会变，批完删掉。
 * 同一个小伙伴同时最多一份。存的内容（同学只存 id，读出来时再补上名册里的
 * 整个对象）：
 *   {
 *     taskId, type, stage, classmateId, createdAt,
 *     entryLine, scene,                       // 造作业时定下来的两句话
 *     quiz:  { subject, items: [{ id, stem, mateAnswer, isCorrect, rightAnswer }] } | null,
 *     essay: { topicId, title, text, source: 'fixed' | 'ai' } | null,
 *   }
 *
 * 切片 A 只管造、存、读；批改和落库（写生活记录、加心心心情）在切片 B / C。
 *
 * 只 import db、companionSchoolData、companionSchoolService、
 * companionSchoolRecessData、companionSchoolHomeworkData。
 */

import db from '../../../db';
import { SCHOOL_STAGE } from './companionSchoolData';
import { getSchoolRecord } from './companionSchoolService';
import { RECESS_CLASSMATES } from './companionSchoolRecessData';
import {
  HOMEWORK_TRIGGER_CHANCE,
  HOMEWORK_DEBUG_ALWAYS,
  HOMEWORK_DEBUG_FORCE_TYPE,
  HOMEWORK_TYPE,
  HOMEWORK_LIVE_TYPES,
  HOMEWORK_ESSAY_SHARE,
  HOMEWORK_QUIZ_COUNT,
  HOMEWORK_TASK_KEY_PREFIX,
  HOMEWORK_QUIZ_SUBJECTS,
  HOMEWORK_QUIZ_SUBJECT_LABELS,
  HOMEWORK_QUIZ_BANK,
  HOMEWORK_ESSAY_NAMES,
  HOMEWORK_ESSAY_TOPICS,
  HOMEWORK_ENTRY_LINES,
  HOMEWORK_SCENES,
} from './companionSchoolHomeworkData';

/* ---------------- 小工具 ---------------- */

const pickOne = (list, rng) => list[Math.floor(rng() * list.length)];

const shuffle = (list, rng) => {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const fillTemplate = (text, vars) => Object.keys(vars).reduce(
  (acc, key) => acc.split(`{${key}}`).join(vars[key]),
  text,
);

/** 学段不认识时退回小学（小学是最后一个学段，题目更通用）。 */
const resolveStage = (stage) => (
  stage === SCHOOL_STAGE.KINDERGARTEN ? SCHOOL_STAGE.KINDERGARTEN : SCHOOL_STAGE.PRIMARY
);

export const getHomeworkTaskKey = (companionId) => `${HOMEWORK_TASK_KEY_PREFIX}${companionId}`;

const findClassmate = (id) => RECESS_CLASSMATES.find((c) => c.id === id) || null;

/* ---------------- 造作业：题目类 ---------------- */

/**
 * 从某学段某科目的题库里抽 count 道题，顺序打乱，并保证"同学的答案有对有错"
 * （抽出来全对或全错时，拿一道相反的换掉最后一道）。
 */
export const pickQuizItems = (stage, subject, rng = Math.random, count = HOMEWORK_QUIZ_COUNT) => {
  const pool = HOMEWORK_QUIZ_BANK[resolveStage(stage)]?.[subject] || [];
  const shuffled = shuffle(pool, rng);
  const picked = shuffled.slice(0, count);
  const rest = shuffled.slice(count);

  if (picked.length >= 2) {
    const hasRight = picked.some((item) => item.isCorrect);
    const hasWrong = picked.some((item) => !item.isCorrect);
    if (!hasRight || !hasWrong) {
      const wantCorrect = !hasRight;
      const swapIn = rest.find((item) => item.isCorrect === wantCorrect);
      if (swapIn) picked[picked.length - 1] = swapIn;
    }
  }
  return picked.map((item) => ({ ...item }));
};

/* ---------------- 造作业：小作文 ---------------- */

/** 随机挑一个小作文题目（切片 C 让 AI 写的时候也用它）。 */
export const pickEssayTopic = (rng = Math.random, excludeTopicId = null) => {
  const pool = HOMEWORK_ESSAY_TOPICS.filter((t) => t.id !== excludeTopicId);
  return pickOne(pool.length ? pool : HOMEWORK_ESSAY_TOPICS, rng);
};

/**
 * 取一篇固定小作文（AI 没配置 / 失败时的兜底，切片 A 也直接用它）。
 * @returns {{ topicId, title, text, source:'fixed' }}
 */
export const pickFixedEssay = (stage, rng = Math.random, topic = null) => {
  const useTopic = topic || pickEssayTopic(rng);
  const stageData = useTopic.stages[resolveStage(stage)] || useTopic.stages[SCHOOL_STAGE.PRIMARY];
  return {
    topicId: useTopic.id,
    title: useTopic.title,
    text: pickOne(stageData.essays, rng),
    source: 'fixed',
  };
};

/* ---------------- 作业的名字 ---------------- */

/**
 * 这份作业在界面上叫什么。
 * @returns {{ what: string, title: string }}
 *   what   嵌进句子里用（"数学作业本""小作文"）
 *   title  弹窗里作业纸上的标题（小作文是题目本身）
 */
export const describeHomework = (task) => {
  if (!task) return { what: '作业', title: '作业' };
  if (task.type === HOMEWORK_TYPE.ESSAY) {
    const what = HOMEWORK_ESSAY_NAMES[resolveStage(task.stage)] || '小作文';
    return { what, title: task.essay?.title || what };
  }
  const subjectLabel = HOMEWORK_QUIZ_SUBJECT_LABELS[task.quiz?.subject] || '课堂';
  const what = `${subjectLabel}作业本`;
  return { what, title: what };
};

/* ---------------- 造一份新作业（纯函数，不写库） ---------------- */

/** 按比例挑作业种类；测试开关打开时用开关里的种类。 */
export const pickHomeworkType = (rng = Math.random) => {
  const live = HOMEWORK_LIVE_TYPES;
  if (!live.length) return null;
  if (HOMEWORK_DEBUG_FORCE_TYPE && live.includes(HOMEWORK_DEBUG_FORCE_TYPE)) return HOMEWORK_DEBUG_FORCE_TYPE;
  if (live.length === 1) return live[0];
  return rng() < HOMEWORK_ESSAY_SHARE ? HOMEWORK_TYPE.ESSAY : HOMEWORK_TYPE.QUIZ;
};

/**
 * 造一份新作业。只是个对象，不写库、不调 AI。
 * 小作文这里先放一篇固定的；切片 C 会在调用处用 AI 写的那篇换掉 task.essay。
 */
export const buildHomeworkTask = ({
  stage,
  type,
  classmate = null,
  companionName = '',
  now = Date.now(),
  rng = Math.random,
} = {}) => {
  const useStage = resolveStage(stage);
  const useType = type || pickHomeworkType(rng);
  const mate = classmate || pickOne(RECESS_CLASSMATES, rng);

  const task = {
    taskId: `hw-${now}-${Math.floor(rng() * 1000000)}`,
    type: useType,
    stage: useStage,
    classmateId: mate.id,
    createdAt: now,
    entryLine: '',
    scene: '',
    quiz: null,
    essay: null,
  };

  if (useType === HOMEWORK_TYPE.ESSAY) {
    task.essay = pickFixedEssay(useStage, rng);
  } else {
    const subject = pickOne(HOMEWORK_QUIZ_SUBJECTS, rng);
    task.quiz = { subject, items: pickQuizItems(useStage, subject, rng) };
  }

  const vars = {
    name: companionName || '小伙伴',
    mate: mate.name,
    what: describeHomework(task).what,
  };
  task.entryLine = fillTemplate(pickOne(HOMEWORK_ENTRY_LINES[useType], rng), vars);
  task.scene = fillTemplate(pickOne(HOMEWORK_SCENES[useType], rng), vars);
  return task;
};

/* ---------------- 读写待批嘱托 ---------------- */

/** 从库里读出来的内容是不是一份能用的作业。 */
const isUsableTask = (value) => {
  if (!value || typeof value !== 'object' || !value.taskId) return false;
  if (value.type === HOMEWORK_TYPE.QUIZ) {
    return Array.isArray(value.quiz?.items) && value.quiz.items.length > 0;
  }
  if (value.type === HOMEWORK_TYPE.ESSAY) {
    return typeof value.essay?.text === 'string' && value.essay.text.length > 0;
  }
  return false;
};

/** 读出来之后补上同学名册里的整个对象（库里只存 id）。 */
const hydrateTask = (value) => ({
  ...value,
  classmate: findClassmate(value.classmateId) || RECESS_CLASSMATES[0],
});

/** 读这个小伙伴当前未批的嘱托；没有（或内容坏了）返回 null。 */
export const getHomeworkTask = async (companionId) => {
  const row = await db.settings.get(getHomeworkTaskKey(companionId));
  return isUsableTask(row?.value) ? hydrateTask(row.value) : null;
};

/**
 * 存（覆盖）一份嘱托。切片 C 里"换一篇"换掉小作文后用它写回去。
 * 同学对象不会存进去，只存 classmateId。
 */
export const saveHomeworkTask = async (companionId, task) => {
  const { classmate, ...plain } = task || {};
  if (!isUsableTask(plain)) throw new Error('这份作业没有准备好');
  await db.settings.put({ key: getHomeworkTaskKey(companionId), value: plain });
  return hydrateTask(plain);
};

/** 批完之后删掉这一行。 */
export const clearHomeworkTask = async (companionId) => {
  await db.settings.delete(getHomeworkTaskKey(companionId));
};

/* ---------------- 触发 ---------------- */

/**
 * 做完一组题之后调一次。
 *
 * @param {number} companionId
 * @param {{
 *   stage?: string,           // SCHOOL_STAGE 的取值；不传就读学籍
 *   companionName?: string,
 *   now?: number,
 *   rng?: function,
 * }} options
 * @returns {Promise<object|null>} 新作业（已存库，带 classmate）；
 *   没中 / 已经有未批的 / 没入学 / 没有可出的种类，都是 null
 */
export const rollHomeworkTask = async (companionId, {
  stage = null,
  companionName = '',
  now = Date.now(),
  rng = Math.random,
} = {}) => {
  if (!HOMEWORK_LIVE_TYPES.length) return null;

  // 已经有一份没批完的，就不再出新的（同时最多一份）
  if (await getHomeworkTask(companionId)) return null;

  const chance = HOMEWORK_DEBUG_ALWAYS ? 1 : HOMEWORK_TRIGGER_CHANCE;
  if (rng() >= chance) return null;

  let useStage = stage;
  if (!useStage) {
    const record = await getSchoolRecord(companionId);
    if (!record) return null; // 没入学，不出作业
    useStage = record.stage;
  }

  const task = buildHomeworkTask({ stage: useStage, companionName, now, rng });
  const key = getHomeworkTaskKey(companionId);

  // 检查和写入放进同一个事务，防止两处同时触发出两份
  return db.transaction('rw', db.settings, async () => {
    const existing = await db.settings.get(key);
    if (isUsableTask(existing?.value)) return null;
    await db.settings.put({ key, value: task });
    return hydrateTask(task);
  });
};