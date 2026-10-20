/**
 * CompanionWishPoolModal.jsx
 *
 * 「心心许愿池」小游戏的模态框：选档位 -> 抛心心 -> 演出 -> 结果牌。
 * 结果由 wishPoolService.js 在事务里抽好并结算，这个文件只管界面状态
 * 和演出时间线（先扣心心、硬币飞进池里、等一会儿再揭晓结果和返还）。
 * 结构照抄 CompanionMarblesModal.jsx 的外壳约定。
 *
 * Props:
 *   companionId    number   — 小伙伴 ID
 *   onRewardApplied function(companion) — 结算后把最新的 companion 传回去，
 *                                         调用方据此刷新主页的心心数
 *   onClose        function — 关闭整个弹窗
 */

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import './wishPool.css';
import { WISH_TIERS, WISH_DAILY_LIMIT, WISH_OUTCOMES } from './wishPoolData';
import { getWishState, submitWish } from './wishPoolService';

const round1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => String(round1(n));

// 每种结果在池水/光柱上的颜色（glow 对应 SVG 里三层水光之一）
const OUTCOME_FX = {
  win: { glow: 'pink', beam: 'linear-gradient(0deg, rgba(255,150,180,.9), rgba(255,200,215,0))', hearts: 10 },
  lose: { glow: null, beam: null, hearts: 0 },
  half: { glow: 'blue', beam: 'linear-gradient(0deg, rgba(130,200,255,.85), rgba(190,230,255,0))', hearts: 5 },
  jackpot: { glow: 'gold', beam: 'linear-gradient(0deg, rgba(255,214,102,.95), rgba(255,240,190,0))', hearts: 16 },
};
const ODD_LABELS = {
  win: ['愿望成真', 'w'], lose: ['悄悄收下', ''], half: ['还你一半', 'h'], jackpot: ['星光大奖', 'j'],
};

const HeartSvg = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-6.5-4.2-9-8C1.3 8.8 2.6 5.8 5.6 5.4c1.9-.3 3.6.7 4.4 2.2.8-1.5 2.5-2.5 4.4-2.2 3 .4 4.3 3.4 2.6 6.6-2.5 3.8-9 8-9 8Z" fill="#FF86A0" stroke="#D95F72" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);
const IconBack = () => (
  <svg className="wp-ic" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default function CompanionWishPoolModal({ companionId, onRewardApplied, onClose }) {
  const [hearts, setHearts] = useState(0);
  const [usedToday, setUsedToday] = useState(0);
  const [pick, setPick] = useState(1);
  const [busy, setBusy] = useState(false);
  const [coinKey, setCoinKey] = useState(0);
  const [ripples, setRipples] = useState([]); // { id, cx, cy, rx, ry, delay }
  const [bursts, setBursts] = useState([]); // { id, style }
  const [burstKey, setBurstKey] = useState(0);
  const [glow, setGlow] = useState(null); // 'pink' | 'gold' | 'blue' | null
  const [beam, setBeam] = useState(null); // { key, background }
  const [tag, setTag] = useState(null); // { cls, title, sub }
  const [errorText, setErrorText] = useState('');

  const timersRef = useRef([]);
  const idRef = useRef(0);
  const mountedRef = useRef(true);

  // 背景星星和光点：只在挂载时随机一次
  const decor = useMemo(() => ({
    stars: Array.from({ length: 16 }, (_, i) => ({
      id: i,
      style: {
        left: `${6 + Math.random() * 88}%`,
        top: `${3 + Math.random() * 34}%`,
        width: `${6 + Math.random() * 6}px`,
        height: `${6 + Math.random() * 6}px`,
        animationDelay: `${(Math.random() * 3).toFixed(2)}s`,
      },
    })),
    motes: Array.from({ length: 10 }, (_, i) => ({
      id: i,
      style: {
        left: `${14 + Math.random() * 72}%`,
        animationDelay: `${(Math.random() * 9).toFixed(1)}s`,
        '--dx': `${(Math.random() - 0.5) * 60}px`,
      },
    })),
  }), []);

  const later = useCallback((fn, ms) => {
    const t = setTimeout(() => { if (mountedRef.current) fn(); }, ms);
    timersRef.current.push(t);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  const refreshState = useCallback(async () => {
    const s = await getWishState(companionId);
    if (!mountedRef.current) return s;
    setHearts(s.hearts);
    setUsedToday(s.usedToday);
    return s;
  }, [companionId]);

  useEffect(() => { void refreshState(); }, [refreshState]);

  // 心心变少之后，当前选中的档位如果买不起了，自动换成买得起的最大一档
  useEffect(() => {
    if (hearts >= pick) return;
    const ok = WISH_TIERS.filter((t) => t <= hearts);
    setPick(ok.length ? ok[ok.length - 1] : WISH_TIERS[0]);
  }, [hearts, pick]);

  const addRipples = useCallback((n, spread) => {
    const fresh = Array.from({ length: n }, (_, i) => {
      idRef.current += 1;
      return {
        id: idRef.current,
        cx: 150 + (Math.random() - 0.5) * spread,
        cy: 182 + (Math.random() - 0.5) * 4,
        rx: 84 - i * 12,
        ry: 22 - i * 3,
        delay: i * 0.28,
      };
    });
    setRipples((prev) => [...prev, ...fresh]);
    const doomed = new Set(fresh.map((r) => r.id));
    later(() => setRipples((prev) => prev.filter((r) => !doomed.has(r.id))), 2800 + n * 300);
  }, [later]);

  const launchBurst = useCallback((count) => {
    if (!count) { setBursts([]); return; }
    const list = Array.from({ length: count }, (_, i) => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const d = 80 + Math.random() * 110;
      return {
        id: i,
        style: {
          '--x': `${Math.cos(a) * d}px`,
          '--y': `${Math.sin(a) * d - 20}px`,
          '--r': `${(Math.random() - 0.5) * 240}deg`,
          '--d': `${i * 30}ms`,
        },
      };
    });
    setBursts(list);
    setBurstKey((k) => k + 1);
  }, []);

  const handleToss = useCallback(async () => {
    if (busy || usedToday >= WISH_DAILY_LIMIT || hearts < pick) return;
    const stake = pick;
    setBusy(true);
    setErrorText('');
    setTag(null);
    setGlow(null);
    setBeam(null);
    setBursts([]);

    let res;
    try {
      res = await submitWish(companionId, stake);
    } catch (error) {
      console.error('[WishPool] 结算失败：', error);
      setErrorText('这次没投成功，心心没有被扣掉，再试一次吧。');
      await refreshState();
      if (mountedRef.current) setBusy(false);
      return;
    }

    // 演出：先扣心心 -> 硬币入水 -> 等一会儿 -> 揭晓
    setHearts((h) => round1(h - stake));
    setUsedToday(res.usedToday);
    setCoinKey((k) => k + 1);
    later(() => addRipples(3, 10), 780);
    later(() => {
      const fx = OUTCOME_FX[res.outcome.key] || OUTCOME_FX.lose;
      setHearts(round1(res.companion.hearts));
      setGlow(fx.glow);
      if (fx.beam) setBeam({ key: Date.now(), background: fx.beam });
      if (res.outcome.key !== 'lose') addRipples(2, 6);
      launchBurst(fx.hearts);
      setTag({
        cls: res.outcome.key,
        title: res.outcome.title,
        sub: res.payout > 0
          ? `拿回 ${fmt(res.payout)} 颗心心（投入 ${stake} 颗）`
          : `${stake} 颗心心沉进了池底`,
      });
      if (onRewardApplied) onRewardApplied(res.companion);
      setBusy(false);
    }, 1350);
  }, [busy, usedToday, hearts, pick, companionId, refreshState, later, addRipples, launchBurst, onRewardApplied]);

  const handleClose = useCallback(() => { onClose?.(); }, [onClose]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !busy) handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [busy, handleClose]);

  const outOfTries = usedToday >= WISH_DAILY_LIMIT;
  const tooPoor = hearts < pick;
  const tossLabel = outOfTries ? '今天的愿望许完啦' : tooPoor ? '心心不够这一档' : `抛 ${pick} 颗进许愿池`;

  return (
    <div className="cp-overlay center">
      <div className="cp-backdrop" onClick={busy ? undefined : handleClose} />
      <div className="wp-root" role="dialog" aria-modal="true" aria-label="心心许愿池">
        <div className="wp-scene">
          <div className="wp-moon" />
          <div className="wp-hill" />
          {decor.stars.map((s) => <i key={`s${s.id}`} className="wp-star" style={s.style} />)}
          {decor.motes.map((m) => <i key={`m${m.id}`} className="wp-mote" style={m.style} />)}
        </div>

        <div className="wp-top">
          <button type="button" className="wp-round" aria-label="返回" onClick={handleClose} disabled={busy}><IconBack /></button>
          <div className="wp-title"><b>心心许愿池</b><small>抛一颗心心，许一个愿</small></div>
          <div className="wp-pill" aria-label="当前心心数"><HeartSvg /><span>{fmt(hearts)}</span></div>
        </div>

        <div className="wp-attempts">
          <span>今日许愿 {usedToday}/{WISH_DAILY_LIMIT}</span>
          <span className="wp-dots">
            {Array.from({ length: WISH_DAILY_LIMIT }, (_, i) => (
              <span key={i} className={`wp-dot${i < usedToday ? ' is-used' : ''}`} />
            ))}
          </span>
        </div>

        <div className="wp-stage">
          <div className="wp-pool-wrap">
            <div className={`wp-tag ${tag ? `${tag.cls} is-show` : ''}`} aria-live="polite">
              <b>{tag ? tag.title : ''}</b>
              <small>{tag ? tag.sub : ''}</small>
            </div>

            {beam && <div key={beam.key} className="wp-beam" style={{ background: beam.background }} />}

            {coinKey > 0 && (
              <svg key={coinKey} className="wp-coin" viewBox="0 0 34 34" aria-hidden="true">
                <circle cx="17" cy="17" r="15" fill="#FFE9A8" stroke="#E7B93E" strokeWidth="2" />
                <path d="M17 25s-7-4.4-7-9.2c0-2.6 1.9-4.3 4-4.3 1.3 0 2.4.7 3 1.7.6-1 1.7-1.7 3-1.7 2.1 0 4 1.7 4 4.3C24 20.6 17 25 17 25z" fill="#FF86A0" stroke="#D95F72" strokeWidth="1.2" />
              </svg>
            )}

            <div className="wp-burst" key={burstKey} aria-hidden="true">
              {bursts.map((b) => <i key={b.id} style={b.style}><HeartSvg /></i>)}
            </div>

            <svg className="wp-pool" viewBox="0 0 300 260" role="img" aria-label="石头许愿池，中间有一座亮着水晶的小喷泉">
              <defs>
                <linearGradient id="wp-stone" x1="0" x2="1"><stop offset="0" stopColor="#C7BBE0" /><stop offset=".3" stopColor="#EFE9FA" /><stop offset=".65" stopColor="#DDD3F0" /><stop offset="1" stopColor="#B2A5D2" /></linearGradient>
                <linearGradient id="wp-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FBF8FF" /><stop offset="1" stopColor="#DCD2F0" /></linearGradient>
                <radialGradient id="wp-water" cx=".5" cy=".35" r=".8"><stop offset="0" stopColor="#E5F6FF" /><stop offset=".55" stopColor="#9ED7F7" /><stop offset="1" stopColor="#6FA8EA" /></radialGradient>
                <radialGradient id="wp-glow-pink" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#FFB3C6" stopOpacity=".95" /><stop offset="1" stopColor="#FFB3C6" stopOpacity="0" /></radialGradient>
                <radialGradient id="wp-glow-gold" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#FFE08A" stopOpacity=".98" /><stop offset="1" stopColor="#FFE08A" stopOpacity="0" /></radialGradient>
                <radialGradient id="wp-glow-blue" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#9ED7FF" stopOpacity=".95" /><stop offset="1" stopColor="#9ED7FF" stopOpacity="0" /></radialGradient>
                <linearGradient id="wp-pillar" x1="0" x2="1"><stop offset="0" stopColor="#C2B6DE" /><stop offset=".45" stopColor="#F3EEFC" /><stop offset="1" stopColor="#B7AAD6" /></linearGradient>
                <clipPath id="wp-water-clip"><ellipse cx="150" cy="168" rx="108" ry="31" /></clipPath>
              </defs>

              <ellipse cx="150" cy="238" rx="132" ry="14" fill="rgba(80,60,150,.18)" />
              <path d="M18 168 v40 a132 34 0 0 0 264 0 v-40 z" fill="url(#wp-stone)" stroke="#A89BCB" strokeWidth="2.5" strokeLinejoin="round" />
              <g fill="none" stroke="#B2A5D2" strokeWidth="2" opacity=".75">
                <path d="M58 206 q16 10 32 0" /><path d="M104 214 q16 10 32 0" /><path d="M134 216 q16 10 32 0" /><path d="M178 214 q16 10 32 0" /><path d="M224 206 q16 10 32 0" />
              </g>
              <g fill="#FFD4E0" opacity=".9"><circle cx="75" cy="196" r="3" /><circle cx="150" cy="222" r="3" /><circle cx="225" cy="196" r="3" /></g>
              <ellipse cx="150" cy="168" rx="132" ry="38" fill="url(#wp-rim)" stroke="#A89BCB" strokeWidth="2.5" />
              <ellipse cx="150" cy="170" rx="114" ry="32" fill="#CFC3E8" />
              <ellipse cx="150" cy="168" rx="108" ry="31" fill="url(#wp-water)" />
              <g clipPath="url(#wp-water-clip)">
                <ellipse className={`wp-waterglow${glow === 'pink' ? ' is-on' : ''}`} cx="150" cy="172" rx="108" ry="31" fill="url(#wp-glow-pink)" />
                <ellipse className={`wp-waterglow${glow === 'gold' ? ' is-on' : ''}`} cx="150" cy="172" rx="108" ry="31" fill="url(#wp-glow-gold)" />
                <ellipse className={`wp-waterglow${glow === 'blue' ? ' is-on' : ''}`} cx="150" cy="172" rx="108" ry="31" fill="url(#wp-glow-blue)" />
                <g fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" strokeLinecap="round"><path d="M70 176 q10 -3 20 0" /><path d="M196 182 q10 -3 22 0" /><path d="M120 190 q8 -2 16 0" /></g>
                <g>
                  {ripples.map((r) => (
                    <ellipse key={r.id} className="wp-ripple" cx={r.cx} cy={r.cy} rx={r.rx} ry={r.ry} style={{ animationDelay: `${r.delay}s` }} />
                  ))}
                </g>
                <g className="wp-lily"><ellipse cx="86" cy="164" rx="17" ry="5.5" fill="#8EDDB8" stroke="#5FBE97" strokeWidth="1.5" /><path d="M86 164 l11 -3" stroke="#5FBE97" strokeWidth="1.2" />
                  <path d="M86 161 q-5 -9 0 -13 q5 4 0 13z" fill="#FFD4E0" stroke="#F7A6BD" strokeWidth="1.2" /><path d="M86 161 q-9 -4 -9 -10 q7 0 9 10z" fill="#FFE6EC" stroke="#F7A6BD" strokeWidth="1.2" /><path d="M86 161 q9 -4 9 -10 q-7 0 -9 10z" fill="#FFE6EC" stroke="#F7A6BD" strokeWidth="1.2" /></g>
                <g className="wp-lily b"><ellipse cx="214" cy="172" rx="15" ry="5" fill="#8EDDB8" stroke="#5FBE97" strokeWidth="1.5" /><path d="M214 172 l-10 -3" stroke="#5FBE97" strokeWidth="1.2" /></g>
                <g className="wp-lily c"><ellipse cx="116" cy="186" rx="11" ry="3.6" fill="#A5E8C7" stroke="#5FBE97" strokeWidth="1.2" /></g>
              </g>
              <path d="M42 176 Q150 214 258 176" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="2.5" strokeLinecap="round" opacity=".7" />

              <rect x="140" y="106" width="20" height="62" rx="6" fill="url(#wp-pillar)" stroke="#A89BCB" strokeWidth="2" />
              <ellipse cx="150" cy="168" rx="19" ry="6" fill="#E9E2F6" stroke="#A89BCB" strokeWidth="2" />
              <path d="M112 100 q38 22 76 0 q-4 18 -38 18 q-34 0 -38 -18z" fill="url(#wp-pillar)" stroke="#A89BCB" strokeWidth="2" strokeLinejoin="round" />
              <ellipse cx="150" cy="100" rx="38" ry="9" fill="#BFE6FA" stroke="#A89BCB" strokeWidth="2" />
              <ellipse cx="150" cy="100" rx="30" ry="6" fill="#E3F5FF" />
              <g fill="none" stroke="#E6F7FF" strokeWidth="3" strokeLinecap="round" opacity=".95">
                <path className="wp-stream" d="M116 102 q-14 18 -10 62" /><path className="wp-stream" d="M184 102 q14 18 10 62" /><path className="wp-stream" d="M126 106 q-8 22 -4 58" /><path className="wp-stream" d="M174 106 q8 22 4 58" />
              </g>
              <g className="wp-crystal">
                <path d="M150 98 s-19 -11 -19 -24 c0 -7 5 -12 11 -12 3.6 0 6.5 1.9 8 4.7 1.5 -2.8 4.4 -4.7 8 -4.7 6 0 11 5 11 12 C169 87 150 98 150 98z" fill="#FFC2D2" stroke="#E4607F" strokeWidth="2.2" strokeLinejoin="round" />
                <path d="M140 70 q2 -5 7 -4" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".9" />
              </g>
            </svg>
          </div>
        </div>

        <div className="wp-panel">
          <div className="wp-panel-head"><b>这次抛几颗？</b><small>选一档，再抛进池里</small></div>
          <div className="wp-tiers">
            {WISH_TIERS.map((t) => (
              <button
                type="button"
                key={t}
                className="wp-tier"
                aria-pressed={pick === t}
                disabled={hearts < t || busy}
                onClick={() => setPick(t)}
              >
                <HeartSvg /><b>{t}</b><small>{hearts < t ? '心心不够' : '可以投'}</small>
              </button>
            ))}
          </div>
          <div className="wp-odds" aria-label="可能的结果">
            {WISH_OUTCOMES.map((o) => (
              <div key={o.key} className={`wp-odd ${ODD_LABELS[o.key][1]}`}>
                <b>{Math.round(o.p * 100)}%</b><small>{ODD_LABELS[o.key][0]}</small>
              </div>
            ))}
          </div>
          <button type="button" className="wp-toss" onClick={handleToss} disabled={busy || outOfTries || tooPoor}>
            <HeartSvg />
            <span>{tossLabel}</span>
          </button>
          <p className="wp-note">
            {errorText || (outOfTries ? '明天再来，次数会重新刷新。' : `每天最多许愿 ${WISH_DAILY_LIMIT} 次，没用完的次数不会累积。`)}
          </p>
        </div>
      </div>
    </div>
  );
}