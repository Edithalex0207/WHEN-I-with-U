/**
 * CompanionFortuneModal.jsx
 *
 * 宠物日签模态框 —— 按 byTheshadow 提供的 HTML 视觉稿 1:1 还原结构：
 *   场景（鸟居 / 月夜桌布 / 星空同心环）+ 顶栏（返回/风格切换/连续天数/日期）
 *   + 舞台（签筒摇签 / 三张塔罗翻牌 / 十二宫星盘）
 *   + 底部抽屉（本周连签 + 抽签按钮，拉开后是"签架"/"徽章"）
 *   + 抽签结果卡（签级印章 + 诗句/牌面/星位 + 四格信息 + 幸运物色 + 宜忌 + 小伙伴的话）
 *
 * 颜色变量复用 companionPage.css 的 --cp-*（本组件始终渲染在 .cp-root 内部）。
 * 外层弹窗壳沿用项目里其它 companion 弹窗的 .cp-overlay / .cp-backdrop 约定。
 *
 * 天数徽章（7/15/30/50/100）这次先不做逻辑，"徽章" tab 先放一个占位说明。
 *
 * Props:
 *   companionId       number   — 小伙伴 ID
 *   companionAvatarUrl string  — 小伙伴头像图片 URL
 *   companionName     string   — 小伙伴名字（用于"小伙伴的话"）
 *   streakCount       number   — 顶栏展示的连续天数（这里用的是聊天火花天数）
 *   onClose           function — 关闭整个日签弹窗
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './fortune.css';
import {
  RANKS, ASTRO,
  STYLE_NAMES, IDLE_TEXT, GO_LABEL, POKE_LINES, WEEKDAYS,
} from './fortuneData';
import { getFortuneState, drawFortune, savePreferredStyle } from './fortuneService';
import { BADGE_MILESTONES, unlockedMilestones } from './badgeData';
import { getSeenBadgeMilestones, markBadgeMilestonesSeen } from './badgeService';

const STYLES = ['omikuji', 'tarot', 'astro'];
const PARTICLE_COLORS = ['#3A97E8', '#FFD27A', '#8FD9C0', '#8CC9FF', '#FF86A0'];

/* ------------------------------------------------------------------ */
/* 小工具                                                               */
/* ------------------------------------------------------------------ */

const pad2 = (n) => String(n).padStart(2, '0');
const pickRand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randBetween = (a, b) => a + Math.random() * (b - a);
const dateStrOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtDate = (d) => `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${WEEKDAYS[d.getDay()]}`;

/** 最近 7 个自然日（含今天），没有记录的日子 rank 为 null */
function buildWeek(history, todayDraw) {
  const byDate = new Map();
  (history || []).forEach((r) => byDate.set(r.dateStr, r.result?.rank));
  if (todayDraw) byDate.set(todayDraw.dateStr, todayDraw.result?.rank);
  const today0 = new Date();
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today0);
    d.setDate(d.getDate() - i);
    days.push({ date: d, dateStr: dateStrOf(d), rank: byDate.get(dateStrOf(d)) || null, isToday: i === 0 });
  }
  return days;
}

/** 签架：历史（旧→新）+ 今天（已抽或待抽） */
function buildRack(history, todayDraw) {
  const sorted = [...(history || [])].sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  const items = sorted.map((r) => ({
    rank: r.result?.rank,
    label: (() => { const d = new Date(`${r.dateStr}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}`; })(),
  }));
  const today0 = new Date();
  const todayLabel = `${today0.getMonth() + 1}/${today0.getDate()}`;
  if (todayDraw) items.push({ rank: todayDraw.result?.rank, label: todayLabel, today: true });
  else items.push({ empty: true, label: '今天', today: true });
  return items;
}

/* ------------------------------------------------------------------ */
/* 内联 SVG：图标 / 塔罗字形 / 小伙伴头像占位                                */
/* ------------------------------------------------------------------ */

function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="i-back" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-flame" viewBox="0 0 24 24"><path d="M12 2.4c.9 3.6 5.4 5.8 5.4 10.6a5.4 5.4 0 0 1-10.8 0c0-2.3 1.2-3.9 2.3-5 .1 2 .9 3 1.8 3.3C10.3 8 10.6 5 12 2.4z" fill="currentColor" /></symbol>
        <symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2.4" /><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></symbol>
        <symbol id="i-send" viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-sparkle" viewBox="0 0 24 24"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill="currentColor" /></symbol>

        {/* 小伙伴的脸（没有头像时的占位） */}
        <symbol id="pet-face" viewBox="0 0 100 100">
          <path d="M45 24l5-10 5 10" fill="none" stroke="#3D9BEA" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="35" cy="55" r="4.6" fill="#24415A" /><circle cx="65" cy="55" r="4.6" fill="#24415A" />
          <circle cx="36.6" cy="53.4" r="1.5" fill="#fff" /><circle cx="66.6" cy="53.4" r="1.5" fill="#fff" />
          <ellipse cx="26" cy="65" rx="7" ry="4.5" fill="#FFB0C2" opacity="0.75" /><ellipse cx="74" cy="65" rx="7" ry="4.5" fill="#FFB0C2" opacity="0.75" />
          <path d="M44 64q6 7 12 0" fill="none" stroke="#24415A" strokeWidth="3" strokeLinecap="round" />
        </symbol>

        {/* 塔罗牌面图案 */}
        <symbol id="g-sun" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="24" cy="24" r="9" /><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.6 10.6l4.2 4.2M33.2 33.2l4.2 4.2M37.4 10.6l-4.2 4.2M14.8 33.2l-4.2 4.2" /></g></symbol>
        <symbol id="g-star" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M24 5l5.5 13.5L44 19.5 33 29l3.5 14L24 35.5 11.5 43 15 29 4 19.5l14.5-1z" /></g></symbol>
        <symbol id="g-lovers" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M24 41C10 31 6 23 6 17a9 9 0 0 1 18-2 9 9 0 0 1 18 2c0 6-4 14-18 24z" /></g></symbol>
        <symbol id="g-wheel" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="24" cy="24" r="16" /><circle cx="24" cy="24" r="4" /><path d="M24 8v32M8 24h32M12.7 12.7l22.6 22.6M35.3 12.7 12.7 35.3" /></g></symbol>
        <symbol id="g-lamp" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M24 5v6M17 11h14M16 17h16l2 17H14zM19 34v6h10v-6M21 24h6" /></g></symbol>
        <symbol id="g-moon" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M33 6a18 18 0 1 0 9 28A15 15 0 0 1 33 6z" /></g></symbol>
        <symbol id="g-tower" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 42V18l7-11 7 11v24zM13 42h22M22 24l4 6-4 6" /></g></symbol>

        {/* 星盘的一条分隔线，供 <use> 旋转复用 */}
        <line id="w-seg" className="w-line" x1="130" y1="18" x2="130" y2="60" />
      </defs>
    </svg>
  );
}

function PetFace({ avatarUrl, alt }) {
  if (avatarUrl) return <img src={avatarUrl} alt={alt || ''} />;
  return <svg viewBox="0 0 100 100" aria-hidden="true"><use href="#pet-face" /></svg>;
}

/* ------------------------------------------------------------------ */
/* 鸟居 / 月夜 / 星空 场景                                                 */
/* ------------------------------------------------------------------ */

function ToriiScene() {
  return (
    <div className="fo-sky" data-for="omikuji">
      <div className="fo-orb" />
      <i className="fo-cloud c1" /><i className="fo-cloud c2" /><i className="fo-cloud c3" />
      <i className="fo-petal" style={{ left: '10%', animationDelay: '-1s' }} />
      <i className="fo-petal" style={{ left: '26%', animationDelay: '-5s' }} />
      <i className="fo-petal" style={{ left: '44%', animationDelay: '-8s' }} />
      <i className="fo-petal" style={{ left: '61%', animationDelay: '-3s' }} />
      <i className="fo-petal" style={{ left: '78%', animationDelay: '-10s' }} />
      <i className="fo-petal" style={{ left: '90%', animationDelay: '-6s' }} />
      <div className="fo-ground"><i className="fo-way" /></div>

      <svg className="fo-torii" viewBox="0 0 320 250" aria-hidden="true">
        <rect x="42" y="231" width="42" height="12" rx="4" fill="#C9D6E3" /><rect x="236" y="231" width="42" height="12" rx="4" fill="#C9D6E3" />
        <path d="M52 50h22l3 184H49z" fill="#EF7C86" /><path d="M246 50h22l3 184h-28z" fill="#EF7C86" />
        <path d="M58 56h5l2 176h-5z" fill="#fff" opacity="0.28" /><path d="M252 56h5l2 176h-5z" fill="#fff" opacity="0.28" />
        <rect x="30" y="92" width="260" height="14" rx="5" fill="#EF7C86" /><rect x="30" y="92" width="260" height="5" rx="3" fill="#fff" opacity="0.26" />
        <path d="M77 112Q160 140 243 112" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
        <path d="M77 112Q160 140 243 112" fill="none" stroke="#FFE7A3" strokeWidth="7" strokeLinecap="round" strokeDasharray="4 5" />
        <path d="M115 123h10v18l-5-4-5 4z" fill="#fff" stroke="#DCEBF8" strokeWidth="1" />
        <path d="M155 128h10v18l-5-4-5 4z" fill="#fff" stroke="#DCEBF8" strokeWidth="1" />
        <path d="M195 123h10v18l-5-4-5 4z" fill="#fff" stroke="#DCEBF8" strokeWidth="1" />
        <rect x="146" y="54" width="28" height="40" rx="3" fill="#D95F72" /><rect x="151" y="60" width="18" height="28" rx="2" fill="#FFF4C9" />
        <text x="160" y="80" textAnchor="middle" fontSize="15" fontFamily="Ma Shan Zheng, STKaiti, serif" fill="#C98A00">福</text>
        <path d="M12 36Q160 68 308 36v10Q160 78 12 46z" fill="#EF7C86" />
        <path d="M0 20Q160 52 320 20v18Q160 70 0 38z" fill="#D95F72" />
        <path d="M6 22Q160 52 314 22" fill="none" stroke="#fff" strokeWidth="2" opacity="0.35" strokeLinecap="round" />
        <g className="fo-lantern l" style={{ '--ox': '34px' }}>
          <line x1="34" y1="106" x2="34" y2="118" stroke="#C9D6E3" strokeWidth="2" />
          <ellipse cx="34" cy="132" rx="11" ry="14" fill="#FFD878" /><rect x="27" y="117" width="14" height="4" rx="2" fill="#D95F72" /><rect x="27" y="143" width="14" height="4" rx="2" fill="#D95F72" />
          <path d="M34 119v26M25 132h18" stroke="#fff" strokeWidth="1.2" opacity="0.6" fill="none" />
        </g>
        <g className="fo-lantern r" style={{ '--ox': '286px' }}>
          <line x1="286" y1="106" x2="286" y2="118" stroke="#C9D6E3" strokeWidth="2" />
          <ellipse cx="286" cy="132" rx="11" ry="14" fill="#FFD878" /><rect x="279" y="117" width="14" height="4" rx="2" fill="#D95F72" /><rect x="279" y="143" width="14" height="4" rx="2" fill="#D95F72" />
          <path d="M286 119v26M277 132h18" stroke="#fff" strokeWidth="1.2" opacity="0.6" fill="none" />
        </g>
      </svg>
    </div>
  );
}

function StarField({ n }) {
  const stars = useMemo(() => Array.from({ length: n }, () => ({
    left: `${randBetween(3, 96)}%`,
    top: `${randBetween(2, 92)}%`,
    s: `${randBetween(5, 12)}px`,
    d: `${-randBetween(0, 3)}s`,
  })), [n]);
  return (
    <div className="fo-stars">
      {stars.map((s, i) => (
        <i key={i} className="fo-star" style={{ left: s.left, top: s.top, '--s': s.s, '--d': s.d }} />
      ))}
    </div>
  );
}

function TarotScene() {
  return (
    <div className="fo-sky" data-for="tarot">
      <div className="fo-moon" />
      <StarField n={14} />
      <div className="fo-cloth" />
    </div>
  );
}

function AstroScene() {
  return (
    <div className="fo-sky" data-for="astro">
      <div className="fo-rings" />
      <StarField n={26} />
      <div className="fo-glow" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 主组件                                                               */
/* ------------------------------------------------------------------ */

export default function CompanionFortuneModal({
  companionId,
  companionAvatarUrl,
  companionName = '小伙伴',
  streakCount = 0,
  onClose,
}) {
  const rootRef = useRef(null);
  const boxRef = useRef(null);
  const wheelRef = useRef(null);
  const pointerRef = useRef(null);
  const sealRef = useRef(null);
  const cardRefs = useRef([]);
  const toastTimerRef = useRef(null);

  const [style, setStyleState] = useState('omikuji');
  const [todayDraw, setTodayDraw] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState('rack');
  const [showResult, setShowResult] = useState(false);
  const [shared, setShared] = useState(false);
  const [bubble, setBubble] = useState('');
  const [bubbleKey, setBubbleKey] = useState(0);
  const [toastMsg, setToastMsg] = useState('');
  const [toastShow, setToastShow] = useState(false);
  const [particles, setParticles] = useState([]);
  const [streakBumpKey, setStreakBumpKey] = useState(0);
  const [dayNewKey, setDayNewKey] = useState(0);

  // 连续天数徽章：排着队等庆祝的里程碑（已解锁但还没弹过庆祝动画的），
  // 队首就是正在展示的那一个；一次点"收下"只弹出下一个，不会一口气全弹光。
  const [badgeQueue, setBadgeQueue] = useState([]);
  const badgePopRef = useRef(null);

  const [boxShaking, setBoxShaking] = useState(false);
  const [boxHasStick, setBoxHasStick] = useState(false);
  const [stickNo, setStickNo] = useState(null);

  const [fanShuffling, setFanShuffling] = useState(false);
  const [pickedCard, setPickedCard] = useState(null); // index 0/1/2
  const [cardFlipped, setCardFlipped] = useState(false);
  const [revealedTarot, setRevealedTarot] = useState(null);

  const [wheelAngle, setWheelAngle] = useState(0);
  const [wheelNoAnim, setWheelNoAnim] = useState(true);

  /* ---------------- 初始化：读取今天的签 + 历史 ---------------- */
  useEffect(() => {
    if (!companionId) return;
    getFortuneState(companionId).then(({ todayDraw: td, history: h, preferredStyle }) => {
      setTodayDraw(td);
      setHistory(h);
      setStyleState(preferredStyle);
      if (td) {
        setShowResult(false);
        if (td.style === 'tarot') {
          setPickedCard(1);
          setCardFlipped(true);
          setRevealedTarot(td.result.entry);
        }
        if (td.style === 'astro') {
          const idx = ASTRO.findIndex((s) => s.sign === td.result.entry.sign);
          if (idx >= 0) setWheelAngle(((idx * -30) % 360 + 360) % 360);
        }
        if (td.style === 'omikuji') {
          setStickNo(td.result.entry.no);
          setBoxHasStick(true);
        }
      }
      setBubble(td ? idleLineFor(preferredStyle, td) : IDLE_TEXT[preferredStyle] || IDLE_TEXT.omikuji);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companionId]);

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  function idleLineFor(curStyle, draw) {
    if (draw && draw.style !== curStyle) return `今天抽的是${STYLE_NAMES[draw.style]}，明天再换个风格吧。`;
    if (draw) return `${draw.result.rank}！${draw.result.sec.pet}`;
    return IDLE_TEXT[curStyle] || IDLE_TEXT.omikuji;
  }

  const styleIdx = STYLES.indexOf(style);
  const alreadyDrawn = !!todayDraw;
  const week = useMemo(() => buildWeek(history, todayDraw), [history, todayDraw]);
  const rack = useMemo(() => buildRack(history, todayDraw), [history, todayDraw]);
  const streakNow = streakCount;

  /* ---------------- toast / 粒子 ---------------- */

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setToastShow(true);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastShow(false), 2800);
  }, []);

  const burstAt = useCallback((targetEl, type, n) => {
    const rootEl = rootRef.current;
    if (!rootEl || !targetEl) return;
    const rr = rootEl.getBoundingClientRect();
    const er = targetEl.getBoundingClientRect();
    const cx = er.left - rr.left + er.width / 2;
    const cy = er.top - rr.top + er.height / 2;
    const next = [];
    for (let i = 0; i < n; i += 1) {
      const ang = randBetween(0, Math.PI * 2);
      const dist = randBetween(60, type === 'conf' ? 190 : 110);
      const id = `${Date.now()}-${i}-${Math.random()}`;
      next.push({
        id, type,
        x: cx, y: cy,
        dx: Math.cos(ang) * dist,
        dy: Math.sin(ang) * dist + (type === 'conf' ? 70 : 0),
        rot: randBetween(-540, 540),
        delay: i * 18,
        color: type === 'conf' ? PARTICLE_COLORS[i % PARTICLE_COLORS.length] : undefined,
      });
    }
    setParticles((cur) => [...cur, ...next]);
    next.forEach((p) => {
      setTimeout(() => setParticles((cur) => cur.filter((x) => x.id !== p.id)), 2300);
    });
  }, []);

  /* ---------------- 连续天数徽章 ---------------- */
  /*
   * 解不解锁完全看 streakCount 实时比较，不存在数据库里（badgeData.js 的
   * unlockedMilestones 就是干这个的）；"看过庆祝动画没有"才是存在
   * companion.seenBadgeMilestones 里的状态（badgeService.js）。这里只在
   * 「已解锁 但 还没看过庆祝」的差集不为空、而且当前没有正在排队的庆祝时
   * 才去填 badgeQueue——避免用户正看着第 1 个的庆祝动画，效果又把队列
   * 重置掉。
   */
  useEffect(() => {
    if (!companionId) return undefined;
    let cancelled = false;
    getSeenBadgeMilestones(companionId).then((seenDays) => {
      if (cancelled) return;
      const newly = unlockedMilestones(streakCount).filter((m) => !seenDays.includes(m.days));
      if (newly.length === 0) return;
      setBadgeQueue((prev) => (prev.length > 0 ? prev : newly));
    });
    return () => { cancelled = true; };
  }, [companionId, streakCount]);

  const celebratingBadge = badgeQueue[0] || null;

  /* 队首换成新的里程碑（或者从没有变成有）时，在徽章卡上炸一下彩纸，
     跟抽签结果卡盖印章时的粒子特效是同一套 burstAt('conf', n)。 */
  useEffect(() => {
    if (!celebratingBadge || !badgePopRef.current) return;
    burstAt(badgePopRef.current, 'conf', 26);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebratingBadge?.days]);

  const handleCollectBadge = useCallback(() => {
    if (!celebratingBadge || !companionId) return;
    markBadgeMilestonesSeen(companionId, [celebratingBadge.days]);
    setBadgeQueue((q) => q.slice(1));
  }, [celebratingBadge, companionId]);

  /* ---------------- 风格 / 抽屉切换 ---------------- */

  const handleStyleChange = useCallback((s) => {
    if (busy || s === style) return;
    setStyleState(s);
    savePreferredStyle(companionId, s);
    setBubble(idleLineFor(s, todayDraw));
    setBubbleKey((k) => k + 1);
  }, [busy, style, companionId, todayDraw]);

  const toggleSheet = useCallback(() => setSheetOpen((v) => !v), []);

  /* ---------------- 戳一戳 ---------------- */

  const handlePoke = useCallback((el) => {
    if (busy) return;
    burstAt(el, 'heart', 3);
    setBubble(pickRand(POKE_LINES));
    setBubbleKey((k) => k + 1);
  }, [busy, burstAt]);

  /* ---------------- 抽签流程 ----------------
   * 原则：先向 fortuneService 要到真正落库的那一条签，动画只是把这同一条
   * 签「演」出来（摇签的数字、翻到的牌、星盘停的位置都用这条真实结果），
   * 不会出现"动画演了一个签，结果卡显示另一个签"的不一致。
   */

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const completeDraw = useCallback((draw) => {
    setTodayDraw(draw);
    setShared(false);
    setBubble(idleLineFor(draw.style, draw));
    setBubbleKey((k) => k + 1);
    setStreakBumpKey((k) => k + 1);
    setDayNewKey((k) => k + 1);
    setShowResult(true);
    setBusy(false);
    getFortuneState(companionId).then(({ history: h }) => setHistory(h));
  }, [companionId]);

  const openExistingResult = useCallback(() => setShowResult(true), []);

  const drawOmikuji = useCallback(async () => {
    setBoxHasStick(false);
    setBoxShaking(true);
    setBubble('哗啦哗啦……');
    setBubbleKey((k) => k + 1);
    const draw = await drawFortune(companionId, 'omikuji');
    await sleep(1050);
    setBoxShaking(false);
    setStickNo(draw.result.entry.no);
    setBoxHasStick(true);
    setBubble(`出来啦，是第 ${draw.result.entry.no} 签。`);
    setBubbleKey((k) => k + 1);
    if (boxRef.current) burstAt(boxRef.current, 'spark', 8);
    await sleep(1150);
    completeDraw(draw);
  }, [companionId, burstAt, completeDraw]);

  const drawTarot = useCallback(async (cardIndex) => {
    const draw = await drawFortune(companionId, 'tarot');
    const reveal = async (i) => {
      setPickedCard(i);
      setBubble('就是这一张了。');
      setBubbleKey((k) => k + 1);
      await sleep(380);
      setRevealedTarot(draw.result.entry);
      setCardFlipped(true);
      await sleep(520);
      if (cardRefs.current[i]) burstAt(cardRefs.current[i], 'spark', 9);
      await sleep(1100);
      completeDraw(draw);
    };
    if (typeof cardIndex === 'number') { await reveal(cardIndex); return; }
    setFanShuffling(true);
    setBubble('洗牌中……');
    setBubbleKey((k) => k + 1);
    await sleep(980);
    setFanShuffling(false);
    await reveal(Math.floor(Math.random() * 3));
  }, [companionId, burstAt, completeDraw]);

  const drawAstro = useCallback(async () => {
    const draw = await drawFortune(companionId, 'astro');
    const idx = ASTRO.findIndex((s) => s.sign === draw.result.entry.sign);
    setWheelNoAnim(false);
    setWheelAngle((cur) => {
      const mod = (n, m) => ((n % m) + m) % m;
      const delta = mod(-idx * 30 - cur, 360);
      return cur + 1440 + delta;
    });
    setBubble('星盘转起来了……');
    setBubbleKey((k) => k + 1);
    await sleep(3500);
    setBubble(`停在${draw.result.entry.sign}座。`);
    setBubbleKey((k) => k + 1);
    if (pointerRef.current) burstAt(pointerRef.current, 'spark', 8);
    await sleep(700);
    completeDraw(draw);
  }, [companionId, burstAt, completeDraw]);

  const startDraw = useCallback(async (cardIndex) => {
    if (busy) return;
    if (todayDraw) { openExistingResult(); return; }
    setBusy(true);
    try {
      if (style === 'omikuji') await drawOmikuji();
      else if (style === 'tarot') await drawTarot(cardIndex);
      else await drawAstro();
    } catch (e) {
      console.error('[FortuneModal] drawFortune 失败：', e);
      showToast('抽签失败了，再试试吧');
      setBusy(false);
    }
  }, [busy, todayDraw, style, drawOmikuji, drawTarot, drawAstro, openExistingResult, showToast]);

  const handleShare = useCallback(() => {
    if (shared) return;
    setShared(true);
    showToast('签文已发到聊天里，TA 下次回复时会看到');
  }, [shared, showToast]);

  const closeResult = useCallback(() => setShowResult(false), []);

  const handleClose = useCallback(() => onClose?.(), [onClose]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { if (showResult) closeResult(); else handleClose(); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showResult, closeResult, handleClose]);

  useEffect(() => {
    if (showResult && todayDraw) {
      const big = todayDraw.result.rank === '大吉' || todayDraw.result.rank === '中吉';
      const t = setTimeout(() => { if (sealRef.current) burstAt(sealRef.current, big ? 'conf' : 'spark', big ? 28 : 8); }, 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [showResult, todayDraw, burstAt]);

  const goLabel = alreadyDrawn ? '查看今日签文' : GO_LABEL[style];
  const todayDateText = useMemo(() => fmtDate(new Date()), []);
  const R = todayDraw?.result;
  const toneClass = R ? `tone-${RANKS[R.rank]?.tone ?? 'ji'}` : '';

  return (
    <div className="cp-overlay center">
      <div className="cp-backdrop" onClick={handleClose} />
      <div
        ref={rootRef}
        className={`fo-root${busy ? ' is-busy' : ''}`}
        data-style={style}
        style={{ '--fo-p': sheetOpen ? 1 : 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="宠物日签"
      >
        <SvgDefs />

        {/* ================= 场景 ================= */}
        <div className="fo-scene">
          <ToriiScene />
          <TarotScene />
          <AstroScene />
        </div>

        {/* ================= 顶栏 ================= */}
        <button type="button" className="fo-round-btn" aria-label="返回" onClick={handleClose}>
          <svg className="fo-ic"><use href="#i-back" /></svg>
        </button>

        <div className="fo-modes" role="tablist" aria-label="日签风格">
          <i className="ind" style={{ transform: `translateX(${styleIdx * 100}%)` }} />
          {STYLES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={style === s}
              className={style === s ? 'is-on' : ''}
              onClick={() => handleStyleChange(s)}
            >
              {STYLE_NAMES[s]}
            </button>
          ))}
        </div>

        <div key={streakBumpKey} className={`fo-streak${streakBumpKey ? ' is-bump' : ''}`} title="连续打卡天数">
          <svg className="fo-ic"><use href="#i-flame" /></svg>
          <b>{streakNow}</b><small>天</small>
        </div>

        <div className="fo-date"><i /><span>{todayDateText}</span></div>

        {/* ================= 舞台：神签 ================= */}
        <section className="fo-stage" data-stage="omikuji">
          <div className="fo-zone">
            <div className="fo-bubble"><span className="bub" key={`o-${bubbleKey}`}>{bubble}</span></div>
            <div className="fo-duo">
              <div className="fo-pet-wrap">
                <button type="button" className="fo-pet" aria-label="戳一戳" onClick={(e) => handlePoke(e.currentTarget)}>
                  <span className="fo-pet-ring" />
                  <span className="fo-pet-body"><PetFace avatarUrl={companionAvatarUrl} alt={companionName} /></span>
                  <i className="fo-orn a" /><i className="fo-orn b" />
                </button>
              </div>
              <button
                type="button"
                ref={boxRef}
                className={`fo-box${boxShaking ? ' is-shaking' : ''}${boxHasStick ? ' has-stick' : ''}`}
                aria-label="摇一摇抽签"
                onClick={() => startDraw()}
              >
                <span className="fo-sticks">
                  <i style={{ '--k': 0, '--rot': '-13deg', '--tip': '#FF86A0' }} />
                  <i style={{ '--k': 1, '--rot': '-7deg', '--tip': '#3D9BEA' }} />
                  <i style={{ '--k': 2, '--rot': '-3deg', '--tip': '#8FD9C0' }} />
                  <i style={{ '--k': 3, '--rot': '2deg', '--tip': '#FF86A0' }} />
                  <i style={{ '--k': 4, '--rot': '6deg', '--tip': '#FFD27A' }} />
                  <i style={{ '--k': 5, '--rot': '10deg', '--tip': '#3D9BEA' }} />
                  <i style={{ '--k': 6, '--rot': '14deg', '--tip': '#8FD9C0' }} />
                </span>
                <span className="fo-stick-out">
                  <span className="fo-stick-no">第 {stickNo != null ? pad2(stickNo) : '--'} 签</span>
                </span>
                <span className="fo-box-body">
                  <i className="fo-box-band t" />
                  <span className="fo-box-label">御神签</span>
                  <i className="fo-box-band b" />
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* ================= 舞台：塔罗 ================= */}
        <section className="fo-stage" data-stage="tarot">
          <div className="fo-zone">
            <div className="fo-bubble"><span className="bub" key={`t-${bubbleKey}`}>{bubble}</span></div>
            <div className={`fo-fan${fanShuffling ? ' is-shuffling' : ''}`}>
              {[0, 1, 2].map((i) => {
                const isPicked = pickedCard === i;
                const isDim = pickedCard !== null && !isPicked;
                const glyph = isPicked && revealedTarot ? revealedTarot.glyph : 'star';
                const name = isPicked && revealedTarot ? revealedTarot.name : '';
                return (
                  <button
                    key={i}
                    type="button"
                    ref={(el) => { cardRefs.current[i] = el; }}
                    className={`fo-card${isPicked ? ' is-picked' : ''}${isDim ? ' is-dim' : ''}${isPicked && cardFlipped ? ' is-flipped' : ''}`}
                    aria-label={`第${i + 1}张牌`}
                    onClick={() => startDraw(i)}
                  >
                    <span className="fo-card-in">
                      <span className="fo-face back" />
                      <span className="fo-face front">
                        <svg className="fo-glyph"><use href={`#g-${glyph}`} /></svg>
                        <em>{name}</em>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="fo-pet-wrap mini">
              <button type="button" className="fo-pet" aria-label="戳一戳" onClick={(e) => handlePoke(e.currentTarget)}>
                <span className="fo-pet-ring" />
                <span className="fo-pet-body"><PetFace avatarUrl={companionAvatarUrl} alt={companionName} /></span>
                <i className="fo-orn a" />
              </button>
            </div>
          </div>
        </section>

        {/* ================= 舞台：星盘 ================= */}
        <section className="fo-stage" data-stage="astro">
          <div className="fo-zone">
            <div className="fo-bubble"><span className="bub" key={`a-${bubbleKey}`}>{bubble}</span></div>
            <div className="fo-wheel-wrap">
              <i ref={pointerRef} className="fo-pointer" />
              <svg
                ref={wheelRef}
                className="fo-wheel"
                viewBox="0 0 260 260"
                aria-hidden="true"
                onClick={() => startDraw()}
                style={wheelNoAnim ? { transition: 'none', transform: `rotate(${wheelAngle}deg)` } : { transform: `rotate(${wheelAngle}deg)` }}
              >
                <circle className="w-disc" cx="130" cy="130" r="112" />
                <circle className="w-ring" cx="130" cy="130" r="70" />
                <circle className="w-dash" cx="130" cy="130" r="56" />
                {[15, 45, 75, 105, 135, 165, 195, 225, 255, 285, 315, 345].map((deg) => (
                  <use key={deg} href="#w-seg" transform={`rotate(${deg} 130 130)`} />
                ))}
                {ASTRO.map((s, i) => (
                  <text key={s.sign} className="w-txt" x="130" y="42" transform={`rotate(${i * 30} 130 130)`}>{s.sign}</text>
                ))}
              </svg>
              <svg className="fo-orbit" viewBox="0 0 260 260" aria-hidden="true">
                <circle className="w-orbit" cx="130" cy="130" r="122" />
                <circle cx="130" cy="8" r="5" fill="#FFD27A" />
                <circle cx="130" cy="8" r="5" fill="#FF86A0" transform="rotate(120 130 130)" />
                <circle cx="130" cy="8" r="5" fill="#8FD9C0" transform="rotate(240 130 130)" />
              </svg>
              <div className="fo-wheel-core">
                <div className="fo-pet-wrap mini" style={{ width: '100%', height: '100%' }}>
                  <button type="button" className="fo-pet" aria-label="戳一戳" onClick={(e) => handlePoke(e.currentTarget)}>
                    <span className="fo-pet-ring" />
                    <span className="fo-pet-body"><PetFace avatarUrl={companionAvatarUrl} alt={companionName} /></span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 底部抽屉 ================= */}
        <div className={`fo-sheet${sheetOpen ? ' is-open' : ''}`}>
          <div className="fo-sheet-peek">
            <button type="button" className="fo-grabber" aria-label="展开或收起签架与徽章" aria-expanded={sheetOpen} onClick={toggleSheet}>
              <i />
            </button>
            <div className="fo-week" aria-label="最近七天的抽签记录">
              {week.map((w) => {
                if (w.rank) {
                  const t = RANKS[w.rank]?.tone ?? 'ji';
                  const ch = RANKS[w.rank]?.ch ?? '吉';
                  const label = w.isToday ? '今天' : WEEKDAYS[w.date.getDay()];
                  const rowKey = w.isToday ? `${w.dateStr}-${dayNewKey}` : w.dateStr;
                  return (
                    <div key={rowKey} className={`fo-day is-done tone-${t}${w.isToday ? ' is-today' : ''}`}>
                      <small>{label}</small>
                      <span className={`fo-day-dot${w.isToday ? ' is-new' : ''}`}>{ch}</span>
                    </div>
                  );
                }
                const label = w.isToday ? '今天' : WEEKDAYS[w.date.getDay()];
                return (
                  <div key={w.dateStr} className={`fo-day${w.isToday ? ' is-today is-pending' : ''}`}>
                    <small>{label}</small>
                    <span className="fo-day-dot" />
                  </div>
                );
              })}
            </div>
            <button type="button" className={`fo-go${alreadyDrawn ? ' is-done' : ''}`} onClick={() => startDraw()} disabled={busy}>
              <svg className="fo-ic"><use href="#i-sparkle" /></svg>
              <span>{goLabel}</span>
            </button>
          </div>

          <div className="fo-sheet-body">
            <div className="fo-tabs">
              <i className="ind" style={{ transform: sheetTab === 'rack' ? 'translateX(0)' : 'translateX(100%)' }} />
              <button type="button" className={sheetTab === 'rack' ? 'is-on' : ''} onClick={() => setSheetTab('rack')}>签架</button>
              <button type="button" className={sheetTab === 'badge' ? 'is-on' : ''} onClick={() => setSheetTab('badge')}>徽章</button>
            </div>
            <div className="fo-panel-scroll">
              {sheetTab === 'rack' ? (
                <div>
                  <div className="fo-rack">
                    <div className="fo-rack-line">
                      {rack.map((x, i) => {
                        if (x.empty) {
                          return (
                            <div key={`empty-${i}`} className="fo-hang is-empty is-today" style={{ '--i': i }}>
                              <i className="knot" /><span className="fo-hang-paper">待抽</span><small>{x.label}</small>
                            </div>
                          );
                        }
                        const t = RANKS[x.rank]?.tone ?? 'ji';
                        return (
                          <div key={`${x.label}-${i}`} className={`fo-hang tone-${t}${x.today ? ' is-today' : ''}`} style={{ '--i': i }}>
                            <i className="knot" /><span className="fo-hang-paper">{x.rank}</span><small>{x.label}</small>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <p className="fo-rack-note">每天抽到的签会系在这里，往左划能看到更早的。</p>
                </div>
              ) : (
                <div className="fo-badge-grid">
                  {BADGE_MILESTONES.map((m) => {
                    const unlocked = streakNow >= m.days;
                    return (
                      <div key={m.days} className={`fo-badge-card${unlocked ? ' is-unlocked' : ' is-locked'}`}>
                        <div className="fo-badge-pic">
                          <img src={m.imageUrl} alt={`${m.label}纪念卡`} />
                          {!unlocked && (
                            <span className="fo-badge-lock" aria-hidden="true">
                              <svg className="fo-ic"><use href="#i-lock" /></svg>
                            </span>
                          )}
                        </div>
                        <span className="fo-badge-label">{m.label}</span>
                        <span className={`fo-badge-sub${unlocked ? ' is-done' : ''}`}>
                          {unlocked ? '已收集' : `还差 ${m.days - streakNow} 天`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================= 抽签结果 ================= */}
        {showResult && todayDraw && R && (
          <div className="fo-overlay" role="dialog" aria-modal="true" aria-label="今日签文">
            <div className="fo-backdrop" onClick={closeResult} />
            <div className={`fo-result ${toneClass}`} data-style={todayDraw.style}>

              <div className="fo-res-head">
                <p className="fo-res-kicker">
                  {todayDraw.style === 'omikuji' ? `御神签　第 ${pad2(R.entry.no)} 签`
                    : todayDraw.style === 'tarot' ? '星语塔罗　今日一张'
                      : '星盘日签　今日星位'}
                </p>
                <p className="fo-res-date">{fmtDate(new Date(`${todayDraw.dateStr}T00:00:00`))}</p>
                <div ref={sealRef} className={`fo-seal${R.rank.length === 1 ? ' is-single' : ''}`}>
                  <span>{R.rank}</span>
                </div>
              </div>

              {todayDraw.style === 'omikuji' && (
                <div className="fo-res-art" data-art="omikuji">
                  <div className="fo-poem">
                    {R.entry.poem.map((line, i) => (
                      <span key={i} className="fo-poem-line" style={{ '--i': i }}>{line}</span>
                    ))}
                  </div>
                </div>
              )}

              {todayDraw.style === 'tarot' && (
                <div className="fo-res-art" data-art="tarot">
                  <div className="fo-trow">
                    <div className="fo-tface">
                      <svg className="fo-glyph"><use href={`#g-${R.entry.glyph}`} /></svg>
                      <em>{R.entry.name}</em>
                    </div>
                    <div className="fo-tinfo">
                      <h4>{R.entry.name}</h4>
                      <p className="sub">{R.entry.en}</p>
                      <div className="fo-kws">{R.entry.kw.map((k) => <span key={k}>{k}</span>)}</div>
                      <p className="lines">{R.entry.lines.map((l, i) => <React.Fragment key={i}>{l}<br /></React.Fragment>)}</p>
                    </div>
                  </div>
                </div>
              )}

              {todayDraw.style === 'astro' && (
                <div className="fo-res-art" data-art="astro">
                  <div className="fo-trow">
                    <svg className="fo-rwheel" viewBox="0 0 120 120" aria-hidden="true">
                      <circle className="w-disc" cx="60" cy="60" r="54" />
                      <circle className="w-dash" cx="60" cy="60" r="42" />
                      <circle cx="60" cy="6" r="5" fill="#FF86A0" />
                      <text className="w-big" x="60" y="69">{R.entry.sign}</text>
                    </svg>
                    <div className="fo-tinfo">
                      <h4>{R.entry.sign}座</h4>
                      <p className="sub">守护星 {R.entry.planet}</p>
                      <p className="lines">{R.entry.lines.map((l, i) => <React.Fragment key={i}>{l}<br /></React.Fragment>)}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="fo-grid">
                <div className="fo-sec s-wish"><b>愿望</b><p>{R.sec.wish}</p></div>
                <div className="fo-sec s-trip"><b>出行</b><p>{R.sec.trip}</p></div>
                <div className="fo-sec s-people"><b>人际</b><p>{R.sec.people}</p></div>
                <div className="fo-sec s-tip"><b>提醒</b><p>{R.sec.tip}</p></div>
              </div>

              <div className="fo-lucky">
                <div className="fo-chip"><i className="fo-gem" /><span className="txt"><small>幸运物</small><span>{R.item}</span></span></div>
                <div className="fo-chip"><i className="fo-swatch" style={{ background: R.color.h }} /><span className="txt"><small>幸运色</small><span>{R.color.n}</span></span></div>
              </div>

              <div className="fo-yiji">
                <div className="fo-chip"><span className="fo-mark yi">宜</span><span className="txt">{R.sec.yi}</span></div>
                <div className="fo-chip"><span className="fo-mark ji">忌</span><span className="txt">{R.sec.ji}</span></div>
              </div>

              <div className="fo-says">
                <span className="fo-avatar"><PetFace avatarUrl={companionAvatarUrl} alt={companionName} /></span>
                <p>{R.sec.pet}</p>
              </div>

              <div className="fo-res-actions">
                <button type="button" className={`fo-btn${shared ? ' is-sent' : ''}`} onClick={handleShare} disabled={shared}>
                  <svg className="fo-ic"><use href={shared ? '#i-check' : '#i-send'} /></svg>
                  <span>{shared ? '已发给 TA' : '发给 TA'}</span>
                </button>
                <button type="button" className="fo-btn main" onClick={closeResult}>
                  <svg className="fo-ic"><use href="#i-check" /></svg>
                  <span>收下签文</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {celebratingBadge && (
          <div className="fo-overlay" role="dialog" aria-modal="true" aria-label="解锁徽章">
            <div className="fo-backdrop" />
            <div className="fo-badge-pop">
              <div className="fo-badge-pop-pic" ref={badgePopRef}>
                <img src={celebratingBadge.imageUrl} alt={`${celebratingBadge.label}纪念卡`} />
              </div>
              <p className="fo-badge-pop-kicker">连续签到</p>
              <h4>{celebratingBadge.label}纪念卡</h4>
              <p className="fo-badge-pop-text">{companionName}已经陪了你 {celebratingBadge.days} 天啦</p>
              {badgeQueue.length > 1 && (
                <p className="fo-badge-pop-hint">还有 {badgeQueue.length - 1} 枚等着收下</p>
              )}
              <button type="button" className="fo-btn main" onClick={handleCollectBadge}>
                <svg className="fo-ic"><use href="#i-check" /></svg>
                <span>收下徽章</span>
              </button>
            </div>
          </div>
        )}

        {/* 提示条 */}
        <div className={`fo-toast${toastShow ? ' is-show' : ''}`}>
          <svg className="fo-ic"><use href="#i-sparkle" /></svg>
          <span>{toastMsg}</span>
        </div>

        {/* 粒子特效 */}
        <div className="fo-fx">
          {particles.map((p) => (
            <i
              key={p.id}
              className={`fo-p ${p.type}`}
              style={{
                '--x': `${p.x}px`, '--y': `${p.y}px`,
                '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--r': `${p.rot}deg`,
                animationDelay: `${p.delay}ms`,
                ...(p.color ? { background: p.color } : {}),
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}