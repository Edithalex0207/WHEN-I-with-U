/*
 * companionSchoolQuizService.js —— 「上学」的做题层：自己出的题、抽题、
 * 一组做完后的结算（奖励 + 做题记录 + 错题本）。
 *
 * 【一组题的流程】
 * 1. UI 调 startQuizSet(companionId, { mode, subjectIds })：检查能不能做
 *    （入学了没、今天次数、冷却），然后抽 5 题返回。选择题的选项已经打乱，
 *    answer 已经按打乱后的顺序换算好，UI 直接按返回值显示和判断就行。
 *    start 本身不扣次数——中途退出不算做了一组。
 * 2. 用户逐题作答，UI 自己记下每题选了什么。
 * 3. 做完调 finishQuizSet(companionId, played)：这里才记一组（次数、冷却从
 *    这一刻开始算），发心心和心情，写做题记录，答错的进错题本。整个结算在
 *    一个 Dexie 事务里，要么全成功要么全不写。
 *
 * 【题目的统一形状（play question）】
 * {
 *   qid,       // 预设 'k-cn-007' / 自己的题 'u-12'；错题本、做题记录都按它引用
 *   source,    // 'preset' | 'manual' | 'ai'
 *   subject,   // 'cn' | 'ma' | 'kn' | 'en' | 'custom'
 *   type,      // 'choice' | 'judge'
 *   stem, explain,
 *   options,   // 选择题：打乱后的选项数组；判断题：null（界面固定显示"对 / 错"）
 *   answer,    // 选择题：正确选项在 options 里的下标；判断题：true | false
 * }
 * 作答 picked 的格式跟 answer 一致：选择题是点了第几个选项（下标），判断题是 true | false。
 *
 * 【错题本】companionSchoolWrong 里一题一行（[companionId+qid]），snapshot
 * 存了题目内容，自己出的题被删了也不影响。答错：wrongCount+1、streak 归零、
 * mastered=false。之后在任何一组里答对：streak+1，连续答对 WRONG_MASTER_STREAK
 * 次就标记 mastered=true（不删，界面默认只显示没掌握的）。
 *
 * 只 import db、companionSchoolData、companionSchoolService，不 import
 * companionService.js（避免循环依赖）。
 */

import db from '../../../db';
import { recordTaskEvent } from '../tasks/companionTaskService';
import {
  SCHOOL_LIMITS,
  SET_REWARD,
  SCHOOL_SUBJECTS,
  CUSTOM_SUBJECT_ID,
  QUESTION_TYPE,
  QUESTION_STAGE_BOTH,
  QUESTION_SOURCE,
  SCHOOL_STAGE,
  findSubject,
} from './companionSchoolData';
import { KINDERGARTEN_QUESTIONS } from './schoolQuestionsKindergarten';
import { PRIMARY_QUESTIONS } from './schoolQuestionsPrimary';
import { SchoolError, getSchoolStatus, getDayKey } from './companionSchoolService';

/* ---------------- 常量 ---------------- */
/** 抽题模式 */
export const QUIZ_MODE = {
  MIXED: 'mixed', // 预设题库 + 自己出的题混着抽
  PRESET: 'preset', // 只抽预设题库
  CUSTOM: 'custom', // 只抽自己出的题
  WRONG: 'wrong', // 只抽错题本里还没掌握的题
};

/** 连续答对几次，错题就算"掌握了" */
export const WRONG_MASTER_STREAK = 2;

/** 自己出的题最多存多少道（防止无限增长） */
export const MAX_CUSTOM_QUESTIONS = 300;

const STEM_MAX = 120;
const OPTION_MAX = 40;
const EXPLAIN_MAX = 200;

const PRESET_BY_STAGE = {
  [SCHOOL_STAGE.KINDERGARTEN]: KINDERGARTEN_QUESTIONS,
  [SCHOOL_STAGE.PRIMARY]: PRIMARY_QUESTIONS,
};

const round1 = (value) => Math.round(value * 10) / 10;
const clamp100 = (value) => Math.max(0, Math.min(100, value));

/* ---------------- 纯函数：抽样 / 打乱 ---------------- */
/** Fisher–Yates，返回新数组。rng 可以注入，方便测试。 */
export const shuffle = (list, rng = Math.random) => {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/** 不放回地随机抽 count 个；池子不够就有多少抽多少。 */
export const sampleN = (list, count, rng = Math.random) => shuffle(list, rng).slice(0, count);

/**
 * 把一道题（预设 / 自己的 / 错题本快照）变成"可以直接拿去玩"的形状：
 * 选择题打乱选项并换算 answer，判断题保持不变。
 */
export const toPlayQuestion = (raw, rng = Math.random) => {
  const base = {
    qid: raw.qid,
    source: raw.source,
    subject: raw.subject,
    type: raw.type,
    stem: raw.stem,
    explain: raw.explain || '',
  };

  if (raw.type === QUESTION_TYPE.JUDGE) {
    return { ...base, options: null, answer: Boolean(raw.answer) };
  }

  const order = shuffle(raw.options.map((_, i) => i), rng);
  return {
    ...base,
    options: order.map((i) => raw.options[i]),
    answer: order.indexOf(raw.answer),
  };
};

/* ---------------- 自己出的题：校验 + CRUD ---------------- */
const isStageValue = (v) => (
  v === SCHOOL_STAGE.KINDERGARTEN || v === SCHOOL_STAGE.PRIMARY || v === QUESTION_STAGE_BOTH
);
const isSubjectValue = (v) => v === CUSTOM_SUBJECT_ID || Boolean(findSubject(v));

/**
 * 校验并整理一道自己出的题。通过返回干净的对象，不通过抛 SchoolError('bad_question')。
 * 选择题：2–4 个选项、不能空、不能重复，answer 是选项下标；
 * 判断题：answer 必须是 true / false，不带 options。
 */
export const normalizeCustomQuestion = (input) => {
  const bad = (msg) => { throw new SchoolError('bad_question', msg); };
  if (!input || typeof input !== 'object') bad('题目内容不对');

  const type = input.type;
  if (type !== QUESTION_TYPE.CHOICE && type !== QUESTION_TYPE.JUDGE) bad('题型不对');

  const stem = String(input.stem || '').trim();
  if (!stem) bad('题干不能为空');
  if (stem.length > STEM_MAX) bad(`题干最多 ${STEM_MAX} 个字`);

  const subject = input.subject || CUSTOM_SUBJECT_ID;
  if (!isSubjectValue(subject)) bad('科目不对');
  const stage = input.stage || QUESTION_STAGE_BOTH;
  if (!isStageValue(stage)) bad('学段不对');

  const explain = String(input.explain || '').trim();
  if (explain.length > EXPLAIN_MAX) bad(`解析最多 ${EXPLAIN_MAX} 个字`);

  const source = input.source === QUESTION_SOURCE.AI ? QUESTION_SOURCE.AI : QUESTION_SOURCE.MANUAL;

  if (type === QUESTION_TYPE.JUDGE) {
    if (typeof input.answer !== 'boolean') bad('判断题要选"对"还是"错"');
    return { subject, stage, type, stem, options: null, answer: input.answer, explain, source };
  }

  const options = Array.isArray(input.options) ? input.options.map((o) => String(o || '').trim()) : [];
  if (options.length < 2 || options.length > 4) bad('选择题需要 2 到 4 个选项');
  if (options.some((o) => !o)) bad('选项不能为空');
  if (options.some((o) => o.length > OPTION_MAX)) bad(`每个选项最多 ${OPTION_MAX} 个字`);
  if (new Set(options).size !== options.length) bad('选项不能重复');
  if (!Number.isInteger(input.answer) || input.answer < 0 || input.answer >= options.length) {
    bad('要选一个正确答案');
  }
  return { subject, stage, type, stem, options, answer: input.answer, explain, source };
};

export const getCustomQuestions = async (companionId) => {
  const rows = await db.companionSchoolQuestions.where('companionId').equals(companionId).toArray();
  return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

export const addCustomQuestion = async (companionId, input) => {
  const clean = normalizeCustomQuestion(input);
  const count = await db.companionSchoolQuestions.where('companionId').equals(companionId).count();
  if (count >= MAX_CUSTOM_QUESTIONS) {
    throw new SchoolError('too_many', `自己出的题最多 ${MAX_CUSTOM_QUESTIONS} 道，先删掉一些吧`);
  }
  const row = { companionId, ...clean, createdAt: Date.now() };
  const id = await db.companionSchoolQuestions.add(row);
  return { ...row, id };
};

/**
 * 批量加题（AI 出题预览确认后用）。每道单独校验：不合格的跳过并记录原因，
 * 合格的照常入库，不会因为一道坏题让整批失败。超出上限的也会被跳过。
 * @returns {{added:object[], errors:{index:number, message:string}[]}}
 */
export const addCustomQuestions = async (companionId, list) => {
  const added = [];
  const errors = [];
  for (let i = 0; i < list.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      added.push(await addCustomQuestion(companionId, list[i]));
    } catch (err) {
      if (err instanceof SchoolError) errors.push({ index: i, message: err.message });
      else throw err;
    }
  }
  return { added, errors };
};

export const updateCustomQuestion = async (questionId, input) => {
  const current = await db.companionSchoolQuestions.get(questionId);
  if (!current) throw new SchoolError('bad_question', '这道题已经不存在了');
  const clean = normalizeCustomQuestion({ ...input, source: input.source || current.source });
  await db.companionSchoolQuestions.update(questionId, clean);
  return { ...current, ...clean };
};

export const deleteCustomQuestion = async (questionId) => {
  await db.companionSchoolQuestions.delete(questionId);
};

/* ---------------- 错题本 ---------------- */
/** 默认只返回还没掌握的；includeMastered 为 true 时连已掌握的一起返回。最近错的在前。 */
export const getWrongBook = async (companionId, { includeMastered = false } = {}) => {
  const rows = await db.companionSchoolWrong.where('companionId').equals(companionId).toArray();
  return rows
    .filter((r) => includeMastered || !r.mastered)
    .sort((a, b) => (b.lastWrongAt || 0) - (a.lastWrongAt || 0));
};

/* ---------------- 抽题 ---------------- */
const rawFromPreset = (q) => ({ ...q, qid: q.id, source: 'preset' });
const rawFromCustom = (row) => ({
  qid: `u-${row.id}`,
  source: row.source === QUESTION_SOURCE.AI ? QUESTION_SOURCE.AI : QUESTION_SOURCE.MANUAL,
  subject: row.subject,
  stage: row.stage,
  type: row.type,
  stem: row.stem,
  options: row.options,
  answer: row.answer,
  explain: row.explain,
});

/**
 * 组出"这个学段、这个模式下"所有可抽的题（还没打乱选项）。
 * subjectIds 为空数组 / 不传 = 不限科目。
 */
export const buildQuestionPool = async (companionId, stage, { mode = QUIZ_MODE.MIXED, subjectIds = [] } = {}) => {
  const subjectOk = (subject) => subjectIds.length === 0 || subjectIds.includes(subject);

  if (mode === QUIZ_MODE.WRONG) {
    const rows = await getWrongBook(companionId);
    return rows
      .filter((r) => subjectOk(r.snapshot?.subject))
      .map((r) => ({
        qid: r.qid,
        source: r.snapshot.source || 'preset',
        subject: r.snapshot.subject,
        type: r.snapshot.type,
        stem: r.snapshot.stem,
        options: r.snapshot.options,
        answer: r.snapshot.answer,
        explain: r.snapshot.explain,
      }));
  }

  const pool = [];

  if (mode === QUIZ_MODE.MIXED || mode === QUIZ_MODE.PRESET) {
    (PRESET_BY_STAGE[stage] || []).forEach((q) => {
      if (subjectOk(q.subject)) pool.push(rawFromPreset(q));
    });
  }

  if (mode === QUIZ_MODE.MIXED || mode === QUIZ_MODE.CUSTOM) {
    const rows = await getCustomQuestions(companionId);
    rows.forEach((row) => {
      if ((row.stage === stage || row.stage === QUESTION_STAGE_BOTH) && subjectOk(row.subject)) {
        pool.push(rawFromCustom(row));
      }
    });
  }

  return pool;
};

/**
 * 开始一组题：检查资格 + 抽题。不扣次数、不发奖励。
 * @param {number} companionId
 * @param {{mode?:string, subjectIds?:string[], count?:number, rng?:function}} options
 * @returns {{stage:string, mode:string, questions:object[]}}
 * @throws {SchoolError} not_enrolled / daily_limit / cooldown / no_questions
 */
export const startQuizSet = async (companionId, {
  mode = QUIZ_MODE.MIXED,
  subjectIds = [],
  count = SCHOOL_LIMITS.QUESTIONS_PER_SET,
  rng = Math.random,
} = {}) => {
  const status = await getSchoolStatus(companionId);
  if (!status.enrolled) throw new SchoolError('not_enrolled', '还没有办理入学');
  if (!status.canPlay) {
    throw new SchoolError(
      status.reason,
      status.reason === 'daily_limit' ? '今天的做题次数用完啦，明天再来吧' : '休息一下，等一会儿再来',
    );
  }

  const pool = await buildQuestionPool(companionId, status.stage, { mode, subjectIds });
  if (pool.length === 0) {
    throw new SchoolError(
      'no_questions',
      mode === QUIZ_MODE.WRONG ? '错题本里没有需要复习的题啦' : '没有可以抽的题，换个科目或模式试试',
    );
  }

  const questions = sampleN(pool, count, rng).map((q) => toPlayQuestion(q, rng));
  return { stage: status.stage, mode, questions };
};

/* ---------------- 结算 ---------------- */
const isCorrect = (question, picked) => {
  if (question.type === QUESTION_TYPE.JUDGE) return picked === question.answer;
  return Number.isInteger(picked) && picked === question.answer;
};

const subjectLabel = (id) => (id === CUSTOM_SUBJECT_ID ? '自选' : (findSubject(id)?.label || ''));

const snapshotOf = (question) => ({
  source: question.source,
  subject: question.subject,
  type: question.type,
  stem: question.stem,
  options: question.options,
  answer: question.answer,
  explain: question.explain,
});

/**
 * 一组做完，结算。
 *
 * @param {number} companionId
 * @param {Array<{question:object, picked:(number|boolean|null)}>} played
 *        question 就是 startQuizSet 返回的那道题（原样传回来），picked 是用户的选择。
 *        对错由这里按 question.answer 重新判断，不信任界面传来的对错。
 * @param {{mode?:string}} options  记在做题记录里，方便以后看
 * @returns {{
 *   set:object,            // 写进 companionSchoolSets 的那一行
 *   correct:number, total:number, perfect:boolean,
 *   heartsGained:number, moodGained:number,
 *   wrongQids:string[],
 *   companion:object,      // 更新后的小伙伴（hearts / mood 已变）
 *   status:object,         // 更新后的 getSchoolStatus（次数 / 冷却 / 升班进度）
 * }}
 */
export const finishQuizSet = async (companionId, played, {
  mode = QUIZ_MODE.MIXED,
  rewardMultiplier = 1,
  countsTowardDailyLimit = true,
} = {}) => {
  if (!Array.isArray(played) || played.length === 0) {
    throw new SchoolError('no_questions', '没有做完的题');
  }

  const now = Date.now();
  const total = played.length;
  const graded = played.map(({ question, picked }) => ({
    question,
    picked: picked === undefined ? null : picked,
    ok: isCorrect(question, picked),
  }));
  const correct = graded.filter((g) => g.ok).length;
  const perfect = correct === total;

  const heartsGained = round1(
    (correct * SET_REWARD.HEARTS_PER_CORRECT + (perfect ? SET_REWARD.PERFECT_BONUS_HEARTS : 0)) * rewardMultiplier,
  );
  const moodGained = round1((SET_REWARD.MOOD_BASE + correct * SET_REWARD.MOOD_PER_CORRECT) * rewardMultiplier);

  let setRow = null;
  const wrongQids = [];

  await db.transaction(
    'rw',
    [
      db.companions,
      db.companionSchool,
      db.companionSchoolSets,
      db.companionSchoolWrong,
      db.companionLogs,
    ],
    async () => {
      const companion = await db.companions.get(companionId);
      if (!companion) throw new SchoolError('no_companion', '小伙伴不存在');
      const record = await db.companionSchool.where('companionId').equals(companionId).first();
      if (!record) throw new SchoolError('not_enrolled', '还没有办理入学');

      // 1. 小伙伴数值
      await db.companions.update(companionId, {
        hearts: round1((companion.hearts || 0) + heartsGained),
        mood: clamp100((companion.mood ?? 0) + moodGained),
        updatedAt: now,
      });

           // 2. 学籍上的计数：升班进度（stageSets）不管哪种方式做的都照常累计；
      // 今天几组/最后完成时间（daySets/lastSetAt，决定用户自己的每日名额和
      // 冷却）只在 countsTowardDailyLimit 时才更新——托管上课不占这个名额。
      const schoolChanges = { stageSets: (record.stageSets || 0) + 1 };
      if (countsTowardDailyLimit) {
        const todayKey = getDayKey(now);
        schoolChanges.dayKey = todayKey;
        schoolChanges.daySets = (record.dayKey === todayKey ? (record.daySets || 0) : 0) + 1;
        schoolChanges.lastSetAt = now;
      }
      await db.companionSchool.update(record.id, schoolChanges);

      // 每日任务：去上两节课——做完一组题就算上了一节课，
      // 累计到任务要求的节数由 recordTaskEvent 自己算。
      await recordTaskEvent(companionId, 'school_lesson');

      // 3. 做题记录
      setRow = {
        companionId,
        finishedAt: now,
        stage: record.stage,
        mode,
        correct,
        total,
        heartsGained,
        moodGained,
        answers: graded.map((g) => ({
          qid: g.question.qid,
          subject: g.question.subject,
          picked: g.picked,
          ok: g.ok,
        })),
      };
      setRow.id = await db.companionSchoolSets.add(setRow);

      // 4. 错题本：答错的入库 / 加次数；曾经错过又答对的累计 streak
      for (const g of graded) {
        const { qid } = g.question;
        // eslint-disable-next-line no-await-in-loop
        const existing = await db.companionSchoolWrong
          .where('[companionId+qid]')
          .equals([companionId, qid])
          .first();

        if (!g.ok) {
          wrongQids.push(qid);
          if (existing) {
            // eslint-disable-next-line no-await-in-loop
            await db.companionSchoolWrong.update(existing.id, {
              wrongCount: (existing.wrongCount || 0) + 1,
              lastWrongAt: now,
              streak: 0,
              mastered: false,
              snapshot: snapshotOf(g.question),
            });
          } else {
            // eslint-disable-next-line no-await-in-loop
            await db.companionSchoolWrong.add({
              companionId,
              qid,
              wrongCount: 1,
              lastWrongAt: now,
              streak: 0,
              mastered: false,
              snapshot: snapshotOf(g.question),
            });
          }
        } else if (existing && !existing.mastered) {
          const streak = (existing.streak || 0) + 1;
          // eslint-disable-next-line no-await-in-loop
          await db.companionSchoolWrong.update(existing.id, {
            streak,
            mastered: streak >= WRONG_MASTER_STREAK,
          });
        }
      }

      // 5. 日志
      const subjectNames = [...new Set(graded.map((g) => subjectLabel(g.question.subject)).filter(Boolean))];
      await db.companionLogs.add({
        companionId,
        logType: 'user_action',
        actionType: 'school_quiz',
        content: `做完一组${subjectNames.join('、')}题，对了 ${correct}/${total} 题，得到 ${heartsGained} 心心。`,
        timestamp: now,
      });
    },
  );

  return {
    set: setRow,
    correct,
    total,
    perfect,
    heartsGained,
    moodGained,
    wrongQids,
    companion: await db.companions.get(companionId),
    status: await getSchoolStatus(companionId, now),
  };
};

/** 方便界面做"科目筛选"下拉：预设四科 + 自定义 */
export const QUIZ_SUBJECT_OPTIONS = [
  ...SCHOOL_SUBJECTS.map((s) => ({ id: s.id, label: s.label })),
  { id: CUSTOM_SUBJECT_ID, label: '自选' },
];