/*
 * CompanionSchoolRecessRps.jsx —— 「石头剪刀布」玩法组件（课间事件切片 B）。
 *
 * 登记在 companionSchoolRecessBodies.js 里，由 CompanionSchoolRecessModal
 * 渲染在旁白和角色下面。流程：
 *   pick    替小伙伴选一个手势（三张贴图卡），点"出拳"
 *   shake   两边都是"？"，晃一下（SHAKE_MS）
 *   reveal  揭晓双方手势 + 大字结果；同时调一次 onDone 交给外壳落库，
 *           外壳随后显示"+N 心情"和"收下"
 * 外壳落库失败时（disabled 恢复、settled 仍为空），这里会出现一个"记下来"
 * 按钮，让玩家能再试一次，结果不会重新抽。
 *
 * 手势用贴图（HandSticker，没填图就是占位），所以这里不画任何手。
 * 规则和文案在 companionSchoolRecessRpsRules.js。样式在
 * schoolRecessRps.css（前缀 rc-rps-），外壳通用样式在 schoolRecess.css。
 *
 * Props（约定见 companionSchoolRecessBodies.js）:
 *   event, companion, disabled, settled, onDone
 */

import React, { useEffect, useRef, useState } from 'react';

import './school.css';
import './schoolRecess.css';
import './schoolRecessRps.css';

import { RECESS_KIND, RECESS_HAND_LABELS } from './companionSchoolRecessData';
import { getRecessMoodBonus } from './companionSchoolRecessService';
import {
  RPS_HANDS,
  RPS_OUTCOME_LABELS,
  RPS_MATE_MOOD,
  judgeRps,
  pickMateHand,
  buildRpsResultText,
} from './companionSchoolRecessRpsRules';
import { HandSticker } from './CompanionSchoolRecessSticker';

const SHAKE_MS = 900;

/* 揭晓前的"？"占位，纯色块，不是贴图。 */
const MysteryHand = ({ size = 84 }) => (
  <span
    className="rc-sticker is-ph is-hand sd-tone-lavender"
    style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
    aria-hidden="true"
  >
    ?
  </span>
);

const CompanionSchoolRecessRps = ({ event, companion, disabled = false, settled = null, onDone }) => {
  const [phase, setPhase] = useState('pick'); // pick | shake | reveal
  const [mine, setMine] = useState(null);
  const [duel, setDuel] = useState(null); // { theirs, outcome, text, moodDelta }
  const [sent, setSent] = useState(0);
  const autoSentRef = useRef(false);

  const mate = event?.classmate;

  const submit = () => {
    if (!duel) return;
    setSent((n) => n + 1);
    onDone?.({
      outcome: duel.outcome,
      moodDelta: duel.moodDelta,
      text: duel.text,
      mateMood: RPS_MATE_MOOD[duel.outcome],
    });
  };

  const handleThrow = () => {
    if (!mine || phase !== 'pick') return;
    const theirs = pickMateHand();
    const outcome = judgeRps(mine, theirs);
    setDuel({
      theirs,
      outcome,
      moodDelta: getRecessMoodBonus(RECESS_KIND.RPS, outcome),
      text: buildRpsResultText({
        outcome,
        name: companion?.name,
        mate: mate?.name,
        mine,
        theirs,
      }),
    });
    setPhase('shake');
  };

  /* shake -> reveal */
  useEffect(() => {
    if (phase !== 'shake') return undefined;
    const timer = setTimeout(() => setPhase('reveal'), SHAKE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  /* 揭晓的同时自动交给外壳落库，只自动调一次 */
  useEffect(() => {
    if (phase !== 'reveal' || !duel || autoSentRef.current) return;
    autoSentRef.current = true;
    submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const showDuel = phase === 'shake' || phase === 'reveal';
  const shaking = phase === 'shake';
  const canRetry = phase === 'reveal' && sent > 0 && !disabled && !settled;

  return (
    <div className="rc-rps">
      {phase === 'pick' && (
        <>
          <p className="rc-rps-hint">替{companion?.name || '小伙伴'}选一个</p>
          <div className="rc-rps-picks">
            {RPS_HANDS.map((hand) => (
              <button
                key={hand}
                type="button"
                className={`rc-rps-pick${mine === hand ? ' is-sel' : ''}`}
                aria-pressed={mine === hand}
                onClick={() => setMine(hand)}
              >
                {mine === hand && (
                  <span className="rc-rps-ok" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24">
                      <path d="M6 12.5l4 4 8-9" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
                <HandSticker hand={hand} size={60} />
                <span>{RECESS_HAND_LABELS[hand]}</span>
              </button>
            ))}
          </div>
          <button type="button" className="rc-btn" disabled={!mine} onClick={handleThrow}>
            出拳
          </button>
        </>
      )}

      {showDuel && duel && (
        <>
          <div className="rc-rps-duel">
            <div className={`rc-rps-side${shaking ? ' is-shake' : ''}`}>
              {shaking ? <MysteryHand /> : <HandSticker hand={mine} size={84} />}
              <span className="rc-rps-cap">{shaking ? ' ' : RECESS_HAND_LABELS[mine]}</span>
            </div>
            <span className="rc-rps-vs">VS</span>
            <div className={`rc-rps-side${shaking ? ' is-shake is-late' : ''}`}>
              {shaking ? <MysteryHand /> : <HandSticker hand={duel.theirs} size={84} />}
              <span className="rc-rps-cap">{shaking ? ' ' : RECESS_HAND_LABELS[duel.theirs]}</span>
            </div>
          </div>

          {phase === 'reveal' && (
            <div className={`rc-rps-badge is-${duel.outcome}`} role="status">
              {RPS_OUTCOME_LABELS[duel.outcome]}
            </div>
          )}

          {canRetry && (
            <button type="button" className="rc-btn" onClick={submit}>
              记下来
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default CompanionSchoolRecessRps;