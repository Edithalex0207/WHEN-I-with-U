// src/apps/flightchess/FlightChessTokens.jsx
//
// 棋子图标和落点特效。四位玩家各有一种造型和一套专属特效：
//   玩家0（用户）  爱心   落点升起一串漂浮的小爱心
//   玩家1          纸飞机 落点划出一道飞行拖尾，纸飞机掠过
//   玩家2          星星   落点迸出放射状的星光
//   玩家3          月亮   落点荡开几圈月晕，光点缓缓飘起
// 点击棋子本身也会播放同一套特效（小号）。全部是 SVG + CSS，不用 Emoji。

import React, { useMemo } from 'react';

export const PLAYER_COLORS = ['#fca5b9', '#93c5fd', '#86efac', '#fde047'];
export const PLAYER_GLOWS = [
  'rgba(252, 165, 185, 0.55)',
  'rgba(147, 197, 253, 0.55)',
  'rgba(134, 239, 172, 0.55)',
  'rgba(253, 224, 71, 0.55)',
];
export const TOKEN_KINDS = ['heart', 'plane', 'star', 'moon'];

const PATHS = {
  heart: 'M12 21C5 15.5 2 12.2 2 8.5 2 5.5 4.3 3.5 7 3.5c2 0 3.700 1.100 5 3 1.300-1.900 3-3 5-3 2.700 0 5 2 5 5 0 3.700-3 7-10 12.500z',
  star: 'M12 2l2.900 6.500 7.100.7-5.300 4.800 1.500 7-6.200-3.600L5.800 21l1.500-7L2 9.200l7.100-.7z',
  moon: 'M20 14.500A8.500 8.500 0 1 1 9.500 4a7 7 0 0 0 10.500 10.500z',
  plane: 'M2.500 11.500L21 2.500 12.500 21 10 13.500z',
};

export const TokenIcon = ({ kind }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={PATHS[kind] || PATHS.heart} />
  </svg>
);

const rand = (min, max) => min + Math.random() * (max - min);

const makeParts = (kind, big) => {
  const scale = big ? 1.3 : 0.85;
  const parts = [];

  if (kind === 'heart') {
    const n = big ? 9 : 5;
    for (let i = 0; i < n; i += 1) {
      parts.push({
        type: 'icon',
        dx: rand(-38, 38) * scale,
        dy: -rand(44, 96) * scale,
        rot: rand(-45, 45),
        s: rand(0.8, 1.4),
        delay: rand(0, 0.3),
        dur: rand(0.9, 1.3),
      });
    }
  } else if (kind === 'star') {
    const n = big ? 10 : 6;
    for (let i = 0; i < n; i += 1) {
      const angle = (i / n) * Math.PI * 2;
      const r = rand(36, 64) * scale;
      parts.push({
        type: 'icon',
        dx: Math.cos(angle) * r,
        dy: Math.sin(angle) * r * 0.9 - 14,
        rot: rand(-120, 120),
        s: rand(0.7, 1.3),
        delay: rand(0, 0.1),
        dur: rand(0.7, 1),
      });
    }
  } else if (kind === 'plane') {
    const n = big ? 7 : 4;
    for (let i = 0; i < n; i += 1) {
      parts.push({
        type: 'dash',
        dx: rand(36, 74) * scale,
        dy: -rand(14, 44) * scale,
        rot: -28,
        s: rand(0.8, 1.2),
        delay: i * 0.05,
        dur: rand(0.55, 0.8),
      });
    }
    parts.push({
      type: 'icon',
      dx: 70 * scale,
      dy: -52 * scale,
      rot: -20,
      s: 1.5,
      delay: 0,
      dur: 0.9,
    });
  } else {
    const n = big ? 7 : 4;
    for (let i = 0; i < n; i += 1) {
      parts.push({
        type: 'dot',
        dx: rand(-26, 26) * scale,
        dy: -rand(40, 90) * scale,
        rot: 0,
        s: rand(0.7, 1.4),
        delay: rand(0, 0.4),
        dur: rand(1.1, 1.6),
      });
    }
  }

  return parts;
};

/**
 * 立在格子上的特效层。放在格子里（棋盘3D空间内），自己做反向倾斜站直，
 * 所以粒子是朝屏幕上方飘，而不是贴在地面上。nonce 变了就重新播一次。
 */
export const FxBurst = ({ kind, color, big, nonce }) => {
  const parts = useMemo(() => makeParts(kind, big), [kind, big, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fc-fx-stand" style={{ '--fx-color': color }} key={nonce}>
      {(kind === 'moon' || big) && (
        <>
          <span className="fc-fx-ring" style={{ '--delay': '0s' }} />
          <span className="fc-fx-ring" style={{ '--delay': '0.25s' }} />
        </>
      )}
      {parts.map((part, index) => (
        <span
          key={index}
          className={`fc-fx-part ${part.type === 'dash' ? 'fc-fx-dash' : ''} ${part.type === 'dot' ? 'fc-fx-dot' : ''}`}
          style={{
            '--dx': `${part.dx}px`,
            '--dy': `${part.dy}px`,
            '--rot': `${part.rot}deg`,
            '--s': part.s,
            '--delay': `${part.delay}s`,
            '--dur': `${part.dur}s`,
          }}
        >
          {part.type === 'icon' && <TokenIcon kind={kind} />}
        </span>
      ))}
    </div>
  );
};