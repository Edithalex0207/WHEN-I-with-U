/*
 * CompanionSchoolHomeworkEssay.jsx —— 小作文的批改界面。
 *
 * 渲染在 CompanionSchoolHomeworkModal 抽屉的中间，照课间事件"玩法组件"的
 * 约定来：props 为 task, companion, disabled, settled, onDone；
 * 自己不写库（落库）、不关弹窗、不显示"+N 心心 / 心情"，这些是外壳的事。
 *
 * 【小作文怎么来的（会调用 AI 接口，要让玩家知道）】
 * - 嘱托生成时放的是一篇固定小作文。第一次打开这份作业时，如果配置了 API，
 *   自动让同学现写一篇（一次 API 请求），写好就换掉固定的；写的过程中和
 *   AI 写好之后，作业纸上方都显示蓝色小条"这篇小作文由 AI 现写，会用到你
 *   配置的接口。"固定小作文不显示这条。
 * - 没配置 API / 写失败：保留固定小作文，保证一定能批，并在下面提示一句。
 * - "换一篇"：每点一次让 AI 重新写一篇（一次 API 请求），不限次数；选了
 *   分数就锁定，不能再换。没配置或失败时保持原文，提示检查 API 配置。
 * - 写好 / 换好的小作文用 updateHomeworkEssay 记回那份未批嘱托，刷新页面或
 *   重新打开不会变，也不会重复调用 AI（task.essay.aiTried）。
 *
 * 【批改流程】先选分数（70 / 80 / 90 / 100，选了就锁定小作文）；再点选评语
 * （夸夸 / 建议两类，可多选）；再可以写一句自己的话（可以不写）。
 * 点"批完了"调 onDone，外壳去落库；落库后揭晓：分数章、选的评语、自己写的
 * 那句话（原样记进生活记录，见 buildEssayResultText）。落库失败时按钮变成
 * "记下来"，可以重试，不重抽。规则（心心、同学的反应）在
 * companionSchoolHomeworkRules.js。
 *
 * Props:
 *   task      object    —— 小作文类嘱托（用 essay / classmate / stage / taskId）
 *   companion object    —— 当前小伙伴（用 id）
 *   disabled  boolean   —— 外壳正在落库时为 true
 *   settled   object|null —— 落库成功后非空
 *   onDone    function
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

import './school.css';
import './schoolHomework.css';

import {
  HOMEWORK_AI_NOTICE,
  HOMEWORK_AI_TEXTS,
  HOMEWORK_COMMENTS,
  HOMEWORK_ESSAY_HEARTS_HINT,
  HOMEWORK_ESSAY_SCORES,
  HOMEWORK_OWN_COMMENT_MAX_LEN,
} from './companionSchoolHomeworkData';
import { gradeEssay, buildEssayResultText } from './companionSchoolHomeworkRules';
import { describeHomework, updateHomeworkEssay } from './companionSchoolHomeworkService';
import { hasApiConfig, writeEssay } from './companionSchoolHomeworkAiService';

const CompanionSchoolHomeworkEssay = ({ task, companion, disabled = false, settled = null, onDone }) => {
  const mate = task?.classmate;
  const mateName = mate?.name || '同学';
  const { what } = describeHomework(task);

  const [essay, setEssay] = useState(task?.essay || null);
  const [writing, setWriting] = useState(false); // AI 正在写
  const [notice, setNotice] = useState(''); // 作业纸下面的一句提示
  const [score, setScore] = useState(null);
  const [commentIds, setCommentIds] = useState([]);
  const [ownComment, setOwnComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  const revealed = Boolean(settled);
  const locked = score !== null; // 选了分数就锁定，不能再换一篇
  const frozen = submitted || disabled || revealed;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* ---------------- 第一次打开：自动让同学现写一篇 ---------------- */
  useEffect(() => {
    if (startedRef.current || !task?.essay || task.essay.aiTried) return;
    startedRef.current = true;

    (async () => {
      // 先记下"已经试过了"，再去调接口：中途关掉重开也不会重复调
      await updateHomeworkEssay(companion.id, task.taskId, { aiTried: true }).catch(() => null);

      if (!(await hasApiConfig())) {
        if (mountedRef.current) setNotice(HOMEWORK_AI_TEXTS.noConfigFirst);
        return;
      }

      if (mountedRef.current) setWriting(true);
      const res = await writeEssay({ stage: task.stage, classmate: mate });
      if (res.status === 'ok') {
        const next = { ...res.essay, aiTried: true };
        await updateHomeworkEssay(companion.id, task.taskId, next).catch(() => null);
        if (mountedRef.current) setEssay(next);
      } else if (mountedRef.current) {
        setNotice(HOMEWORK_AI_TEXTS.failFirst);
      }
      if (mountedRef.current) setWriting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- 换一篇 ---------------- */
  const handleReroll = async () => {
    if (writing || locked || frozen) return;
    setNotice('');

    if (!(await hasApiConfig())) {
      setNotice(HOMEWORK_AI_TEXTS.noConfigReroll);
      return;
    }

    setWriting(true);
    const res = await writeEssay({ stage: task.stage, classmate: mate, avoidTopicId: essay?.topicId });
    if (res.status === 'ok') {
      const next = { ...res.essay, aiTried: true };
      await updateHomeworkEssay(companion.id, task.taskId, next).catch(() => null);
      if (mountedRef.current) setEssay(next);
    } else if (mountedRef.current) {
      setNotice(HOMEWORK_AI_TEXTS.failReroll);
    }
    if (mountedRef.current) setWriting(false);
  };

  /* ---------------- 批改 ---------------- */
  const result = useMemo(() => gradeEssay({ score, commentIds, ownComment }), [score, commentIds, ownComment]);

  const handlePickScore = (value) => {
    if (frozen || writing) return;
    setScore(value);
  };

  const toggleComment = (id) => {
    if (frozen) return;
    setCommentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const sendResult = () => {
    if (!result.complete || disabled || revealed || !essay) return;
    setSubmitted(true);
    onDone?.({
      outcome: `essay-${result.score}`,
      hearts: result.hearts,
      text: buildEssayResultText({
        mateName,
        what,
        title: essay.title,
        score: result.score,
        comments: result.comments,
        ownComment: result.ownComment,
        line: result.reaction.line,
      }),
      mateMood: result.reaction.mateMood,
      reaction: result.reaction,
      meta: {
        score: result.score,
        topicId: essay.topicId || null,
        essayTitle: essay.title,
        essayText: essay.text,
        essaySource: essay.source || 'fixed',
        commentIds: result.comments.map((c) => c.id),
        comments: result.comments.map((c) => c.text),
        ownComment: result.ownComment,
      },
    });
  };

  const retryNeeded = submitted && !disabled && !revealed; // 落库失败后回到这里
  const showAiNotice = writing || essay?.source === 'ai';
  const paperTitle = essay?.title || what;

  return (
    <>
      {showAiNotice && <p className="hw-ainote">{HOMEWORK_AI_NOTICE}</p>}

      <div className={`hw-paper${revealed ? ' is-revealed' : ''}`}>
        <i className="hw-paper-tape" />
        <div className="hw-paper-head">
          <b>{paperTitle}</b>
          {revealed ? (
            <span className="hw-stamp" aria-label={`${result.score} 分`}>
              <strong>{result.score}</strong>
              <small>分</small>
            </span>
          ) : (
            <span>{mateName}</span>
          )}
        </div>

        {writing ? (
          <div className="hw-essay hw-writing">{HOMEWORK_AI_TEXTS.writing.split('{mate}').join(mateName)}</div>
        ) : (
          <div className="hw-essay">{essay?.text}</div>
        )}
      </div>

      {notice && !revealed && <p className="hw-note" role="status">{notice}</p>}

      {!revealed && (
        <button
          type="button"
          className="hw-reroll"
          disabled={writing || locked || frozen}
          onClick={handleReroll}
        >
          {locked ? '已经打分，不能再换啦' : writing ? '正在写……' : '换一篇'}
        </button>
      )}

      {/* ---- 第一步：打分 ---- */}
      <div className="hw-sec">
        <h6>先打个分</h6>
        <div className="hw-scores" role="group" aria-label="打分">
          {HOMEWORK_ESSAY_SCORES.map((value) => (
            <button
              key={value}
              type="button"
              className={`hw-score${score === value ? ' is-on' : ''}`}
              aria-pressed={score === value}
              disabled={frozen || writing}
              onClick={() => handlePickScore(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {/* ---- 第二步：评语；第三步：自己写一句 ---- */}
      {score !== null && !revealed && (
        <>
          <div className="hw-sec">
            <h6>再选几句评语<small>可以多选，也可以不选</small></h6>
            {[['praise', '夸夸'], ['suggest', '建议']].map(([kind, label]) => (
              <div className="hw-cmt-group" key={kind}>
                <span className={`hw-cmt-label is-${kind}`}>{label}</span>
                <div className="hw-cmts">
                  {HOMEWORK_COMMENTS[kind].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`hw-cmt is-${kind}${commentIds.includes(c.id) ? ' is-on' : ''}`}
                      aria-pressed={commentIds.includes(c.id)}
                      disabled={frozen}
                      onClick={() => toggleComment(c.id)}
                    >
                      {c.text}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="hw-sec">
            <h6>再写一句自己的话<small>可以不写</small></h6>
            <textarea
              className="hw-own"
              rows={2}
              maxLength={HOMEWORK_OWN_COMMENT_MAX_LEN}
              value={ownComment}
              disabled={frozen}
              placeholder="比如：你写得很用心，继续加油。"
              onChange={(e) => setOwnComment(e.target.value)}
            />
            <p className="hw-count">{ownComment.length} / {HOMEWORK_OWN_COMMENT_MAX_LEN}</p>
          </div>

          <p className="hw-progress">{HOMEWORK_ESSAY_HEARTS_HINT}</p>
        </>
      )}

      {/* ---- 揭晓后：把选的评语和自己写的那句话留在作业纸下面 ---- */}
      {revealed && (result.comments.length > 0 || result.ownComment) && (
        <div className="hw-given">
          {result.comments.length > 0 && (
            <div className="hw-cmts">
              {result.comments.map((c) => (
                <span key={c.id} className={`hw-cmt is-${c.kind} is-on is-static`}>{c.text}</span>
              ))}
            </div>
          )}
          {result.ownComment && <p className="hw-own-read">{result.ownComment}</p>}
        </div>
      )}

      {!revealed && (
        !retryNeeded ? (
          <button
            type="button"
            className="rc-btn is-heart"
            disabled={!result.complete || disabled || submitted || writing}
            onClick={sendResult}
          >
            {disabled ? '正在记下来……' : '批完了'}
          </button>
        ) : (
          <button type="button" className="rc-btn is-heart" onClick={sendResult}>
            记下来
          </button>
        )
      )}
    </>
  );
};

export default CompanionSchoolHomeworkEssay;