// src/apps/tripHome/TripMemoryGame.jsx
//
// 「翻牌配对」小游戏：商店页"小游戏赚旅费"入口打开的弹层。6 对共 12 张牌，
// 翻两张配对，配完按用了多少步结算旅费（步数越少拿得越多，曲线见
// tripCatalog.js 的 TRIP_MEMORY_GAME_REWARDS）。每天能玩的次数见
// TRIP_MEMORY_GAME_MAX_PLAYS，判断用本地日期，过了 0 点就算新的一天。
//
// 纯前端小游戏，不涉及 AI、不写回角色聊天——跟明信片收藏是两回事，这次先
// 把"小游戏赚旅费"这块立起来。

import React, { useState } from 'react';

import { TRIP_MEMORY_GAME_PAIRS, getTripReasonText } from './tripCatalog';
import { claimMemoryGameReward, getMemoryGameView } from './tripService';
import { CoinDot } from './TripParts';

const STATUS = {
  IDLE: 'idle',
  PLAYING: 'playing',
  DONE: 'done',
};

const MISMATCH_PAUSE_MS = 650;

const shuffle = (list) => {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const buildDeck = () =>
  shuffle(
    TRIP_MEMORY_GAME_PAIRS.flatMap((pair) => [
      { key: `${pair.id}-a`, pairId: pair.id, label: pair.label, colorClass: pair.colorClass },
      { key: `${pair.id}-b`, pairId: pair.id, label: pair.label, colorClass: pair.colorClass },
    ])
  );

// 卡片正面的图标。跟 tripCatalog.js 的 TRIP_MEMORY_GAME_PAIRS 按 id 对应，
// 加新主题时记得这里也补一个同名图标。
const ICONS = {
  ticket: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M14 6v12" strokeDasharray="2.4 2.4" />
    </svg>
  ),
  suitcase: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <path d="M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2" />
      <path d="M4 13h16" />
    </svg>
  ),
  postcard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M8 9h5M8 12.5h7" />
      <circle cx="16.5" cy="15" r="1.3" />
    </svg>
  ),
  coin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v9M9.6 9.8a2 2 0 0 1 1.9-1.4h1a1.9 1.9 0 0 1 0 3.8h-1a1.9 1.9 0 0 0 0 3.8h1a2 2 0 0 0 1.9-1.4" />
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <circle cx="12" cy="13.5" r="3.5" />
      <path d="M8 7l1.5-3h5L16 7" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 11l8-7 8 7v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
      <path d="M10 20.5v-6h4v6" />
    </svg>
  ),
};

const TripMemoryGame = ({ state, onChange, notify, onClose }) => {
  const view = getMemoryGameView(state);

  const [status, setStatus] = useState(STATUS.IDLE);
  const [deck, setDeck] = useState([]);
  const [flipped, setFlipped] = useState([]); // 当前翻开、还没判定的卡片下标（最多 2 个）
  const [matched, setMatched] = useState(new Set());
  const [moves, setMoves] = useState(0);
  const [busy, setBusy] = useState(false); // 两张不配对时短暂锁住，等它们翻回去
  const [result, setResult] = useState(null); // { reward, moves, playsLeft }

  const handleStart = () => {
    setDeck(buildDeck());
    setFlipped([]);
    setMatched(new Set());
    setMoves(0);
    setResult(null);
    setStatus(STATUS.PLAYING);
  };

  const finishGame = async (finalMoves) => {
    try {
      const outcome = await claimMemoryGameReward(finalMoves);
      if (!outcome.ok) {
        notify(getTripReasonText(outcome.reason));
        setStatus(STATUS.IDLE);
        onChange();
        return;
      }
      setResult({ reward: outcome.reward, moves: finalMoves, playsLeft: outcome.playsLeft });
      setStatus(STATUS.DONE);
      onChange();
    } catch (error) {
      console.warn('翻牌配对结算失败：', error);
      notify('结算失败，请再试一次');
      setStatus(STATUS.IDLE);
    }
  };

  const handleFlip = (index) => {
    if (busy) return;
    if (flipped.includes(index) || matched.has(index)) return;
    if (flipped.length === 2) return;

    const next = [...flipped, index];
    setFlipped(next);
    if (next.length < 2) return;

    const [a, b] = next;
    const isMatch = deck[a].pairId === deck[b].pairId;
    const nextMoves = moves + 1;
    setMoves(nextMoves);

    if (isMatch) {
      const nextMatched = new Set(matched);
      nextMatched.add(a);
      nextMatched.add(b);
      setMatched(nextMatched);
      setFlipped([]);
      if (nextMatched.size === deck.length) {
        finishGame(nextMoves);
      }
      return;
    }

    setBusy(true);
    setTimeout(() => {
      setFlipped([]);
      setBusy(false);
    }, MISMATCH_PAUSE_MS);
  };

  return (
    <div className="trip-scrim" onClick={onClose}>
      <div className="trip-sheet trip-mg-sheet" onClick={(event) => event.stopPropagation()}>
        <h2 className="trip-sheet-title trip-sheet-title--center">翻牌配对</h2>

        {status === STATUS.IDLE && (
          <div className="trip-mg-intro">
            <p className="trip-hint trip-hint--center">
              翻开两张牌，配成一对就留在桌上。全部配完按用了多少步结算旅费，步数越少拿得越多。
            </p>
            <div className="trip-mg-stats">
              <span>
                今天还能玩 <b>{view.playsLeft}</b> / {view.maxPlays} 次
              </span>
              {view.bestMoves ? <span>最佳 {view.bestMoves} 步</span> : null}
            </div>
            <button type="button" className="trip-btn" disabled={view.playsLeft <= 0} onClick={handleStart}>
              {view.playsLeft <= 0 ? '明天再来' : '开始'}
            </button>
            <button type="button" className="trip-btn trip-btn--ghost trip-mg-close" onClick={onClose}>
              先不玩了
            </button>
          </div>
        )}

        {status === STATUS.PLAYING && (
          <>
            <div className="trip-mg-bar">已用 {moves} 步</div>
            <div className="trip-mg-grid">
              {deck.map((card, index) => {
                const isUp = flipped.includes(index) || matched.has(index);
                const isDone = matched.has(index);
                return (
                  <button
                    key={card.key}
                    type="button"
                    className={`trip-mg-card ${card.colorClass}${isUp ? ' is-up' : ''}${isDone ? ' is-done' : ''}`}
                    onClick={() => handleFlip(index)}
                    disabled={isUp}
                    aria-label={isUp ? card.label : '翻开'}
                  >
                    {isUp ? (
                      <span className="trip-mg-card__icon">{ICONS[card.pairId]}</span>
                    ) : (
                      <span className="trip-mg-card__back" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {status === STATUS.DONE && result && (
          <div className="trip-mg-result">
            <p className="trip-mg-reward">
              <CoinDot />+{result.reward}
            </p>
            <p className="trip-hint trip-hint--center">
              用了 {result.moves} 步配完。今天还能玩 {result.playsLeft} 次。
            </p>
            <div className="trip-sheet-row">
              <button
                type="button"
                className="trip-btn trip-btn--ghost"
                disabled={result.playsLeft <= 0}
                onClick={handleStart}
              >
                再玩一次
              </button>
              <button type="button" className="trip-btn" onClick={onClose}>
                收下旅费
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TripMemoryGame;