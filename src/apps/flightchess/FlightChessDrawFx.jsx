// src/apps/flightchess/FlightChessDrawFx.jsx
//
// 抽卡专属特效：每副卡有自己的卡背纹样和翻开瞬间的粒子。
//   - DeckBackArt：卡背上的描线图案（心 / 火苗 / 月亮 / 爆星 / 皇冠 / 闪光）
//   - DrawParticles：卡片翻开时铺满弹窗的粒子层（上升 / 爆开 / 洒落 / 闪烁 / 飘荡）
// 只负责视觉，不含任何游戏规则。样式在 flightChessDraw.css。
// 粒子位置和节奏由下标算出来（不用 Math.random），所以每次渲染都一致，
// 不会在重渲染时抖动。

import React, { useMemo } from 'react';

const SHAPE_PATHS = {
  heart: 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.4 4.5c2.2 0 3.8 1.2 5.6 3.3 1.8-2.1 3.4-3.3 5.6-3.3 3.7 0 5.5 3.9 4 7.3C19.5 16.4 12 21 12 21z',
  star: 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z',
  flame: 'M12 2c3 4 6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 3-7 6-11z',
  confetti: 'M3 7h18v10H3z',
};

// 每副卡的粒子配置
const DECK_FX = {
  crush: {
    mode: 'rise', count: 18, shapes: ['heart'],
    colors: ['#fb7f9b', '#fda4b8', '#fbc2cf', '#ffffff'],
  },
  warm: {
    mode: 'rise', count: 24, shapes: ['flame', 'star'],
    colors: ['#f59e0b', '#fcd34d', '#fb923c', '#fde68a'],
  },
  soul: {
    mode: 'twinkle', count: 26, shapes: ['star'],
    colors: ['#c4b5fd', '#e9d5ff', '#ffffff', '#a5b4fc'],
  },
  sweet: {
    mode: 'burst', count: 30, shapes: ['heart', 'confetti', 'star'],
    colors: ['#f43f5e', '#fb7185', '#fda4af', '#ffffff', '#fbbf24'],
  },
  winner: {
    mode: 'fall', count: 40, shapes: ['confetti', 'star', 'confetti'],
    colors: ['#fbbf24', '#fcd34d', '#f59e0b', '#fde68a', '#ffffff'],
  },
  custom: {
    mode: 'drift', count: 16, shapes: ['star', 'heart'],
    colors: ['#93c5fd', '#c4b5fd', '#fbcfe8', '#ffffff'],
  },
};

// 0 到 1 的确定性伪随机
const rnd = (index, salt) => {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const Shape = ({ name }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={SHAPE_PATHS[name] || SHAPE_PATHS.star} />
  </svg>
);

const buildParticle = (fx, index) => {
  const shape = fx.shapes[index % fx.shapes.length];
  const color = fx.colors[Math.floor(rnd(index, 3) * fx.colors.length)];
  const size = 10 + Math.round(rnd(index, 4) * 16);
  const base = {
    '--c': color,
    '--s': `${size}px`,
    '--rot': `${Math.round((rnd(index, 5) - 0.5) * 360)}deg`,
  };

  switch (fx.mode) {
    case 'burst': {
      const angle = rnd(index, 1) * Math.PI * 2;
      const dist = 90 + rnd(index, 2) * 170;
      return {
        shape,
        style: {
          ...base,
          '--px': '50%',
          '--py': '44%',
          '--dx': `${Math.round(Math.cos(angle) * dist)}px`,
          '--dy': `${Math.round(Math.sin(angle) * dist)}px`,
          '--delay': `${Math.round(rnd(index, 6) * 160)}ms`,
          '--dur': `${1100 + Math.round(rnd(index, 7) * 600)}ms`,
        },
      };
    }
    case 'fall':
      return {
        shape,
        style: {
          ...base,
          '--px': `${Math.round(rnd(index, 1) * 100)}%`,
          '--py': '-6%',
          '--dx': `${Math.round((rnd(index, 2) - 0.5) * 120)}px`,
          '--dy': '112vh',
          '--delay': `${Math.round(rnd(index, 6) * 700)}ms`,
          '--dur': `${1700 + Math.round(rnd(index, 7) * 1100)}ms`,
        },
      };
    case 'twinkle':
      return {
        shape,
        style: {
          ...base,
          '--px': `${Math.round(rnd(index, 1) * 100)}%`,
          '--py': `${Math.round(rnd(index, 2) * 100)}%`,
          '--delay': `${Math.round(rnd(index, 6) * 1200)}ms`,
          '--dur': `${1400 + Math.round(rnd(index, 7) * 1200)}ms`,
        },
      };
    case 'drift':
      return {
        shape,
        style: {
          ...base,
          '--px': `${Math.round(8 + rnd(index, 1) * 84)}%`,
          '--py': `${Math.round(30 + rnd(index, 2) * 60)}%`,
          '--dx': `${Math.round((rnd(index, 8) - 0.5) * 80)}px`,
          '--dy': `${-80 - Math.round(rnd(index, 9) * 140)}px`,
          '--delay': `${Math.round(rnd(index, 6) * 700)}ms`,
          '--dur': `${2200 + Math.round(rnd(index, 7) * 1400)}ms`,
        },
      };
    case 'rise':
    default:
      return {
        shape,
        style: {
          ...base,
          '--px': `${Math.round(6 + rnd(index, 1) * 88)}%`,
          '--py': '78%',
          '--dx': `${Math.round((rnd(index, 8) - 0.5) * 90)}px`,
          '--dy': `${-160 - Math.round(rnd(index, 9) * 280)}px`,
          '--delay': `${Math.round(rnd(index, 6) * 800)}ms`,
          '--dur': `${1700 + Math.round(rnd(index, 7) * 1200)}ms`,
        },
      };
  }
};

/** 翻开瞬间的粒子层（铺满弹窗背景，不挡点击） */
export const DrawParticles = ({ deckId }) => {
  const fx = DECK_FX[deckId];
  const particles = useMemo(() => (
    fx ? Array.from({ length: fx.count }, (_, index) => buildParticle(fx, index)) : []
  ), [fx]);

  if (!fx) return null;
  return (
    <div className={`fc-fx-layer mode-${fx.mode} deck-${deckId}`} aria-hidden="true">
      {particles.map((particle, index) => (
        <span key={index} className="fc-fx-p" style={particle.style}>
          <Shape name={particle.shape} />
        </span>
      ))}
    </div>
  );
};

/* ------------------------------ 卡背纹样 ------------------------------ */

const BACK_ART = {
  crush: <path d="M32 54s-17-10.4-21.8-20.8C6.8 25.6 10.8 17 19 17c5 0 8.6 2.7 13 7.5C36.4 19.7 40 17 45 17c8.2 0 12.2 8.6 8.8 16.2C49 43.6 32 54 32 54z" />,
  warm: (
    <>
      <path d="M32 8c7 9 14 14.5 14 25a14 14 0 0 1-28 0c0-10.5 7-16 14-25z" />
      <path d="M32 30c3.5 4.5 6 7 6 11a6 6 0 0 1-12 0c0-4 2.5-6.5 6-11z" />
    </>
  ),
  soul: (
    <>
      <path d="M40 10a22 22 0 1 0 14 38A18 18 0 0 1 40 10z" />
      <path d="M50 14v6M47 17h6M16 14v4M14 16h4" />
    </>
  ),
  sweet: <path d="M32 6l5.5 14.5L52 14l-6.5 14.5L60 34l-14.5 5.5L52 54l-14.5-6.5L32 62l-5.5-14.5L12 54l6.5-14.5L4 34l14.5-5.5L12 14l14.5 6.5z" />,
  winner: (
    <>
      <path d="M10 48h44l-3-26-11 11-8-17-8 17-11-11z" />
      <path d="M12 54h40" />
    </>
  ),
  custom: (
    <>
      <path d="M32 8l4.5 14L50 26l-13.5 4L32 44l-4.5-14L14 26l13.5-4z" />
      <path d="M48 42v10M43 47h10" />
    </>
  ),
};

/** 卡背上的描线图案 */
export const DeckBackArt = ({ deckId }) => {
  const art = BACK_ART[deckId];
  if (!art) return null;
  return (
    <svg
      className={`fc-back-art deck-${deckId}`}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {art}
    </svg>
  );
};

export default DrawParticles;