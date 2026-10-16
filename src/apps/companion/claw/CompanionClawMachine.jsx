/*
 * CompanionClawMachine.jsx —— #2 娃娃机弹窗。
 *
 * 外壳沿用 .cp-overlay.center / .cp-backdrop（跟「接住掉落物」小游戏一样，
 * 居中卡片而不是底部抽屉），内容分两个页签（复用 .cp-tabs 滑块）：
 *   抓娃娃：机身 + 力度条 + 小伙伴加油气泡 + 大按钮
 *   图鉴  ：已集到的娃娃 / 没集到的灰色剪影
 *
 * 【玩法】
 * 1. 点「投币」：startClawPlay 先扣 PLAY_COST 心心（不管抓不抓得中都
 *    不退），然后爱心标记在力度条上来回扫，爪子在机身里同步左右移动。
 * 2. 点「抓！」定住：标记落在绿色抓取区里就算抓中。结算（抽哪一款、重复
 *    换心心）在点「抓！」那一刻就已经写进数据库了，后面的下爪动画只是
 *    演出——所以演出途中被关掉也不会丢奖品。
 * 3. 抓中和空手而归都会播一段下爪动画，再弹出结果卡片。
 *
 * Props:
 *   companion          object   —— 当前小伙伴（用 id / hearts / name / avatarUrl）
 *   onCompanionChange  function(companion) —— 心心变化后把最新的 companion
 *                                             传回去，调用方据此刷新主页
 *   onClose            function —— 关闭弹窗
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import './claw.css';
import ClawPlush from './ClawPlush';
import {
  CLAW_PRIZES,
  CLAW_RARITY,
  CLAW_RARITY_LABELS,
  findClawPrize,
} from './companionClawData';
import { PLUSH_PLAY_COOLDOWN_HOURS, findPlushPlay } from './plushPlayData';
import { getPlushCooldowns, playWithPlush } from './plushPlayService';
import {
  PLAY_COST,
  DUPLICATE_REFUND,
  canPlayClaw,
  getFreePlays,
  startClawPlay,
  resolveClawWin,
  resolveClawLose,
  getClawCollection,
} from './companionClawService';

/* ---------------- 手感参数（想调难度改这里）---------------- */
const ZONE_WIDTH = 0.26; // 绿色抓取区占力度条的比例，越大越好中
const SWEEP_MS = 1150; // 爱心从一头扫到另一头要多久，越小越难
const AIM_TIMEOUT_MS = 12000; // 投币后太久不点，自动在当前位置下爪
const CLAW_X_MIN = 12; // 爪子在机身里左右移动的范围（占玻璃宽度的 %）
const CLAW_X_MAX = 88;

const DECOR = [
  { id: 'claw-owl', x: 40, y: 34, s: 52, r: 3, z: 0 },
  { id: 'claw-bear', x: 1, y: 0, s: 62, r: -8, z: 2 },
  { id: 'claw-cat', x: 18, y: 6, s: 56, r: 6, z: 1 },
  { id: 'claw-bunny', x: 33, y: 0, s: 62, r: -3, z: 3 },
  { id: 'claw-penguin', x: 51, y: 5, s: 56, r: 8, z: 2 },
  { id: 'claw-fox', x: 65, y: 0, s: 62, r: -6, z: 3 },
  { id: 'claw-unicorn', x: 81, y: 7, s: 54, r: 7, z: 1 },
];

const CONFETTI_COLORS = ['#FF86A0', '#FFD65A', '#7FD6BC', '#3D9BEA', '#FFB0C2'];

const tri = (t) => {
  const m = t % 2;
  return m <= 1 ? m : 2 - m;
};

const roundHearts = (value) => Math.round((value || 0) * 10) / 10;

const STAT_LABELS = { mood: '心情', satiety: '饱食', cleanliness: '整洁', hearts: '心心' };
const STAT_CHIP_CLASS = { mood: 'm', satiety: 's', cleanliness: 'c', hearts: 'h' };
const STAT_ORDER = ['mood', 'satiety', 'cleanliness', 'hearts'];

const formatRemain = (ms) => {
  const totalMin = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} 分`;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
};

const formatDate = (ts) => {
  if (!ts) return '--';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};

const prizeCode = (id) => String(id || '').toUpperCase();

/* ---------------- 小图标 ---------------- */
const HEART_PATH = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
const STAR_PATH = 'M12 2l2.6 6.4 6.9.6-5.2 4.6 1.6 6.8L12 16.8 6.1 20.4l1.6-6.8L2.5 9l6.9-.6z';

const HeartGlyph = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={HEART_PATH} fill={color} />
  </svg>
);

const BackGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M19 12H5M12 19l-7-7 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SadPuff = () => (
  <svg viewBox="0 0 64 64" width="100" height="100" aria-hidden="true" focusable="false">
    <g fill="#fff" stroke="#fff" strokeWidth="6" strokeLinejoin="round">
      <circle cx="22" cy="36" r="12" />
      <circle cx="40" cy="32" r="14" />
      <rect x="14" y="36" width="38" height="14" rx="7" />
    </g>
    <g fill="#EAF3FB">
      <circle cx="22" cy="36" r="12" />
      <circle cx="40" cy="32" r="14" />
      <rect x="14" y="36" width="38" height="14" rx="7" />
    </g>
    <circle cx="27" cy="40" r="2.4" fill="#24415A" />
    <circle cx="39" cy="40" r="2.4" fill="#24415A" />
    <path d="M29 47q3-2.6 6 0" stroke="#24415A" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    <path d="M44 38c2 3 3 5 0 6.5-3-1.5-2-3.5 0-6.5z" fill="#8FC8EC" />
  </svg>
);

const MascotFace = () => (
  <svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden="true" focusable="false">
    <circle cx="40" cy="42" r="32" fill="#E1F0FE" stroke="#fff" strokeWidth="5" />
    <circle cx="29" cy="40" r="4" fill="#24415A" />
    <circle cx="51" cy="40" r="4" fill="#24415A" />
    <ellipse cx="21" cy="48" rx="6" ry="3.6" fill="#FFB0C2" opacity=".75" />
    <ellipse cx="59" cy="48" rx="6" ry="3.6" fill="#FFB0C2" opacity=".75" />
    <path d="M34 50q6 6 12 0" fill="none" stroke="#24415A" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

const RARITY_CLASS = {
  [CLAW_RARITY.COMMON]: 'r-common',
  [CLAW_RARITY.RARE]: 'r-rare',
  [CLAW_RARITY.HIDDEN]: 'r-hidden',
};

const makeConfetti = (count) => Array.from({ length: count }, (_, index) => {
  const angle = (Math.PI * 2 * index) / count + Math.random() * 0.5;
  const dist = 90 + Math.random() * 90;
  return {
    id: index,
    isHeart: index % 2 === 0,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    dx: Math.round(Math.cos(angle) * dist),
    dy: Math.round(Math.sin(angle) * dist - 40),
    delay: Math.round(Math.random() * 120),
    size: 12 + Math.round(Math.random() * 8),
  };
});

const CompanionClawMachine = ({ companion, onCompanionChange, onClose }) => {
  const companionId = companion?.id;
  const companionName = companion?.name || 'TA';
  const hearts = roundHearts(companion?.hearts);

  const [tab, setTab] = useState('play');
  const [phase, setPhase] = useState('idle'); // idle | aiming | dropping | result
  const [clawStage, setClawStage] = useState(''); // '' | drop | grab | lift | lift-slip
  const [zoneStart, setZoneStart] = useState(0.38);
  const [heldPrize, setHeldPrize] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [collection, setCollection] = useState([]);
  const [cardId, setCardId] = useState(null); // 图鉴里打开的挂牌小卡片
  const [cooldownUntil, setCooldownUntil] = useState({}); // { itemId: 可再玩的时间戳 }
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [plushRes, setPlushRes] = useState(null); // { text, delta, freePlayGranted, rest }
  const [plushBusy, setPlushBusy] = useState(false);

  const phaseRef = useRef('idle');
  const busyRef = useRef(false);
  const zoneRef = useRef(0.38);
  const posRef = useRef(0);
  const rafRef = useRef(0);
  const aimStartRef = useRef(0);
  const timersRef = useRef(new Set());
  const markerRef = useRef(null);
  const clawRef = useRef(null);
  const stickRef = useRef(null);
  const stopRef = useRef(null);

  const go = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const sleep = useCallback((ms) => new Promise((resolve) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      resolve();
    }, ms);
    timersRef.current.add(id);
  }), []);

  useEffect(() => () => {
    window.cancelAnimationFrame(rafRef.current);
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current.clear();
  }, []);

  const refreshCollection = useCallback(async () => {
    if (!companionId) return;
    try {
      setCollection(await getClawCollection(companionId));
    } catch (_) { /* 图鉴读取失败不影响玩 */ }
  }, [companionId]);

  useEffect(() => { refreshCollection(); }, [refreshCollection]);

  const refreshCooldowns = useCallback(async () => {
    if (!companionId) return;
    try {
      const map = await getPlushCooldowns(companionId);
      const base = Date.now();
      const next = {};
      Object.keys(map).forEach((key) => { next[key] = base + map[key]; });
      setCooldownUntil(next);
    } catch (_) { /* 冷却读取失败就当作没有冷却，真正结算时服务层会再判断 */ }
  }, [companionId]);

  useEffect(() => { refreshCooldowns(); }, [refreshCooldowns]);

  // 小卡片打开时每秒刷新一次，让「还要 X 分」会自己走。
  useEffect(() => {
    if (!cardId) return undefined;
    setNowTick(Date.now());
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [cardId]);

  const openCard = useCallback((row) => {
    if (!row?.owned) return;
    setPlushRes(null);
    setCardId(row.id);
    refreshCooldowns();
  }, [refreshCooldowns]);

  const handlePlayPlush = useCallback(async () => {
    if (!cardId || plushBusy || !companionId) return;
    setPlushBusy(true);
    try {
      const res = await playWithPlush(companionId, cardId);
      if (res.played) {
        setCooldownUntil((prev) => ({ ...prev, [cardId]: Date.now() + PLUSH_PLAY_COOLDOWN_HOURS * 3600 * 1000 }));
        setPlushRes({ text: res.feedbackText, delta: res.delta, freePlayGranted: res.freePlayGranted, rest: false });
        if (res.companion) onCompanionChange?.(res.companion);
      } else {
        setCooldownUntil((prev) => ({ ...prev, [cardId]: Date.now() + res.remainingMs }));
        setPlushRes({ text: res.feedbackText, delta: null, freePlayGranted: false, rest: true });
      }
    } catch (err) {
      setPlushRes({ text: err?.message || '这次没玩成，再试一次吧', delta: null, freePlayGranted: false, rest: true });
    } finally {
      setPlushBusy(false);
    }
  }, [cardId, companionId, onCompanionChange, plushBusy]);

  const applyPos = useCallback((p) => {
    posRef.current = p;
    if (markerRef.current) markerRef.current.style.left = `${p * 100}%`;
    if (clawRef.current) clawRef.current.style.left = `${CLAW_X_MIN + p * (CLAW_X_MAX - CLAW_X_MIN)}%`;
    if (stickRef.current) stickRef.current.style.transform = `rotate(${(p - 0.5) * 44}deg)`;
  }, []);

  useEffect(() => { applyPos(0); }, [applyPos]);

  const canClose = phase === 'idle' || phase === 'result';
  const handleClose = useCallback(() => {
    if (cardId) {
      setCardId(null); // 先收起挂牌小卡片，再关弹窗
      return;
    }
    if (!canClose) return;
    onClose?.();
  }, [canClose, cardId, onClose]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose]);

  /* ---------------- 投币 ---------------- */
  const beginAiming = useCallback(() => {
    const start = 0.1 + Math.random() * (0.8 - ZONE_WIDTH);
    zoneRef.current = start;
    setZoneStart(start);
    setHeldPrize(null);
    setClawStage('');
    go('aiming');

    aimStartRef.current = performance.now();
    const tick = (now) => {
      applyPos(tri((now - aimStartRef.current) / SWEEP_MS));
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);

    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      if (phaseRef.current === 'aiming') stopRef.current?.();
    }, AIM_TIMEOUT_MS);
    timersRef.current.add(id);
  }, [applyPos, go]);

  const handleStart = useCallback(async () => {
    if (phaseRef.current !== 'idle' || busyRef.current || !companionId) return;
    setError('');

    if (!canPlayClaw(companion)) {
      setError('心心不够啦，先去陪陪TA攒一点吧');
      return;
    }

    busyRef.current = true;
    try {
      const updated = await startClawPlay(companionId);
      onCompanionChange?.(updated);
      beginAiming();
    } catch (err) {
      setError(err?.message || '投币失败了，再试一次吧');
    } finally {
      busyRef.current = false;
    }
  }, [beginAiming, companion, companionId, onCompanionChange]);

  /* ---------------- 定住 + 下爪演出 ---------------- */
  const handleStop = useCallback(async () => {
    if (phaseRef.current !== 'aiming') return;
    window.cancelAnimationFrame(rafRef.current);

    const p = posRef.current;
    const zone = zoneRef.current;
    const success = p >= zone && p <= zone + ZONE_WIDTH;
    go('dropping');

    // 结算在这里就写库，后面只是演出。
    let outcome = null;
    let failed = false;
    const settle = (success ? resolveClawWin(companionId) : resolveClawLose(companionId))
      .then((value) => { outcome = value; })
      .catch(() => { failed = true; });

    setClawStage('drop');
    await sleep(850);
    setClawStage('grab');
    await sleep(450);
    await settle;

    if (failed) {
      setError('娃娃机卡了一下，刚才这次没算上，再试一次吧');
      setClawStage('');
      applyPos(0);
      go('idle');
      return;
    }

    if (success && outcome?.prize) setHeldPrize(outcome.prize);
    setClawStage(success ? 'lift' : 'lift-slip');
    await sleep(950);

    setResult({
      success,
      prize: success ? outcome.prize : null,
      isDuplicate: Boolean(outcome?.isDuplicate),
      confetti: success ? makeConfetti(outcome?.prize?.rarity === CLAW_RARITY.COMMON ? 14 : 22) : [],
    });
    if (success && outcome?.companion) onCompanionChange?.(outcome.companion);
    go('result');
    refreshCollection();
  }, [applyPos, companionId, go, onCompanionChange, refreshCollection, sleep]);

  useEffect(() => { stopRef.current = handleStop; }, [handleStop]);

  const resetToIdle = useCallback(() => {
    setResult(null);
    setHeldPrize(null);
    setClawStage('');
    applyPos(0);
    go('idle');
  }, [applyPos, go]);

  const handleAgain = useCallback(() => {
    resetToIdle();
    handleStart();
  }, [handleStart, resetToIdle]);

  /* ---------------- 派生展示数据 ---------------- */
  const decor = useMemo(
    () => DECOR.map((item) => ({ ...item, prize: findClawPrize(item.id) })),
    [],
  );

  const targetLeft = CLAW_X_MIN + (zoneStart + ZONE_WIDTH / 2) * (CLAW_X_MAX - CLAW_X_MIN);
  const ownedCount = collection.filter((row) => row.owned).length;
  const freePlays = getFreePlays(companion);
  const canPlay = canPlayClaw(companion);

  const cardPrize = cardId ? collection.find((row) => row.id === cardId) || null : null;
  const cardConfig = cardId ? findPlushPlay(cardId) : null;
  const cardNo = cardId ? CLAW_PRIZES.findIndex((item) => item.id === cardId) + 1 : 0;
  const cardRemain = cardId ? Math.max(0, (cooldownUntil[cardId] || 0) - nowTick) : 0;

  const mascotLine = {
    idle: `${companionName}：想抓哪只呀？`,
    aiming: '对准绿色的地方～',
    dropping: '屏住呼吸……',
    result: result?.success ? '哇！抓到啦！' : '没关系，下次一定！',
  }[phase];

  const clawClass = [
    'cw-claw-wrap',
    phase === 'idle' ? 'is-idle' : '',
    phase === 'aiming' ? 'is-aim' : '',
    clawStage ? `is-${clawStage}` : '',
  ].filter(Boolean).join(' ');

  const resultPrize = result?.prize || null;

  return (
    <div className="cp-overlay center">
      <div className="cp-backdrop" onClick={handleClose} />

      <div className={`cw-root is-${phase}`} role="dialog" aria-modal="true" aria-label="娃娃机">
        <div className="cw-head">
          <button type="button" className="cw-round" aria-label="返回" onClick={handleClose}>
            <BackGlyph />
          </button>
          <div className="cw-title">
            <b>娃娃机</b>
            <small>投币 · 对准 · 抓！</small>
          </div>
          <div className="cw-hearts" aria-label={`心心 ${hearts}`}>
            <HeartGlyph size={14} color="#FF86A0" />
            <b>{hearts}</b>
          </div>
        </div>

        <div className="cw-tabs-wrap">
          <div className="cp-tabs">
            <i className="ind" style={{ transform: tab === 'play' ? 'translateX(0)' : 'translateX(100%)' }} />
            <button type="button" className={tab === 'play' ? 'is-on' : ''} onClick={() => setTab('play')}>抓娃娃</button>
            <button type="button" className={tab === 'book' ? 'is-on' : ''} onClick={() => setTab('book')}>
              图鉴{collection.length > 0 ? ` ${ownedCount}/${collection.length}` : ''}
            </button>
          </div>
        </div>

        <div className="cw-scroll">
          {tab === 'play' && (
            <>
              {/* ============ 机身 ============ */}
              <div className="cw-machine">
                <div className="cw-ears"><i /><i /></div>
                <div className="cw-sign">
                  <span className="cw-bulb" />
                  <b>抓抓乐</b>
                  <span className="cw-bulb b2" />
                </div>
                <div className="cw-awning" />
                <div className="cw-scallop" />

                <div className="cw-body">
                  <div className="cw-glass">
                    <i className="cw-rail" />

                    <div className={clawClass} ref={clawRef}>
                      <span className="cw-carriage" />
                      <i className="cw-rope" />
                      <div className="cw-claw">
                        {heldPrize && (
                          <span className="cw-held">
                            <ClawPlush prize={heldPrize} size={40} />
                          </span>
                        )}
                        <span className="cw-claw-head"><i /></span>
                        <span className="cw-finger l">
                          <svg viewBox="0 0 20 34" width="20" height="34" aria-hidden="true" focusable="false">
                            <path d="M4 2C4 16 6 25 16 31" fill="none" stroke="#E8708E" strokeWidth="5" strokeLinecap="round" />
                            <circle cx="16" cy="31" r="2.6" fill="#fff" />
                          </svg>
                        </span>
                        <span className="cw-finger r">
                          <svg viewBox="0 0 20 34" width="20" height="34" aria-hidden="true" focusable="false" style={{ transform: 'scaleX(-1)' }}>
                            <path d="M4 2C4 16 6 25 16 31" fill="none" stroke="#E8708E" strokeWidth="5" strokeLinecap="round" />
                            <circle cx="16" cy="31" r="2.6" fill="#fff" />
                          </svg>
                        </span>
                      </div>
                    </div>

                    <div className="cw-floor">
                      {decor.map((item) => (
                        <span
                          key={item.id}
                          className="cw-decor"
                          style={{
                            left: `${item.x}%`,
                            bottom: `${item.y}px`,
                            zIndex: item.z,
                            transform: `rotate(${item.r}deg)`,
                          }}
                        >
                          <ClawPlush prize={item.prize} size={item.s} />
                        </span>
                      ))}
                    </div>

                    <i
                      className="cw-target"
                      style={{ left: `${targetLeft}%` }}
                      aria-hidden="true"
                    />
                    <i className="cw-glare" />
                  </div>

                  <div className="cw-panel">
                    <div className="cw-stick-wrap">
                      <span className="cw-stick" ref={stickRef}><i /></span>
                    </div>
                    <div className="cw-coin">
                      <HeartGlyph size={13} color="#fff" />
                      <b>{PLAY_COST}</b>
                    </div>
                    <div className="cw-lamps"><i /><i /><i /></div>
                    <div className="cw-chute"><span>取物口</span></div>
                  </div>
                </div>
              </div>

              {/* ============ 力度条 ============ */}
              <div className="cw-bar" aria-hidden="true">
                <div className="cw-bar-lane">
                  <i
                    className="cw-zone"
                    style={{ left: `${zoneStart * 100}%`, width: `${ZONE_WIDTH * 100}%` }}
                  />
                  <i className="cw-marker" ref={markerRef}>
                    <HeartGlyph size={22} color="#FF86A0" />
                  </i>
                </div>
              </div>

              {/* ============ 小伙伴加油气泡 ============ */}
              <div className="cw-talk">
                <span className="cw-mascot">
                  {companion?.avatarUrl
                    ? <img src={companion.avatarUrl} alt="" draggable={false} />
                    : <MascotFace />}
                </span>
                <p>{mascotLine}</p>
              </div>

              {error && <p className="cw-error">{error}</p>}

              {phase === 'aiming' ? (
                <button type="button" className="cw-cta stop" onClick={handleStop}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={STAR_PATH} fill="currentColor" /></svg>
                  <span>抓！</span>
                </button>
              ) : (
                <button
                  type="button"
                  className={`cw-cta${canPlay ? '' : ' is-poor'}`}
                  onClick={handleStart}
                  disabled={phase === 'dropping'}
                >
                  {phase === 'dropping' ? (
                    <span>抓取中……</span>
                  ) : (
                    <>
                      <span>投币抓一次</span>
                      {freePlays > 0
                        ? <em>免费 · 剩 {freePlays} 次</em>
                        : <em><HeartGlyph size={13} color="currentColor" />{PLAY_COST}</em>}
                    </>
                  )}
                </button>
              )}

              <p className="cw-note">
                爱心停在绿色区域就能抓中 · 重复的娃娃会换回 {DUPLICATE_REFUND} 心心
              </p>
            </>
          )}

          {tab === 'book' && (
            <div className="cw-book">
              <div className="cw-book-head">
                <b>娃娃图鉴</b>
                <span>已收集 {ownedCount}/{collection.length || CLAW_PRIZES.length - 1}</span>
              </div>
              <div className="cw-book-progress">
                <i style={{ width: `${collection.length ? (ownedCount / collection.length) * 100 : 0}%` }} />
              </div>

              <div className="cw-grid">
                {collection.map((row) => {
                  const Cell = row.owned ? 'button' : 'div';
                  return (
                  <Cell
                    key={row.id}
                    type={row.owned ? 'button' : undefined}
                    onClick={row.owned ? () => openCard(row) : undefined}
                    aria-label={row.owned ? `${row.name}，打开挂牌` : undefined}
                    className={`cw-cell ${RARITY_CLASS[row.rarity] || ''}${row.owned ? ' is-owned' : ''}`}
                  >
                    <div className="cw-cell-stage">
                      <ClawPlush prize={row} size={58} locked={!row.owned} />
                      {row.owned && row.rarity !== CLAW_RARITY.COMMON && <i className="cw-twinkle" />}
                    </div>
                    <b>{row.owned ? row.name : '？？？'}</b>
                    <span className="cw-tag">{CLAW_RARITY_LABELS[row.rarity]}</span>
                  </Cell>
                  );
                })}
              </div>

              <p className="cw-note">点一点抓到的娃娃，可以看它的挂牌，还能陪TA玩。</p>
            </div>
          )}
        </div>

        {/* ============ 挂牌小卡片（Jellycat 身份牌风格）============ */}
        {cardPrize && cardConfig && (
          <div className="cw-result-layer">
            <div className="cw-result-backdrop" onClick={() => setCardId(null)} />
            <div className="cw-hang-wrap">
              <div className={`cw-hang ${RARITY_CLASS[cardPrize.rarity] || ''}`} role="dialog" aria-label={`${cardPrize.name}的挂牌`}>
                <svg className="cw-hang-string" viewBox="0 0 70 46" aria-hidden="true" focusable="false">
                  <path d="M35 44 C35 24 8 28 8 14 C8 4 22 2 35 22 C48 2 62 4 62 14 C62 28 35 24 35 44" fill="none" stroke="#FF86A0" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <div className="cw-hang-card">
                  <i className="cw-hang-hole" />
                  <div className="cw-hang-win">
                    <span className="cw-hang-no">No.{String(cardNo).padStart(3, '0')}</span>
                    <ClawPlush prize={cardPrize} size={104} />
                  </div>
                  <p className="cw-hang-hi">HI, I AM</p>
                  <h3 className="cw-hang-name">{cardPrize.name}</h3>
                  <span className="cw-tag">{CLAW_RARITY_LABELS[cardPrize.rarity]}</span>

                  <div className="cw-hang-perf" />
                  <div className="cw-hang-row"><span>特长</span><b>{cardConfig.skill}</b></div>
                  <div className="cw-hang-row"><span>领养日</span><b>{formatDate(cardPrize.acquiredAt)}</b></div>
                  <div className="cw-hang-chips">
                    {STAT_ORDER.filter((key) => cardConfig.effects?.[key]).map((key) => (
                      <span key={key} className={`cw-chip ${STAT_CHIP_CLASS[key]}`}>
                        {STAT_LABELS[key]} +{cardConfig.effects[key]}
                      </span>
                    ))}
                  </div>
                  <div className="cw-hang-bar" aria-hidden="true" />
                  <div className="cw-hang-code">{prizeCode(cardPrize.id)}</div>
                  <div className="cw-hang-stamp" aria-hidden="true">已<br />领养</div>

                  <button
                    type="button"
                    className={`cw-hang-play${cardRemain > 0 ? ' is-rest' : ''}`}
                    onClick={handlePlayPlush}
                    disabled={plushBusy || cardRemain > 0}
                  >
                    {cardRemain > 0 ? `还要 ${formatRemain(cardRemain)}` : '陪TA玩'}
                  </button>
                </div>
              </div>

              <div className={`cw-hang-say${plushRes ? ' has-text' : ''}`}>
                <p>{plushRes ? plushRes.text : `点「陪TA玩」，让${companionName}抱抱${cardPrize.name}。`}</p>
                {plushRes && !plushRes.rest && (
                  <div className="cw-hang-chips small">
                    {STAT_ORDER.filter((key) => plushRes.delta?.[key]).map((key) => (
                      <span key={key} className={`cw-chip ${STAT_CHIP_CLASS[key]}`}>
                        {STAT_LABELS[key]} +{plushRes.delta[key]}
                      </span>
                    ))}
                    {plushRes.freePlayGranted && <span className="cw-chip free">免费抓娃娃 +1</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============ 结果卡片 ============ */}
        {phase === 'result' && result && (
          <div className="cw-result-layer">
            <div className="cw-result-backdrop" onClick={resetToIdle} />
            <div className={`cw-result ${result.success ? 'win' : 'lose'} ${resultPrize ? RARITY_CLASS[resultPrize.rarity] : ''}`}>
              {result.success && (
                <div className="cw-confetti" aria-hidden="true">
                  {result.confetti.map((piece) => (
                    <svg
                      key={piece.id}
                      className="cw-piece"
                      viewBox="0 0 24 24"
                      width={piece.size}
                      height={piece.size}
                      style={{
                        '--dx': `${piece.dx}px`,
                        '--dy': `${piece.dy}px`,
                        animationDelay: `${piece.delay}ms`,
                      }}
                    >
                      <path d={piece.isHeart ? HEART_PATH : STAR_PATH} fill={piece.color} />
                    </svg>
                  ))}
                </div>
              )}

              <div className="cw-result-stage">
                {result.success && resultPrize
                  ? <ClawPlush prize={resultPrize} size={92} className="cw-result-plush" />
                  : <SadPuff />}
              </div>

              {result.success && resultPrize ? (
                <>
                  <span className="cw-tag big">{CLAW_RARITY_LABELS[resultPrize.rarity]}</span>
                  <h3>{result.isDuplicate ? '又抓到一只！' : '抓到啦！'}</h3>
                  <p className="name">{resultPrize.name}</p>
                  <p className="sub">
                    {result.isDuplicate
                      ? `图鉴里已经有这只啦，换回了 ${DUPLICATE_REFUND} 心心。`
                      : `新朋友！已经收进图鉴里了。`}
                  </p>
                </>
              ) : (
                <>
                  <h3>差一点点……</h3>
                  <p className="sub">娃娃从爪子里滑走了，{PLAY_COST} 心心打了水漂，再来一次吧。</p>
                </>
              )}

              <div className="cw-result-actions">
                <button type="button" className="cw-btn" onClick={handleAgain}>再抓一次</button>
                <button type="button" className="cw-btn main" onClick={resetToIdle}>好哒</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanionClawMachine;