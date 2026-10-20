/*
 * companionCustodySchoolService.js —— 「托管上课」：小伙伴已经入学时，
 * "托管给角色"开着的话，顺手把当天的课也带上。
 *
 * 规则（跟用户确认过的设计一致）：
 *   - 复用已有的「托管给角色」开关，不单独加开关。
 *   - 每天只带 1 组（5 题），不占用户自己的每日 3 组名额——走同一题库/
 *     结算（finishQuizSet），但只计入 stageSets（升班进度）和每日任务
 *     school_lesson（finishQuizSet 内部本来就会做），不计入
 *     companionSchool 的 daySets/冷却——详见 finishQuizSet 的
 *     countsTowardDailyLimit 参数。
 *   - 按固定正确率（CUSTODY_SCHOOL_ACCURACY，占位值）随机抽题随机对错，
 *     答错一样进错题本。
 *   - 奖励是亲自做题的一半（finishQuizSet 的 rewardMultiplier 参数）。
 *   - 单独一封「学校信」，跟喂食清洁那封分开：companions.custodySchoolPendingLetter。
 *     内容 = 一条随机校园小事（复用 companionSchoolActivities.js 的素材，
 *     走 rollCampusActivity，没中就是 null）+ 一句成绩
 *     （companionSchoolGradeLines.js，单独数据文件，之后自己扩充）。
 *   - 考砸（5 题答对 <=1 题）心情 -8（占位值），并留一次「安慰一下」的
 *     机会：用户手写一段安慰话，有成功率（跟用户确认：有概率不起效，不是
 *     必定成功），只能安慰一次。这段话只在小伙伴这边消化，不喂给角色聊天
 *     的 AI 上下文——跟用户确认过，角色和小伙伴是两个不同的东西。
 *
 * 数据：全部是 db.companions 上不建索引的新字段，不升级 schema 版本：
 *   custodySchoolDaily         { dateStr }                                今天带没带过
 *   custodySchoolPendingLetter { id, timestamp, activityText, gradeLine,
 *                                 correct, total, badScore }               学校信
 *   custodySchoolComfort       { id, timestamp, used, text?, succeeded? }  待安慰 / 安慰结果
 *
 * 依赖方向：本文件 import companionSchoolQuizService.js /
 * companionSchoolService.js / companionSchoolActivityService.js /
 * companionSchoolGradeLines.js，反过来它们都不 import 本文件或
 * companionCustodyService.js，没有循环依赖。由 companionCustodyService.js
 * 的 runCustodyForCompanion 顺路调用。
 */

import db from '../../../db';
import { getSchoolStatus } from '../school/companionSchoolService';
import {
  buildQuestionPool,
  sampleN,
  toPlayQuestion,
  finishQuizSet,
  QUIZ_MODE,
} from '../school/companionSchoolQuizService';
import { rollCampusActivity } from '../school/companionSchoolActivityService';
import { pickGradeLine } from '../school/companionSchoolGradeLines';
import { SCHOOL_LIMITS } from '../school/companionSchoolData';

// 托管上课固定正确率（占位值，等实玩再调）。
const CUSTODY_SCHOOL_ACCURACY = 0.6;
// 托管上课的奖励是亲自做题的一半。
const CUSTODY_SCHOOL_REWARD_MULTIPLIER = 0.5;
// 考砸：5 题答对 <= 这个数就算考砸。
const CUSTODY_BAD_SCORE_MAX_CORRECT = 1;
// 考砸的心情惩罚（占位值）。
const CUSTODY_BAD_SCORE_MOOD_PENALTY = 8;
// 安慰成功率（占位值，用户确认"有成功率，可能不起效"，不是必定成功）。
const COMFORT_SUCCESS_RATE = 0.65;
// 安慰成功时心情回涨（占位值，不完全抵消 -8，意思意思）。
const COMFORT_MOOD_RECOVER = 5;
const COMFORT_TEXT_MAX = 200;

const clamp100 = (value) => Math.max(0, Math.min(100, value));

const todayDateStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/*
 * 按固定正确率，给一组题随机生成"谁对谁错"的作答。
 * 每道题先掷一次骰子决定这题对不对：对就直接给正确答案，错就随便给一个
 * 不等于正确答案的选项（判断题就取反）。
 */
const fakeAnswerSet = (questions, accuracy, rng) => questions.map((question) => {
  if (rng() < accuracy) return { question, picked: question.answer };

  if (question.type === 'judge') {
    return { question, picked: !question.answer };
  }
  const wrongOptions = question.options.map((_, i) => i).filter((i) => i !== question.answer);
  const picked = wrongOptions[Math.floor(rng() * wrongOptions.length)];
  return { question, picked };
});

/*
 * 托管带一组课。调用方（companionCustodyService.js）已经确认
 * custodyEnabled 才会调这个函数，这里只管"今天带没带过"+"入学了没"+
 * "有没有题可抽"。
 * @returns {boolean} 这次是否真的带了课。
 */
export const runCustodySchoolLesson = async (companionId, { now = Date.now(), rng = Math.random } = {}) => {
  const companion = await db.companions.get(companionId);
  if (!companion) return false;

  const dateStr = todayDateStr();
  if (companion.custodySchoolDaily?.dateStr === dateStr) return false;

  const status = await getSchoolStatus(companionId, now);
  if (!status.enrolled) return false;

  const pool = await buildQuestionPool(companionId, status.stage, { mode: QUIZ_MODE.MIXED });
  if (pool.length === 0) return false;

  const questions = sampleN(pool, SCHOOL_LIMITS.QUESTIONS_PER_SET, rng).map((q) => toPlayQuestion(q, rng));
  const played = fakeAnswerSet(questions, CUSTODY_SCHOOL_ACCURACY, rng);

  let result;
  try {
    result = await finishQuizSet(companionId, played, {
      mode: QUIZ_MODE.MIXED,
      rewardMultiplier: CUSTODY_SCHOOL_REWARD_MULTIPLIER,
      countsTowardDailyLimit: false,
    });
  } catch (error) {
    console.error('[Companion] 托管上课结算失败:', error);
    return false;
  }

  // 随手弹一件校园小事（复用现成素材库；没中就是 null，不影响信的其它部分）。
  let activity = null;
  try {
    activity = await rollCampusActivity(companionId, {
      classId: status.classId,
      teacherId: status.teacherId,
      companionName: companion.name,
      now,
      rng,
    });
  } catch (error) {
    console.error('[Companion] 托管上课校园小事失败:', error);
  }

  const badScore = result.correct <= CUSTODY_BAD_SCORE_MAX_CORRECT;

  // 把这一轮的所有改动（占今天的名额、扣心情、留信、留安慰机会）合成一次写入。
  const latest = await db.companions.get(companionId);
  if (!latest) return true;

  const changes = {
    custodySchoolDaily: { dateStr },
    custodySchoolPendingLetter: {
      id: now,
      timestamp: now,
      activityText: activity?.text || null,
      gradeLine: pickGradeLine({ correct: result.correct, total: result.total, companionName: companion.name, rng }),
      correct: result.correct,
      total: result.total,
      badScore,
    },
    updatedAt: now,
  };
  if (badScore) {
    changes.mood = clamp100((latest.mood ?? 0) - CUSTODY_BAD_SCORE_MOOD_PENALTY);
    changes.custodySchoolComfort = { id: now, timestamp: now, used: false };
  }
  await db.companions.update(companionId, changes);

  await db.companionLogs.add({
    companionId,
    logType: 'custody_care',
    actionType: 'custody_school',
    content: `替TA去上了一节课，对了 ${result.correct}/${result.total} 题，${badScore ? '看起来有点沮丧' : '还算顺利'}。`,
    timestamp: now,
  });

  return true;
};

/*
 * 取走还没弹过的学校信（取走即清空，保证"弹一次"）。没有就返回 null。
 * 注意：custodySchoolComfort（待安慰）是单独字段，不随这里清空——取信之后
 * 只要还没安慰过，安慰的机会仍然在。
 */
export const takePendingCustodySchoolLetter = async (companionId) => {
  const companion = await db.companions.get(companionId);
  const letter = companion?.custodySchoolPendingLetter || null;
  if (!letter) return null;
  await db.companions.update(companionId, { custodySchoolPendingLetter: null });
  return letter;
};

export class CustodyComfortError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CustodyComfortError';
    this.code = code;
  }
}

/*
 * 安慰一下：用户手写一段话，提交后按成功率判定要不要回涨心情。
 * 只能安慰一次——没有待安慰记录，或者已经用过了，直接抛错（code: 'no_pending'）。
 * 这段话只写进 custodySchoolComfort.text 自己留存，不写进 db.messages，
 * 不会进入角色聊天的 AI 上下文。
 */
export const comfortCompanionAfterBadLesson = async (companionId, text, { rng = Math.random } = {}) => {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new CustodyComfortError('empty_text', '写点什么安慰TA吧');

  const companion = await db.companions.get(companionId);
  if (!companion) throw new CustodyComfortError('no_companion', '小伙伴不存在');

  const pending = companion.custodySchoolComfort;
  if (!pending || pending.used) {
    throw new CustodyComfortError('no_pending', '现在没有需要安慰的事');
  }

  const succeeded = rng() < COMFORT_SUCCESS_RATE;
  const now = Date.now();

  await db.companions.update(companionId, {
    custodySchoolComfort: {
      ...pending,
      used: true,
      text: trimmed.slice(0, COMFORT_TEXT_MAX),
      succeeded,
    },
    mood: succeeded ? clamp100((companion.mood ?? 0) + COMFORT_MOOD_RECOVER) : companion.mood,
    updatedAt: now,
  });

  await db.companionLogs.add({
    companionId,
    logType: 'user_action',
    actionType: 'custody_school_comfort',
    content: succeeded ? '写了一段话安慰TA，TA好像好多了。' : '写了一段话安慰TA，TA好像还是有点闷闷的。',
    timestamp: now,
  });

  return { succeeded, companion: await db.companions.get(companionId) };
};