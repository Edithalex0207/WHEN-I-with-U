/*
 * companionSchoolHomeworkRules.js —— 批改作业的纯规则（不碰数据库、不碰 React）。
 *
 * 切片 B 先放题目类（gradeQuiz）；切片 C 的小作文打分 / 评语 / 完成度规则
 * 也会放在这个文件里。所有数值都来自 companionSchoolHomeworkData.js，
 * 想改心心档位、分数章的分值，只改那边。
 *
 * 只 import companionSchoolHomeworkData。
 */

import {
  HOMEWORK_QUIZ_SCORE_PER_RIGHT,
  HOMEWORK_QUIZ_HEARTS,
  HOMEWORK_MOOD_BY_HEARTS,
  HOMEWORK_QUIZ_REACTIONS,
} from './companionSchoolHomeworkData';

/** 按"批错"的题数取心心：从上往下找第一个够得上的档位，保底 1 颗。 */
export const getQuizHearts = (wrongJudgedCount) => {
  const tier = HOMEWORK_QUIZ_HEARTS.find((t) => wrongJudgedCount <= t.maxWrong);
  return Math.max(1, tier ? tier.hearts : 1);
};

/** 心心颗数对应的心情加成（都是正数，只加不减）。 */
export const getMoodForHearts = (hearts) => HOMEWORK_MOOD_BY_HEARTS[hearts] ?? 1;

/**
 * 给题目类作业算结果。
 *
 * @param {Array<{id:string, isCorrect:boolean, rightAnswer:string}>} items  作业里的题
 * @param {Object<string, boolean>} marks  玩家的判断：题 id -> true（批"对"）/ false（批"错"）
 * @returns {{
 *   complete: boolean,       // 每道题都批了
 *   total: number,
 *   markedRight: number,     // 批成"对"的题数
 *   score: number,           // 红笔分数 = markedRight x 每题分值
 *   judgedRight: number,     // 批对的题数：玩家的判断与真实对错一致
 *   judgedWrong: number,     // 批错的题数（批反）
 *   rows: Array<{ item, mark, flipped }>,
 *   hearts: number,
 *   moodDelta: number,
 *   reaction: { mateMood: string, line: string },
 * }}
 */
export const gradeQuiz = (items = [], marks = {}) => {
  const rows = items.map((item) => {
    const mark = marks[item.id];
    const answered = typeof mark === 'boolean';
    return { item, mark: answered ? mark : null, flipped: answered && mark !== item.isCorrect };
  });
  const total = items.length;
  const complete = total > 0 && rows.every((r) => r.mark !== null);
  const markedRight = rows.filter((r) => r.mark === true).length;
  const judgedWrong = rows.filter((r) => r.flipped).length;
  const judgedRight = rows.filter((r) => r.mark !== null && !r.flipped).length;
  const hearts = getQuizHearts(judgedWrong);
  const reaction = HOMEWORK_QUIZ_REACTIONS[judgedRight] || HOMEWORK_QUIZ_REACTIONS[0];

  return {
    complete,
    total,
    markedRight,
    score: markedRight * HOMEWORK_QUIZ_SCORE_PER_RIGHT,
    judgedRight,
    judgedWrong,
    rows,
    hearts,
    moodDelta: getMoodForHearts(hearts),
    reaction,
  };
};

/** 题目类批完后，写进生活记录的那一句话。 */
export const buildQuizResultText = ({ mateName, what, score, judgedRight, total, line }) => (
  `${mateName}的${what}批改完了，得了 ${score} 分（批对 ${judgedRight}/${total} 题）。${mateName}说：“${line}”`
);