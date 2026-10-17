/*
 * CompanionSchoolQuizModal.jsx —— 做题闯关 + 一组做完的结算。
 * 对应预览 school-preview.html 第 4、5 屏（已定稿）。
 *
 * 【流程】
 * 1. 打开时调 startQuizSet(companionId, { mode, subjectIds }) 抽一组题，
 *    不扣次数。
 * 2. 逐题作答：选完立刻判对错、显示解析，答案和选项锁住；点"下一题"才
 *    进下一题。
 * 3. 最后一题答完点"下一题"，这时才调 finishQuizSet 一次性结算（计组数、
 *    发奖励、写错题本），进结算页。
 * 4. 结算页：星级 + 心心/心情/长大进度三个数字 + 这组的错题 + 今明两天
 *    还能做几组。「回到小伙伴」关闭弹窗；「错题本」交给 onReviewWrong
 *    （这个组件自己不渲染错题本，由首页弹窗决定接下来开哪个）。
 *
 * 题目来源出错（比如题库是空的、次数突然用完）时显示一句提示 + 关闭按钮，
 * 不堆复杂的重试逻辑。
 *
 * 【校园小事】结算成功后顺带调一次 rollCampusActivity（见
 * companionSchoolActivityService.js）：有概率弹一件小事，命中就在结算页
 * 多显示一张"校园小事"卡片（+ 一点点心情）。这个 roll 是异步的、独立于
 * finishQuizSet，失败/没中都不影响已经显示的做题结果，所以这里对它的结果
 * 不做任何 try 之外的处理。
 *
 * Props:
 *   companion      object    —— 当前小伙伴
 *   mode           string    —— QUIZ_MODE 的取值（mixed / preset / custom / wrong）
 *   subjectIds     string[]  —— 空数组 = 不限科目
 *   onClose        function  —— 关闭弹窗
 *   onFinished     function(result)  —— 结算完成后调用，调用方据此刷新学校状态
 *   onReviewWrong  function  —— 结算页点"错题本"时调用
 */

import React, { useEffect, useState } from 'react';

import './school.css';
import './quiz.css';
import './schoolCards.css';

import { SET_REWARD, findSubject } from './companionSchoolData';
import { startQuizSet, finishQuizSet } from './companionSchoolQuizService';
import { rollCampusActivity } from './companionSchoolActivityService';
import { rollCollectibleCard } from './companionSchoolCardService';
import { CARD_RARITY_LABELS } from './companionSchoolCardCatalog';
import { CloseGlyph, CheckGlyph, StarGlyph, PetFace, CardArt } from './SchoolArt';

const CHEER_RIGHT = ['答对啦！你好厉害', '哇，答对了！', '太棒啦，这题对了！', '好厉害，一下就对了！'];
const CHEER_WRONG = ['没关系，下次一定会对的', '差一点点，再接再厉', '别灰心，下一题加油', '没事没事，再想想下一题'];
const RESULT_LINES = ['今天也学到了新东西！', '感觉又长大了一点点呢。', '下次还要继续加油！'];
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

const CompanionSchoolQuizModal = ({ companion, mode, subjectIds = [], onClose, onFinished, onReviewWrong }) => {
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null); // 选择题：下标；判断题：true/false
  const [submitted, setSubmitted] = useState(false);
  const [cheer, setCheer] = useState('');
  const [played, setPlayed] = useState([]); // [{ question, picked }]
  const [result, setResult] = useState(null); // finishQuizSet 的返回值
  const [activity, setActivity] = useState(null); // rollCampusActivity 的返回值，没中是 null
  const [cardDrop, setCardDrop] = useState(null); // rollCollectibleCard 的返回值，没中是 null
  const [resultLine] = useState(() => pickRandom(RESULT_LINES));
  const [errorMsg, setErrorMsg] = useState('');
  const [finishing, setFinishing] = useState(false);

  /* ---------------- 开局抽题 ---------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await startQuizSet(companion.id, { mode, subjectIds });
        if (cancelled) return;
        setQuestions(data.questions);
      } catch (err) {
        if (!cancelled) setErrorMsg(err?.message || '题目没能准备好，再试一次吧');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = questions.length;
  const current = questions[index] || null;
  const isLast = index === total - 1;
  const isAnswerCorrect = (q, p) => p === q.answer;

  const handlePick = (value) => {
    if (submitted || !current) return;
    const ok = isAnswerCorrect(current, value);
    setPicked(value);
    setSubmitted(true);
    setCheer(pickRandom(ok ? CHEER_RIGHT : CHEER_WRONG));
    setPlayed((prev) => [...prev, { question: current, picked: value }]);
  };

  const handleNext = async () => {
    if (!submitted || finishing) return;
    if (!isLast) {
      setIndex((i) => i + 1);
      setPicked(null);
      setSubmitted(false);
      setCheer('');
      return;
    }
    setFinishing(true);
    try {
      const res = await finishQuizSet(companion.id, played, { mode });
      setResult(res);
      onFinished?.(res);
      // 顺带 roll 一次"校园小事"和一次"收藏卡"，两次独立，互不影响；
      // 没中/出错都不影响已经结算好的做题结果，所以结果不满意也不重试。
      rollCampusActivity(companion.id, {
        classId: res.status?.record?.classId,
        teacherId: res.status?.record?.teacherId,
        companionName: companion.name,
      }).then(setActivity).catch(() => setActivity(null));
      rollCollectibleCard(companion.id).then(setCardDrop).catch(() => setCardDrop(null));
    } catch (err) {
      setErrorMsg(err?.message || '结算没有成功，再试一次吧');
    } finally {
      setFinishing(false);
    }
  };

  /* ---------------- 出错 ---------------- */
  if (errorMsg) {
    return (
      <div className="cp-overlay center">
        <div className="cp-backdrop" onClick={onClose} />
        <div className="sd-root" role="dialog" aria-label="去上课">
          <div className="sd-head">
            <button type="button" className="sd-round" aria-label="关闭" onClick={onClose}><CloseGlyph /></button>
            <div className="sd-title"><b>去上课</b></div>
            <span className="sd-round is-ghost" aria-hidden="true" />
          </div>
          <div className="sd-body is-center"><p className="sd-hint">{errorMsg}</p></div>
          <div className="sd-foot">
            <button type="button" className="sd-btn main" onClick={onClose}>知道啦</button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- 结算页 ---------------- */
  if (result) {
    const starCount = result.correct === result.total ? 3 : result.correct >= result.total - 1 ? 2 : 1;
    const wrongStems = result.wrongQids
      .map((qid) => questions.find((q) => q.qid === qid))
      .filter(Boolean);
    const { status } = result;
    const coolText = status.reason === 'daily_limit'
      ? '今天的课都上完啦 · 明天 0:00 又有 3 节新课'
      : status.reason === 'cooldown'
        ? `今天还能做 ${status.setsLeft} 组 · 下一组 30 分钟后`
        : `今天还能做 ${status.setsLeft} 组`;

    return (
      <div className="cp-overlay center">
        <div className="cp-backdrop" onClick={onClose} />
        <div className="sd-root" role="dialog" aria-label="本组完成">
          <div className="sd-head">
            <span className="sd-round is-ghost" aria-hidden="true" />
            <div className="sd-title"><b>本组完成</b></div>
            <span className="sd-round is-ghost" aria-hidden="true" />
          </div>
          <div className="sd-body qz-res">
            <div className="qz-stars">
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ color: i < starCount ? '#FFD25A' : 'var(--cp-border)' }}>
                  <StarGlyph size={i === 1 ? 62 : 44} />
                </span>
              ))}
            </div>
            {result.companion?.avatarUrl ? (
              <img src={result.companion.avatarUrl} alt={companion.name} width={96} height={96} style={{ borderRadius: '50%', objectFit: 'cover' }} draggable={false} />
            ) : (
              <PetFace size={96} />
            )}
            <h2>对了 {result.correct} 题！</h2>
            <div className="qz-sub">“{resultLine}”</div>

            <div className="qz-stat">
              <div>
                <b style={{ color: 'var(--sd-heart-deep, #D95F72)' }}>+{result.heartsGained.toFixed(1)}</b>
                <span>心心</span>
              </div>
              <div>
                <b style={{ color: 'var(--cp-sky-fg)' }}>+{result.moodGained}</b>
                <span>心情</span>
              </div>
              <div>
                <b style={{ color: 'var(--cp-mint-fg)' }}>{status.promote.done}/{status.promote.need}</b>
                <span>升班进度</span>
              </div>
            </div>

            {wrongStems.length > 0 && (
              <div className="qz-wrong">
                <h6>放进错题本 · {wrongStems.length} 题</h6>
                {wrongStems.map((q) => (
                  <p key={q.qid}>
                    <span style={{ color: 'var(--sd-heart-deep, #D95F72)' }}><CloseGlyph size={14} /></span>
                    {q.stem}
                  </p>
                ))}
              </div>
            )}

            {activity && (
              <div className="qz-activity sd-tone-lavender">
                <span className="qz-activity-ico"><StarGlyph size={16} /></span>
                <div>
                  <h6>校园小事</h6>
                  <p>
                    {activity.text}
                    {activity.moodDelta > 0 && <b> +{activity.moodDelta} 心情</b>}
                  </p>
                </div>
              </div>
            )}

            {cardDrop && (
              <div className={`qz-card-drop sd-tone-${cardDrop.card.rarity === 'hidden' ? 'lavender' : cardDrop.card.rarity === 'rare' ? 'heart' : 'sky'}`}>
                <CardArt card={cardDrop.card} size={52} />
                <div>
                  <h6>{cardDrop.isNew ? '获得新卡片' : '又抽到一张'} · {CARD_RARITY_LABELS[cardDrop.card.rarity]}</h6>
                  <p>{cardDrop.card.title}{!cardDrop.isNew && <small> ×{cardDrop.count}</small>}</p>
                </div>
              </div>
            )}

            <div className="qz-cool">{coolText}</div>
          </div>
          <div className="sd-foot qz-two">
            <button
              type="button"
              className="sd-btn ghost"
              onClick={() => { onReviewWrong?.(); }}
            >
              错题本
            </button>
            <button type="button" className="sd-btn main" onClick={onClose}>回到小伙伴</button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- 还在抽题 ---------------- */
  if (!current) {
    return (
      <div className="cp-overlay center">
        <div className="cp-backdrop" onClick={onClose} />
        <div className="sd-root" role="dialog" aria-label="去上课">
          <div className="sd-head">
            <button type="button" className="sd-round" aria-label="关闭" onClick={onClose}><CloseGlyph /></button>
            <div className="sd-title"><b>去上课</b></div>
            <span className="sd-round is-ghost" aria-hidden="true" />
          </div>
          <div className="sd-body is-center"><p className="sd-hint">正在准备小问题…</p></div>
        </div>
      </div>
    );
  }

  /* ---------------- 做题中 ---------------- */
  const progressPct = ((index + (submitted ? 1 : 0)) / total) * 100;
  const heartsSoFar = played.filter((p) => isAnswerCorrect(p.question, p.picked)).length * SET_REWARD.HEARTS_PER_CORRECT;
  const subject = findSubject(current.subject);
  const options = current.type === 'judge'
    ? [{ label: '对', value: true }, { label: '错', value: false }]
    : current.options.map((text, i) => ({ label: text, value: i }));

  return (
    <div className="cp-overlay center">
      <div className="cp-backdrop" onClick={onClose} />
      <div className="sd-root" role="dialog" aria-label="去上课">
        <div className="qz-head">
          <button type="button" className="sd-round qz-round-sm" aria-label="关闭" onClick={onClose} disabled={finishing}><CloseGlyph size={16} /></button>
          <div className="qz-bar"><i style={{ width: `${progressPct}%` }} /></div>
          <span className="qz-pill"><HeartSmall />+{heartsSoFar.toFixed(1)}</span>
        </div>

        <div className="sd-body">
          <div className="qz-meta">
            <span className="qz-subj">{subject?.label || '自选'}</span>
            <span className="qz-count">第 {index + 1} / {total} 题</span>
          </div>

          <div className="qz-cheer">
            {companion.avatarUrl ? (
              <img src={companion.avatarUrl} alt={companion.name} width={46} height={46} style={{ borderRadius: '50%', objectFit: 'cover' }} draggable={false} />
            ) : (
              <PetFace size={46} />
            )}
            {cheer && <div className="qz-bub">{cheer}</div>}
          </div>

          <div className="qz-card">
            <small>{current.type === 'judge' ? '判断题' : '选择题'}</small>
            <h3>{current.stem}</h3>
            <div className="qz-opts">
              {options.map((opt, i) => {
                const isPicked = submitted && picked === opt.value;
                const isAnswer = submitted && opt.value === current.answer;
                const cls = [
                  'qz-opt',
                  isAnswer ? 'is-ok' : '',
                  isPicked && !isAnswer ? 'is-wrong' : '',
                  submitted && !isAnswer && !isPicked ? 'is-dim' : '',
                ].filter(Boolean).join(' ');
                return (
                  <button key={i} type="button" className={cls} disabled={submitted} onClick={() => handlePick(opt.value)}>
                    {current.type !== 'judge' && <b className="qz-mark">{OPTION_LETTERS[i]}</b>}
                    {opt.label}
                    {isAnswer && <span className="qz-ok-ico"><CheckGlyph size={20} /></span>}
                    {isPicked && !isAnswer && <span className="qz-wrong-ico"><CloseGlyph size={18} /></span>}
                  </button>
                );
              })}
            </div>
          </div>

          {submitted && (
            <div className={`qz-expl ${picked === current.answer ? 'is-ok' : 'is-wrong'}`}>
              <span className="qz-expl-ico">{picked === current.answer ? <CheckGlyph size={16} /> : <CloseGlyph size={14} />}</span>
              <div>
                <h5>{picked === current.answer ? '答对了' : '答错了'}</h5>
                <p>{current.explain}</p>
              </div>
            </div>
          )}
        </div>

        <div className="sd-foot">
          <button type="button" className="sd-btn main" disabled={!submitted || finishing} onClick={handleNext}>
            {finishing ? '正在结算…' : isLast ? '完成' : '下一题'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** qz-pill 里的小心心图标（14px，固定用 heart 配色，不用再 import SchoolArt 的 HeartGlyph 传 size） */
const HeartSmall = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ color: 'var(--sd-heart-deep, #D95F72)' }}>
    <path
      d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 5 6.3 5c2 0 3.7 1.1 4.7 2.8h2C14 6.1 15.7 5 17.7 5 21 5 23.1 8.3 21.6 11.8 19.5 16.4 12 21 12 21z"
      fill="currentColor"
    />
  </svg>
);

export default CompanionSchoolQuizModal;