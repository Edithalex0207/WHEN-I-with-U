/**
 * CompanionMarblesModal.jsx
 *
 * 「小伙伴弹珠」(祖玛式) 小游戏的模态框：选关 -> 开局说明 -> 游戏中
 * (canvas + HUD) -> 结算（通关/失败）。结构照抄 CompanionCatchGameModal.jsx
 * 的外壳约定，物理/碰撞交给 marblesEngine.js，这个文件只管 UI 状态和
 * 跟 Dexie 数据层（marblesService.js）对接。
 *
 * Props:
 *   companionId        number   — 小伙伴 ID
 *   companionAvatarUrl string   — 小伙伴头像图片 URL（画在 canvas 里当发射者）
 *   companionName       string  — 小伙伴名字
 *   onRewardApplied     function(companion) — 奖励结算后，把最新的 companion
 *                                             传回去，调用方据此刷新主页状态
 *   onClose             function — 关闭整个弹窗
 */

import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import './marbles.css';
import { LEVELS, DAILY_REWARD_LIMIT } from './marblesData';
import { getMarblesState, submitMarblesLevelClear } from './marblesService';
import { MarblesEngine } from './marblesEngine';

/* ------------------------------------------------------------------ */
/* 内联 SVG 图标（UI chrome）                                           */
/* ------------------------------------------------------------------ */

const IconBack = () => (
  <svg className="ms-ic" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const IconPlay = () => (
  <svg className="ms-ic" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
);
const IconCheck = () => (
  <svg className="ms-ic" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const IconHeartMood = () => (
  <svg className="ms-ic" viewBox="0 0 24 24"><path d="M12 21s-7-4.35-9.5-8.8C.8 8.6 2.6 5 6.1 5c2 0 3.4 1.1 4 2.4C10.6 6.1 12 5 14 5c3.5 0 5.3 3.6 3.6 7.2C19.1 16.6 12 21 12 21z" fill="currentColor" /></svg>
);
const IconBowl = () => (
  <svg className="ms-ic" viewBox="0 0 24 24"><path d="M3 11h18a9 9 0 0 1-18 0Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /><path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);
const IconHeartCoin = () => (
  <svg className="ms-ic" viewBox="0 0 24 24"><path d="M12 20s-6.5-4.2-9-8C1.3 8.8 2.6 5.8 5.6 5.4c1.9-.3 3.6.7 4.4 2.2.8-1.5 2.5-2.5 4.4-2.2 3 .4 4.3 3.4 2.6 6.6-2.5 3.8-9 8-9 8Z" fill="currentColor" /></svg>
);
const IconSparkle = () => (
  <svg className="ms-ic" viewBox="0 0 24 24"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill="currentColor" /></svg>
);

/* ------------------------------------------------------------------ */
/* 主组件                                                               */
/* ------------------------------------------------------------------ */

export default function CompanionMarblesModal({
  companionId,
  companionAvatarUrl,
  companionName = '小伙伴',
  onRewardApplied,
  onClose,
}) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const assetsRef = useRef({});

  const [selectedLevel, setSelectedLevel] = useState(0);
  const [phase, setPhase] = useState('idle'); // idle | playing | result
  const [score, setScore] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [remainPct, setRemainPct] = useState(100);
  const [dailyState, setDailyState] = useState({
    rewardedToday: 0, dailyLimit: DAILY_REWARD_LIMIT, fullClearRewardedToday: false, clearedLevelsToday: [],
  });
  const [result, setResult] = useState(null); // { outcome:'win'|'lose', score, bestCombo, levelEffect, levelRewarded, fullClearEffect, fullClearRewarded }

  /* ---------------- 载入小伙伴头像（作为发射者画在 canvas 里）---------------- */
  useEffect(() => {
    if (!companionAvatarUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { assetsRef.current.avatar = img; };
    img.src = companionAvatarUrl;
  }, [companionAvatarUrl]);

  /* ---------------- 读取今天的奖励进度 ---------------- */
  const refreshDailyState = useCallback(async () => {
    const s = await getMarblesState(companionId);
    setDailyState(s);
  }, [companionId]);

  useEffect(() => { void refreshDailyState(); }, [refreshDailyState]);

  /* ---------------- 通关 / 失败回调（结算） ---------------- */
  const handleWin = useCallback(async ({ score: finalScore, bestCombo: finalCombo }) => {
    setPhase('result');
    try {
      const res = await submitMarblesLevelClear(companionId, selectedLevel, finalScore, finalCombo);
      setResult({
        outcome: 'win',
        score: finalScore,
        bestCombo: finalCombo,
        levelEffect: res.levelEffect,
        levelRewarded: res.levelRewarded,
        fullClearEffect: res.fullClearEffect,
        fullClearRewarded: res.fullClearRewarded,
      });
      setDailyState((prev) => ({
        rewardedToday: res.rewardedToday,
        dailyLimit: res.dailyLimit,
        fullClearRewardedToday: prev.fullClearRewardedToday || res.fullClearRewarded,
        clearedLevelsToday: res.clearedLevelsToday,
      }));
      if (res.companion && onRewardApplied) onRewardApplied(res.companion);
    } catch (error) {
      console.error('[MarblesGame] 结算失败：', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companionId, selectedLevel, onRewardApplied]);

  const handleLose = useCallback(({ score: finalScore }) => {
    setPhase('result');
    setResult({
      outcome: 'lose', score: finalScore, bestCombo: 0, levelEffect: null, levelRewarded: false, fullClearEffect: null, fullClearRewarded: false,
    });
  }, []);

  // ensureEngine 只在挂载时真正 new 一次 MarblesEngine（下面的 engineRef.current
  // 提前返回保证了这一点），所以构造时传进去的 onWin/onLose 闭包如果直接用
  // handleWin/handleLose，就会永远绑定在"引擎刚造出来那一刻"的 selectedLevel
  // 上——之后切关卡，结算时还是按第一次挂载时的关卡算。用两个 ref 存最新的
  // handleWin/handleLose，引擎每次通关/失败时都从 ref 里读最新版本，就不会
  // 有这个问题了。
  const handleWinRef = useRef(handleWin);
  const handleLoseRef = useRef(handleLose);
  useEffect(() => { handleWinRef.current = handleWin; }, [handleWin]);
  useEffect(() => { handleLoseRef.current = handleLose; }, [handleLose]);

  /* ---------------- 引擎生命周期 ---------------- */
  const ensureEngine = useCallback(() => {
    if (engineRef.current || !canvasRef.current) return engineRef.current;
    const engine = new MarblesEngine({
      canvas: canvasRef.current,
      assets: assetsRef.current,
      onScoreChange: setScore,
      onComboChange: setBestCombo,
      onRemainChange: setRemainPct,
      onWin: (info) => { void handleWinRef.current(info); },
      onLose: (info) => handleLoseRef.current(info),
    });
    engine.resize();
    engine.attachControls();
    engineRef.current = engine;
    return engine;
  }, []);

  const prepareLevel = useCallback((levelIndex) => {
    const engine = ensureEngine();
    if (!engine) return;
    engine.prepareLevel(LEVELS[levelIndex]);
    setScore(0); setBestCombo(0); setRemainPct(100);
    setPhase('idle');
  }, [ensureEngine]);

  useEffect(() => {
    prepareLevel(0);
    return () => { if (engineRef.current) engineRef.current.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- 操作 ---------------- */
  const handleSelectLevel = useCallback((idx) => {
    if (phase === 'playing') return;
    setSelectedLevel(idx);
    prepareLevel(idx);
  }, [phase, prepareLevel]);

  const handleStart = useCallback(() => {
    const engine = ensureEngine();
    if (!engine) return;
    setResult(null);
    setPhase('playing');
    engine.start();
  }, [ensureEngine]);

  const handleRetry = useCallback(() => { prepareLevel(selectedLevel); }, [prepareLevel, selectedLevel]);

  const handleNextLevel = useCallback(() => {
    const next = selectedLevel >= LEVELS.length - 1 ? 0 : selectedLevel + 1;
    setSelectedLevel(next);
    prepareLevel(next);
  }, [selectedLevel, prepareLevel]);

  const handleClose = useCallback(() => {
    if (engineRef.current) engineRef.current.stop();
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && phase !== 'playing') handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [phase, handleClose]);

  const reachedDailyLimit = dailyState.rewardedToday >= dailyState.dailyLimit;
  const isLastLevel = selectedLevel === LEVELS.length - 1;
  const levelCfg = LEVELS[selectedLevel];

  return (
    <div className="cp-overlay center">
      <div className="cp-backdrop" onClick={phase === 'playing' ? undefined : handleClose} />
      <div className={`ms-root is-${phase}`} role="dialog" aria-modal="true" aria-label="小伙伴弹珠">

        <div className="ms-topbar">
          <button type="button" className="ms-round-btn" aria-label="返回" onClick={handleClose} disabled={phase === 'playing'}>
            <IconBack />
          </button>
          <div className="ms-title"><b>小伙伴弹珠</b><small>第{selectedLevel + 1}关 · {levelCfg.name}</small></div>
          <div className="ms-topbar-spacer" />
        </div>

        {phase !== 'playing' && (
          <nav className="ms-levels" aria-label="关卡">
            {LEVELS.map((lv, idx) => (
              <button
                type="button"
                key={lv.key}
                className={`ms-lv${idx === selectedLevel ? ' is-active' : ''}`}
                onClick={() => handleSelectLevel(idx)}
              >
                <b>第{idx + 1}关</b>
                <small>{lv.colors}色</small>
                {dailyState.clearedLevelsToday.includes(idx) && (
                  <span className="ms-lv-check"><IconCheck /></span>
                )}
              </button>
            ))}
          </nav>
        )}

        <div className="ms-attempts">
          <span>今日过关奖励 {Math.min(dailyState.rewardedToday, dailyState.dailyLimit)}/{dailyState.dailyLimit}</span>
          <span className="dots">
            {Array.from({ length: dailyState.dailyLimit }, (_, i) => (
              <span key={i} className={`dot${i < dailyState.rewardedToday ? ' is-used' : ''}`} />
            ))}
          </span>
          {dailyState.fullClearRewardedToday && (
            <span className="ms-full-badge"><IconSparkle /> 全通关奖励已拿到</span>
          )}
        </div>

        <div className="ms-board-wrap">
          <div className="ms-board">
            <canvas ref={canvasRef} className="ms-canvas" />
          </div>
        </div>

        <div className="ms-hud">
          <div className="ms-stat"><small>分数</small><b>{score}</b></div>
          <div className="ms-stat"><small>链子剩余</small><div className="ms-bar"><i style={{ width: `${remainPct}%` }} /></div></div>
          <div className="ms-stat"><small>最高连锁</small><b>{bestCombo}</b></div>
        </div>

        {phase === 'idle' && (
          <>
            <div className="ms-actions">
              <button type="button" className="ms-btn-sm" onClick={handleStart}>
                {reachedDailyLimit ? '再玩一局（无加成）' : '开始'}
              </button>
            </div>
            <p className="ms-hint">
              点屏幕任意位置，{companionName}就朝那里发射手里的珠子 · 同色挨在一起满 3 颗消除
            </p>
          </>
        )}
        {phase === 'playing' && (
          <p className="ms-hint">左右点按瞄准，接连消除能打出连锁 · 链子爬进洞里就失败</p>
        )}

        {phase === 'result' && result && (
          <div className="ms-overlay">
            <div className="ms-backdrop" onClick={() => setPhase('idle')} />
            <div className="ms-panel">
              {result.outcome === 'win' ? (
                <>
                  <div className="ms-tier-badge"><IconCheck /></div>
                  <h3>过关啦！</h3>
                  <p className="desc">得分 {result.score}，最高连锁 ×{result.bestCombo}</p>
                  {result.levelRewarded ? (
                    <div className="ms-reward-row">
                      <div className="ms-reward-chip mood"><IconHeartMood /><b>+{result.levelEffect.mood}</b><small>心情</small></div>
                      <div className="ms-reward-chip satiety"><IconBowl /><b>{result.levelEffect.satiety}</b><small>饱食度</small></div>
                      <div className="ms-reward-chip hearts"><IconHeartCoin /><b>+{result.levelEffect.hearts}</b><small>心心</small></div>
                    </div>
                  ) : (
                    <p className="ms-no-reward">今天的过关奖励名额已经用完啦，这关纯粹是陪小伙伴玩一下～</p>
                  )}
                  {result.fullClearRewarded && (
                    <div className="ms-full-clear-banner">
                      <IconSparkle />
                      <span>
                        今天三关都通关啦！额外奖励 心情+{result.fullClearEffect.mood} · 心心+{result.fullClearEffect.hearts}
                      </span>
                    </div>
                  )}
                  <div className="ms-panel-actions">
                    <button type="button" className="ms-btn" onClick={() => setPhase('idle')}>返回选关</button>
                    <button type="button" className="ms-btn main" onClick={handleNextLevel}>
                      <IconPlay />
                      <span>{isLastLevel ? '再玩一次' : '下一关'}</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3>珠子掉进洞里了</h3>
                  <p className="desc">得分 {result.score}，再试一次吧</p>
                  <div className="ms-panel-actions">
                    <button type="button" className="ms-btn" onClick={() => setPhase('idle')}>返回选关</button>
                    <button type="button" className="ms-btn main" onClick={handleRetry}>
                      <IconPlay />
                      <span>重来这一关</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}