/*
 * SweetPlayApp.jsx —— 「小蛋糕店」自己来做的外壳：
 *   开局页 -> 营业中（前台 / 后厨 两个场景，底部切换）-> 结算页
 *
 * 一局的状态全部放在 sweetPlayEngine 的 run 对象里（不可变更新）；
 * 这里用 setInterval 每 100ms 调一次 tickRun 推进时间，玩家的操作调引擎里对应的函数。
 * runRef 始终指向最新的 run，所有回调都读它，避免定时器里读到旧值。
 *
 * 数据（小伙伴心心、店铺星级和经验）由上一层 SweetStreetApp 持有，
 * 这里通过 onDataChange({ companion, shopState }) 把变化交回去。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HEARTS_PER_CUSTOMER_STAR } from './sweetPlayData';
import {
  createRun,
  tickRun,
  submitTicket,
  recordStepGrade,
  serveCustomer,
  finishRun,
} from './sweetPlayEngine';
import { submitRunResult } from './sweetPlayService';
import SweetPlayStart from './SweetPlayStart';
import SweetPlayFront from './SweetPlayFront';
import SweetPlayKitchen from './SweetPlayKitchen';
import SweetPlayResult from './SweetPlayResult';
import { CustomerFigure, StarRow } from './SweetPlayArt';
import './sweetPlay.css';

const TICK_MS = 100;

const formatClock = (sec) => {
  const total = Math.max(0, Math.ceil(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const SweetPlayApp = ({ companion, shopState, shopId = 'cake', onClose, onDataChange }) => {
  const [phase, setPhase] = useState('start'); // start | playing | result
  const [scene, setScene] = useState('front'); // front | kitchen
  const [run, setRun] = useState(null);
  const [paused, setPaused] = useState(false);
  const [tabLocked, setTabLocked] = useState(false);
  const [orderingId, setOrderingId] = useState(null);
  const [notice, setNotice] = useState('');
  const [serveFx, setServeFx] = useState(null);
  const [settlement, setSettlement] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const [saveInfo, setSaveInfo] = useState(null);

  const runRef = useRef(null);
  const lastTickRef = useRef(0);
  const finishedRef = useRef(true);
  const noticeTimerRef = useRef(null);
  const fxTimerRef = useRef(null);

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    if (fxTimerRef.current) clearTimeout(fxTimerRef.current);
  }, []);

  const commit = useCallback((next) => {
    runRef.current = next;
    setRun(next);
  }, []);

  const notify = useCallback((text) => {
    setNotice(text);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(''), 1800);
  }, []);

  const handleDataChange = useCallback((payload) => {
    if (onDataChange) onDataChange(payload);
  }, [onDataChange]);

  // ---- 结算保存 ----
  const saveSettlement = useCallback(async (s) => {
    if (s.totalHearts <= 0 && s.expGain <= 0) {
      setSaveState('skipped');
      return;
    }
    setSaveState('saving');
    try {
      const res = await submitRunResult(companion.id, shopId, s);
      setSaveInfo(res);
      setSaveState('saved');
      handleDataChange({ companion: res.companion, shopState: res.shopState });
    } catch (error) {
      console.warn('[SweetPlay] 保存结算失败:', error);
      setSaveState('error');
    }
  }, [companion?.id, shopId, handleDataChange]);

  const endRun = useCallback((finalRun) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const s = finishRun(finalRun);
    setSettlement(s);
    setOrderingId(null);
    setPhase('result');
    saveSettlement(s);
  }, [saveSettlement]);

  // ---- 开局 / 放弃 ----
  const startRun = () => {
    finishedRef.current = false;
    commit(createRun(shopState?.star || 1));
    setScene('front');
    setOrderingId(null);
    setPaused(false);
    setTabLocked(false);
    setServeFx(null);
    setNotice('');
    setSettlement(null);
    setSaveState('idle');
    setSaveInfo(null);
    lastTickRef.current = performance.now();
    setPhase('playing');
  };

  const abandonRun = () => {
    finishedRef.current = true;
    setPaused(false);
    setTabLocked(false);
    setOrderingId(null);
    setPhase('start');
  };

  // ---- 时间推进 ----
  useEffect(() => {
    if (phase !== 'playing' || paused) return undefined;
    lastTickRef.current = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.5, (now - lastTickRef.current) / 1000);
      lastTickRef.current = now;
      const { run: next, events } = tickRun(runRef.current, dt);
      commit(next);
      events.forEach((event) => {
        if (event.type === 'customerLeft') notify('有客人等太久，生气地走了');
        if (event.type === 'timeUp') endRun(next);
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase, paused, commit, notify, endRun]);

  // ---- 玩家操作 ----
  const handleSubmitTicket = (customerId, recipeId, decoIds) => {
    commit(submitTicket(runRef.current, customerId, recipeId, decoIds));
    setOrderingId(null);
    notify('单子送去后厨了');
  };

  const handleGrade = useCallback((customerId, grade) => {
    commit(recordStepGrade(runRef.current, customerId, grade));
  }, [commit]);

  const handleServe = (customerId) => {
    const target = runRef.current.customers.find((c) => c.id === customerId);
    const { run: next, stars } = serveCustomer(runRef.current, customerId);
    if (!target || !stars) return;
    commit(next);
    setServeFx({ designId: target.designId, stars, key: Date.now() });
    if (fxTimerRef.current) clearTimeout(fxTimerRef.current);
    fxTimerRef.current = setTimeout(() => setServeFx(null), 1600);
  };

  const handleLockChange = useCallback((locked) => setTabLocked(locked), []);
  const handleCloseOrder = useCallback(() => setOrderingId(null), []);

  const switchScene = (next) => {
    if (next === scene) return;
    if (tabLocked) {
      notify('先把手上这一步做完');
      return;
    }
    setScene(next);
  };

  // ---------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------
  const renderPlaying = () => {
    if (!run) return null;
    const waitingCount = run.customers.filter((c) => c.status === 'waiting').length;
    const readyCount = run.customers.filter((c) => c.status === 'cooking' && c.grades.length >= 4).length;
    const kitchenCount = run.customers.filter((c) => c.status === 'cooking' && c.grades.length < 4).length;
    const frontBadge = waitingCount + readyCount;
    const lowTime = run.durationSec - run.elapsedSec <= 20;

    return (
      <>
        <div className="sp-hud">
          <button type="button" className="sp-round" onClick={() => setPaused(true)} aria-label="暂停">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
            </svg>
          </button>
          <div className={`sp-pill sp-timer ${lowTime ? 'is-low' : ''}`}>{formatClock(run.durationSec - run.elapsedSec)}</div>
          <div className="sp-pill">接待 {run.served.length}</div>
          <div className={`sp-pill sp-combo ${run.combo >= 4 ? 'is-hot' : ''}`}>连击 {run.combo}</div>
        </div>

        <div className={`sp-scene ${scene === 'front' ? 'is-on' : ''}`}>
          <SweetPlayFront
            run={run}
            orderingId={orderingId}
            onOpenOrder={setOrderingId}
            onCloseOrder={handleCloseOrder}
            onSubmitTicket={handleSubmitTicket}
            onServe={handleServe}
            onNotify={notify}
          />
        </div>
        <div className={`sp-scene ${scene === 'kitchen' ? 'is-on' : ''}`}>
          <SweetPlayKitchen
            run={run}
            paused={paused}
            onGrade={handleGrade}
            onLockChange={handleLockChange}
          />
        </div>

        <nav className="sp-tabs" aria-label="场景切换">
          <button
            type="button"
            className={`sp-tab ${scene === 'front' ? 'is-on' : ''}`}
            onClick={() => switchScene('front')}
          >
            前台
            {frontBadge > 0 && <i className="sp-badge">{frontBadge}</i>}
          </button>
          <button
            type="button"
            className={`sp-tab ${scene === 'kitchen' ? 'is-on' : ''}`}
            onClick={() => switchScene('kitchen')}
          >
            后厨
            {kitchenCount > 0 && <i className="sp-badge">{kitchenCount}</i>}
          </button>
        </nav>

        {serveFx && (
          <div className="sp-fx" key={serveFx.key}>
            <CustomerFigure designId={serveFx.designId} mood={serveFx.stars >= 2 ? 'happy' : 'sad'} height={120} />
            <StarRow count={serveFx.stars} size={34} />
            <b>+{HEARTS_PER_CUSTOMER_STAR[serveFx.stars] || 0} 心心</b>
          </div>
        )}

        {paused && (
          <div className="sp-pause" role="dialog" aria-label="暂停">
            <div className="sp-pause-card">
              <h3>暂停中</h3>
              <button type="button" className="sp-btn primary" onClick={() => setPaused(false)}>继续营业</button>
              <button type="button" className="sp-btn" onClick={abandonRun}>放弃这局（不结算）</button>
            </div>
          </div>
        )}

        <div className={`sp-toast ${notice ? 'is-on' : ''}`} role="status">{notice}</div>
      </>
    );
  };

  return (
    <div className="sp-root">
      <div className="sp-col">
        {phase === 'start' && (
          <SweetPlayStart
            companion={companion}
            shopState={shopState}
            shopId={shopId}
            onStart={startRun}
            onClose={onClose}
            onDataChange={handleDataChange}
          />
        )}
        {phase === 'playing' && renderPlaying()}
        {phase === 'result' && settlement && (
          <SweetPlayResult
            settlement={settlement}
            saveState={saveState}
            saveInfo={saveInfo}
            onAgain={() => setPhase('start')}
            onHome={onClose}
            onRetry={() => saveSettlement(settlement)}
          />
        )}
      </div>
    </div>
  );
};

export default SweetPlayApp;
