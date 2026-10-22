/*
 * CompanionSchoolRecessGuess.jsx —— 「猜词」玩法组件（课间事件切片 C）。
 *
 * 登记在 companionSchoolRecessBodies.js 里，由 CompanionSchoolRecessModal
 * 渲染在旁白和角色下面。流程：
 *   loading  同学在想词：向 AI 要一道题（失败就用兜底词库，见
 *            companionSchoolRecessGuessAiService.js），通常一两秒
 *   play     便利贴线索一条一条放出来，玩家替小伙伴写答案：
 *              - 猜对了：三颗带脸的星星依次弹出
 *              - 猜错了：这条线索贴上粉色"猜错了"小标，放出下一条
 *              - 第 3 条也猜错：公布答案，算没猜中
 *   end      揭晓后稍等一下（让星星弹完），调一次 onDone 交给外壳落库，
 *            外壳随后显示"+N 心情"和"收下"
 * 外壳落库失败时（disabled 恢复、settled 仍为空），这里会出现一个"记下来"
 * 按钮，让玩家能再试一次，结果不会重新抽。
 *
 * 判定、兜底词库、结果文案在 companionSchoolRecessGuessRules.js；样式在
 * schoolRecessGuess.css（前缀 rc-guess-），外壳通用样式在 schoolRecess.css。
 * 同学的贴图由外壳负责，这里不画任何小动物。
 *
 * Props（约定见 companionSchoolRecessBodies.js）:
 *   event, companion, disabled, settled, onDone
 */

import React, { useEffect, useRef, useState } from 'react';

import './school.css';
import './schoolRecess.css';
import './schoolRecessGuess.css';

import { RECESS_KIND } from './companionSchoolRecessData';
import { getRecessMoodBonus } from './companionSchoolRecessService';
import {
  GUESS_CLUE_COUNT,
  GUESS_INPUT_MAX,
  GUESS_OUTCOME_LABELS,
  GUESS_MATE_MOOD,
  isGuessCorrect,
  normalizeGuess,
  pickFallbackPuzzle,
  buildGuessResultText,
} from './companionSchoolRecessGuessRules';
import { prepareGuessPuzzle } from './companionSchoolRecessGuessAiService';

/* 揭晓后等一下再落库，让三颗星星弹完。 */
const SETTLE_MS = 900;

/* ---------------- 小图形（纯 SVG，颜色沿用外壳那几个柔和色） ---------------- */

/* 图钉：小星星 */
const PinStar = ({ color = '#FF86A0', size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={color} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

/* 小锁：没放出来的线索 */
const LockGlyph = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="5" y="11" width="14" height="10" rx="3" fill="currentColor" />
    <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

/* 带脸的星星：猜中后依次弹出 */
const FaceStar = ({ size = 56, className = '' }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <polygon
      points="24,4 29.9,17.2 44,18.7 33.4,28.3 36.5,42.3 24,35 11.5,42.3 14.6,28.3 4,18.7 18.1,17.2"
      fill="#FFE27A" stroke="#D19A0A" strokeWidth="2.6" strokeLinejoin="round"
    />
    <ellipse cx="19.2" cy="23.5" rx="1.8" ry="2.4" fill="#7A5600" />
    <ellipse cx="28.8" cy="23.5" rx="1.8" ry="2.4" fill="#7A5600" />
    <ellipse cx="15.6" cy="28.4" rx="2.6" ry="1.7" fill="#FF86A0" opacity="0.55" />
    <ellipse cx="32.4" cy="28.4" rx="2.6" ry="1.7" fill="#FF86A0" opacity="0.55" />
    <path d="M20.4 28.6q3.6 3.6 7.2 0" fill="none" stroke="#7A5600" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const outcomeToLabel = (key) => (key === 'miss' ? 'miss' : `clue${key}`);

const CompanionSchoolRecessGuess = ({ event, companion, disabled = false, settled = null, onDone }) => {
  const [puzzle, setPuzzle] = useState(null);
  const [revealed, setRevealed] = useState(1); // 已经放出几条线索
  const [wrongs, setWrongs] = useState([]); // [{ idx, text }]
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [shakeIdx, setShakeIdx] = useState(-1);
  const [ending, setEnding] = useState(null); // { key, correct, outcome, moodDelta, text, mateMood }
  const [sent, setSent] = useState(0);

  const inputRef = useRef(null);
  const autoSentRef = useRef(false);

  const mate = event?.classmate;
  const mateName = mate?.name || '同学';
  const petName = companion?.name || '小伙伴';

  /* 取题：prepareGuessPuzzle 永远返回一道可玩的题，这里再兜一层以防万一 */
  useEffect(() => {
    let cancelled = false;
    prepareGuessPuzzle({ companionId: companion?.id })
      .then((res) => { if (!cancelled) setPuzzle(res.puzzle); })
      .catch(() => { if (!cancelled) setPuzzle(pickFallbackPuzzle({})); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if (!ending) return;
    setSent((n) => n + 1);
    onDone?.({
      outcome: ending.outcome,
      moodDelta: ending.moodDelta,
      text: ending.text,
      mateMood: ending.mateMood,
    });
  };

  /* 揭晓后稍等，只自动调一次 */
  useEffect(() => {
    if (!ending || autoSentRef.current) return undefined;
    const timer = setTimeout(() => {
      autoSentRef.current = true;
      submit();
    }, SETTLE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ending]);

  const finish = (key) => {
    setEnding({
      key,
      correct: key !== 'miss',
      outcome: outcomeToLabel(key),
      moodDelta: getRecessMoodBonus(RECESS_KIND.GUESS, key),
      mateMood: GUESS_MATE_MOOD[key] || 'happy',
      text: buildGuessResultText({
        outcome: key,
        name: petName,
        mate: mateName,
        answer: puzzle?.answer,
      }),
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!puzzle || ending || disabled || settled) return;

    const text = draft.trim();
    if (!text) return;

    if (isGuessCorrect(text, puzzle)) {
      setDraft('');
      setNotice('');
      finish(revealed);
      return;
    }

    const norm = normalizeGuess(text);
    if (wrongs.some((w) => normalizeGuess(w.text) === norm)) {
      setNotice('这个已经猜过啦，换一个吧');
      return;
    }

    const idx = revealed - 1;
    setWrongs((list) => [...list, { idx, text }]);
    setShakeIdx(idx);
    setDraft('');
    setNotice('');

    if (revealed >= GUESS_CLUE_COUNT) {
      finish('miss');
    } else {
      setRevealed(revealed + 1);
      /* 保持输入框聚焦，手机键盘不用反复弹出 */
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  /* 键盘弹出后把输入框带回可视范围 */
  const handleFocus = () => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 320);
  };

  /* ---------------- 取题中 ---------------- */
  if (!puzzle) {
    return (
      <div className="rc-guess">
        <div className="rc-guess-wait" role="status">
          <FaceStar size={44} className="rc-guess-wait-star" />
          <p>{mateName}正在想一个词，等一下哦</p>
        </div>
      </div>
    );
  }

  const playing = !ending && !settled;
  const canRetry = Boolean(ending) && sent > 0 && !disabled && !settled;
  const hitIdx = ending?.correct ? ending.key - 1 : -1;

  return (
    <div className="rc-guess">
      {playing && (
        <p className="rc-guess-hint">替{petName}写下答案，每条线索只有一次机会</p>
      )}

      <ul className="rc-guess-notes">
        {puzzle.clues.map((clue, i) => {
          const open = i < revealed;
          const wrong = wrongs.find((w) => w.idx === i);
          const isHit = i === hitIdx;
          const isNow = playing && i === revealed - 1;
          const cls = [
            'rc-guess-note',
            open ? 'is-open' : 'is-locked',
            wrong ? 'is-wrong' : '',
            isHit ? 'is-hit' : '',
            isNow ? 'is-now' : '',
            shakeIdx === i ? 'is-shake' : '',
          ].filter(Boolean).join(' ');
          const pinColor = isHit ? '#5CC9A0' : (open ? '#FF86A0' : '#C5D6E6');

          return (
            <li key={i} className={cls} onAnimationEnd={() => { if (shakeIdx === i) setShakeIdx(-1); }}>
              <span className="rc-guess-pin"><PinStar color={pinColor} /></span>
              <span className="rc-guess-no">线索 {i + 1}</span>
              {open ? (
                <p className="rc-guess-text">{clue}</p>
              ) : (
                <p className="rc-guess-text is-lock">
                  <LockGlyph />
                  <span>还没放出来</span>
                </p>
              )}
              {wrong && (
                <>
                  <span className="rc-guess-tag">猜错了</span>
                  <span className="rc-guess-said">猜的是「{wrong.text}」</span>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {playing && (
        <form className="rc-guess-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="rc-guess-input"
            type="text"
            value={draft}
            maxLength={GUESS_INPUT_MAX}
            placeholder="写下你的答案"
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={disabled}
            onChange={(e) => { setDraft(e.target.value); if (notice) setNotice(''); }}
            onFocus={handleFocus}
          />
          <button type="submit" className="rc-guess-go" disabled={disabled || !draft.trim()}>
            猜
          </button>
        </form>
      )}

      {playing && notice && <p className="rc-guess-warn" role="status">{notice}</p>}

      {ending && (
        <div className="rc-guess-end">
          {ending.correct && (
            <div className="rc-guess-stars" aria-hidden="true">
              <FaceStar size={58} className="rc-guess-star s1" />
              <FaceStar size={72} className="rc-guess-star s2" />
              <FaceStar size={58} className="rc-guess-star s3" />
            </div>
          )}
          <div className={`rc-guess-badge ${ending.correct ? 'is-ok' : 'is-miss'}`} role="status">
            {GUESS_OUTCOME_LABELS[ending.key]}
          </div>
          <p className="rc-guess-answer">
            答案是<b>{puzzle.answer}</b>
          </p>
          {canRetry && (
            <button type="button" className="rc-btn" onClick={submit}>
              记下来
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CompanionSchoolRecessGuess;