/*
 * CompanionSchoolHomeworkQuiz.jsx —— 题目类作业的批改界面（作业本）。
 *
 * 渲染在 CompanionSchoolHomeworkModal 抽屉的中间，照课间事件"玩法组件"的
 * 约定来：props 为 task, companion, disabled, settled, onDone；
 * 自己不写库、不关弹窗、不显示"+N 心心 / 心情"，这些是外壳的事。
 *
 * 【流程】
 * 1. 4 道题，每题显示题干和同学的答案，玩家点"对"或"错"（可以反复改），
 *    不显示标准答案。
 * 2. 4 题都批了，底部的"批完了"才亮；点了就锁住所有判断，调
 *    onDone({ outcome, text, hearts, mateMood, reaction, meta })，外壳去落库。
 * 3. 落库成功（settled 非空）后揭晓：红笔分数章、批反的题标粉色
 *    "这题批反啦"并显示正确答案。同学的表情和一句话由外壳显示。
 * 4. 落库失败时外壳会提示一句并允许再调一次 onDone：这里"批完了"点过之后，
 *    如果既没在保存、也没落库，就显示"记下来"按钮重试（判断不变、结果不重抽）。
 *
 * 规则（分数、心心、同学反应）都在 companionSchoolHomeworkRules.js。
 * 这个界面不调 AI。
 *
 * Props:
 *   task      object    —— 题目类嘱托（用 quiz.items / classmate / stage）
 *   companion object    —— 当前小伙伴（用 name）
 *   disabled  boolean   —— 外壳正在落库时为 true
 *   settled   object|null —— 落库成功后非空
 *   onDone    function
 */

import React, { useMemo, useState } from 'react';

import './school.css';
import './schoolHomework.css';

import { CheckGlyph, CloseGlyph } from './SchoolArt';
import { gradeQuiz, buildQuizResultText } from './companionSchoolHomeworkRules';
import { describeHomework } from './companionSchoolHomeworkService';

const CompanionSchoolHomeworkQuiz = ({ task, companion, disabled = false, settled = null, onDone }) => {
  const items = task?.quiz?.items || [];
  const mateName = task?.classmate?.name || '同学';
  const { title, what } = describeHomework(task);

  const [marks, setMarks] = useState({}); // 题 id -> true（对）/ false（错）
  const [submitted, setSubmitted] = useState(false); // 点过"批完了"，判断已锁定

  const result = useMemo(() => gradeQuiz(items, marks), [items, marks]);
  const revealed = Boolean(settled);
  const markedCount = result.rows.filter((r) => r.mark !== null).length;
  const locked = submitted || disabled || revealed;

  const handleMark = (id, value) => {
    if (locked) return;
    setMarks((prev) => ({ ...prev, [id]: value }));
  };

  const sendResult = () => {
    if (!result.complete || disabled || revealed) return;
    setSubmitted(true);
    onDone?.({
      outcome: `judged-${result.judgedRight}-of-${result.total}`,
      hearts: result.hearts,
      text: buildQuizResultText({
        mateName,
        what,
        score: result.score,
        judgedRight: result.judgedRight,
        total: result.total,
        line: result.reaction.line,
      }),
      mateMood: result.reaction.mateMood,
      reaction: result.reaction,
      meta: {
        subject: task.quiz?.subject || null,
        score: result.score,
        judgedRight: result.judgedRight,
        judgedWrong: result.judgedWrong,
        marks: result.rows.map((r) => ({ id: r.item.id, mark: r.mark, isCorrect: r.item.isCorrect })),
      },
    });
  };

  const retryNeeded = submitted && !disabled && !revealed; // 落库失败后回到这里

  return (
    <>
      <div className={`hw-paper${revealed ? ' is-revealed' : ''}`}>
        <i className="hw-paper-tape" />
        <div className="hw-paper-head">
          <b>{title}</b>
          {revealed ? (
            <span className="hw-stamp" aria-label={`${result.score} 分`}>
              <strong>{result.score}</strong>
              <small>分</small>
            </span>
          ) : (
            <span>{mateName}</span>
          )}
        </div>

        <ol className="hw-rows">
          {result.rows.map(({ item, mark, flipped }, index) => (
            <li className={`hw-row${revealed && flipped ? ' is-flipped' : ''}`} key={item.id}>
              <span className="hw-no">{index + 1}</span>
              <div className="hw-row-main">
                <p className="hw-stem">{item.stem}</p>
                <p className="hw-ans">
                  <span>{mateName}的答案</span>
                  <b>{item.mateAnswer}</b>
                </p>

                {!revealed && (
                  <div className="hw-judge" role="group" aria-label={`第 ${index + 1} 题`}>
                    <button
                      type="button"
                      className={`hw-mark is-yes${mark === true ? ' is-on' : ''}`}
                      aria-pressed={mark === true}
                      disabled={locked}
                      onClick={() => handleMark(item.id, true)}
                    >
                      <CheckGlyph size={15} />
                      对
                    </button>
                    <button
                      type="button"
                      className={`hw-mark is-no${mark === false ? ' is-on' : ''}`}
                      aria-pressed={mark === false}
                      disabled={locked}
                      onClick={() => handleMark(item.id, false)}
                    >
                      <CloseGlyph size={13} />
                      错
                    </button>
                  </div>
                )}

                {revealed && (
                  <div className="hw-verdict">
                    <span className={`hw-pill ${mark ? 'is-yes' : 'is-no'}`}>你批了{mark ? '对' : '错'}</span>
                    {flipped && <span className="hw-flip">这题批反啦</span>}
                    {flipped && (
                      <span className="hw-right">
                        正确答案：<b>{item.rightAnswer}</b>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {!revealed && (
        <>
          <p className="hw-progress">
            已批 {markedCount} / {result.total} 题
            {!result.complete && <small>，每道题都批完才能交卷</small>}
          </p>
          {!retryNeeded ? (
            <button
              type="button"
              className="rc-btn is-heart"
              disabled={!result.complete || disabled || submitted}
              onClick={sendResult}
            >
              {disabled ? '正在记下来…' : '批完了'}
            </button>
          ) : (
            <button type="button" className="rc-btn is-heart" onClick={sendResult}>
              记下来
            </button>
          )}
        </>
      )}
    </>
  );
};

export default CompanionSchoolHomeworkQuiz;