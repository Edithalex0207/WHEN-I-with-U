// src/apps/flightchess/FlightChessLobbyBits.jsx
//
// 大厅 / 建局向导共用的小零件：弥散天空背景、角色头像、等距棋盘模型。
// 只负责显示，不碰 Dexie、不含游戏规则。

import React, { useMemo } from 'react';

import { TILE_TONES } from './flightChessBoardData';

/* ------------------------------ 天空背景 ------------------------------ */

export const LobbySky = () => (
  <div className="fcl-sky" aria-hidden="true">
    <span className="fcl-blob b1" />
    <span className="fcl-blob b2" />
    <span className="fcl-blob b3" />
    <span className="fcl-blob b4" />
    <span className="fcl-mote" style={{ left: '12%', top: '70%' }} />
    <span className="fcl-mote" style={{ left: '34%', top: '82%', animationDelay: '-2s' }} />
    <span className="fcl-mote" style={{ left: '61%', top: '76%', animationDelay: '-4s' }} />
    <span className="fcl-mote" style={{ left: '82%', top: '88%', animationDelay: '-1s' }} />
  </div>
);

/* ------------------------------ 头像 ------------------------------ */

const AVATAR_TONES = [
  { c1: '#f4a6b5', c2: '#fbd5e0' },
  { c1: '#8fb8ea', c2: '#cfe3f7' },
  { c1: '#b9a6e3', c2: '#e3dbf7' },
  { c1: '#f2b8d8', c2: '#fbe0ef' },
  { c1: '#9fcdea', c2: '#d6ecf8' },
];

export const toneForIndex = (index) => AVATAR_TONES[Math.abs(index) % AVATAR_TONES.length];

export const firstChar = (name) => Array.from(String(name || '?').trim())[0] || '?';

/** 角色头像：有图片就用图片，没有就用名字第一个字 */
export const CharAvatar = ({ character, className = '' }) => {
  if (character?.avatar) {
    return (
      <span className={`${className} has-img`}>
        <img src={character.avatar} alt="" loading="lazy" decoding="async" />
      </span>
    );
  }
  return <span className={className}>{firstChar(character?.name)}</span>;
};

/* ------------------------------ 等距棋盘模型 ------------------------------ */

const TONE_COLORS = {
  rose: '#f4a6b5',
  blue: '#8fb8ea',
  mint: '#9ad6b4',
  gold: '#f3d57e',
  violet: '#b9a6e3',
  gray: '#fff3f8',
};

const getRingSize = (count) => {
  let size = 3;
  while (4 * (size - 1) < count) size += 1;
  return size;
};

// 和 FlightChessBoard3D 里的走法保持一致：左下角起点，顺时针
const getRingCell = (index, size) => {
  const last = size - 1;
  if (index === 0) return { row: size, col: 1, corner: true };
  if (index < last) return { row: size - index, col: 1 };
  if (index === last) return { row: 1, col: 1, corner: true };
  if (index < 2 * last) return { row: 1, col: index - last + 1 };
  if (index === 2 * last) return { row: 1, col: size, corner: true };
  if (index < 3 * last) return { row: index - 2 * last + 1, col: size };
  if (index === 3 * last) return { row: size, col: size, corner: true };
  return { row: size, col: size - (index - 3 * last) };
};

/**
 * 用真实的格子类型画一块等距（斜 45 度）棋盘模型。
 * tiles 不传时画 count 格的空白模型；tokens: [{ index, color }]。
 */
export const IsoBoard = ({
  tiles,
  count = 48,
  tw = 20,
  depth = 6,
  tokens = [],
  plane = false,
  stroke = 0.8,
  className = '',
}) => {
  const model = useMemo(() => {
    const total = tiles ? tiles.length : count;
    const size = getRingSize(total);
    const th = tw / 2;
    const cx = (size * tw) / 2;
    const toXY = (row, col) => ({
      x: ((col - 1) - (row - 1)) * (tw / 2) + cx,
      y: ((col - 1) + (row - 1)) * (th / 2),
    });

    const cells = Array.from({ length: total }, (_, index) => {
      const cell = getRingCell(index, size);
      const cycle = ['rose', 'blue', 'mint', 'gold', 'violet'];
      let tone;
      if (tiles) tone = TILE_TONES[tiles[index]?.type] || 'gray';
      else tone = cell.corner || index % 3 === 0 ? cycle[index % 5] : 'gray';
      return {
        index,
        corner: Boolean(cell.corner),
        tone,
        ...toXY(cell.row, cell.col),
        order: cell.row + cell.col,
      };
    }).sort((a, b) => a.order - b.order);

    const corners = [toXY(2, 2), toXY(2, size - 1), toXY(size - 1, size - 1), toXY(size - 1, 2)];
    const courtyard = corners.map((p) => `${p.x},${p.y + th}`).join(' ');

    const top = 28;
    const width = size * tw;
    const height = size * th + depth + 10;
    return { cells, courtyard, top, width, height, th, size, toXY };
  }, [tiles, count, tw, depth]);

  const { cells, courtyard, top, width, height, th } = model;
  const cellMap = useMemo(() => Object.fromEntries(cells.map((c) => [c.index, c])), [cells]);

  return (
    <svg
      className={className}
      viewBox={`0 -${top} ${width} ${height + top}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <polygon points={courtyard} fill="#fff3f8" opacity="0.5" />
      {cells.map((cell) => {
        const color = TONE_COLORS[cell.tone] || TONE_COLORS.gray;
        const topFill = cell.corner || cell.tone === 'gray'
          ? color
          : `color-mix(in srgb, ${color} 72%, #ffffff)`;
        const d = cell.corner ? depth + 3 : depth;
        const { x, y } = cell;
        return (
          <g key={cell.index}>
            <polygon
              points={`${x - tw / 2},${y + th / 2} ${x},${y + th} ${x},${y + th + d} ${x - tw / 2},${y + th / 2 + d}`}
              fill={`color-mix(in srgb, ${topFill} 78%, #6a4a66)`}
            />
            <polygon
              points={`${x},${y + th} ${x + tw / 2},${y + th / 2} ${x + tw / 2},${y + th / 2 + d} ${x},${y + th + d}`}
              fill={`color-mix(in srgb, ${topFill} 88%, #6a4a66)`}
            />
            <polygon
              points={`${x},${y} ${x + tw / 2},${y + th / 2} ${x},${y + th} ${x - tw / 2},${y + th / 2}`}
              fill={topFill}
              stroke="rgba(255,255,255,0.75)"
              strokeWidth={stroke}
            />
          </g>
        );
      })}
      {tokens.map((token, i) => {
        const cell = cellMap[token.index];
        if (!cell) return null;
        const px = cell.x;
        const py = cell.y + th / 2 - 6;
        return (
          <g key={token.index} className="fcl-token" style={{ animationDelay: `${-i * 0.6}s` }}>
            <ellipse cx={px} cy={py + 8} rx={tw * 0.2} ry={tw * 0.08} fill="rgba(70,40,80,0.28)" />
            <circle cx={px} cy={py - 2} r={tw * 0.24} fill={token.color} stroke="#fff" strokeWidth="1.6" />
            <circle cx={px - tw * 0.07} cy={py - 5} r={tw * 0.07} fill="#fff" opacity="0.85" />
          </g>
        );
      })}
      {plane && (
        <g className="fcl-plane">
          <g transform={`translate(${width * 0.42},${-top * 0.3})`}>
            <path d="M0 0l30 -10 -10 28 -6 -10z" fill="#ffffff" />
            <path d="M14 8l16 -18" stroke="#e6cfe0" strokeWidth="1.4" />
          </g>
        </g>
      )}
    </svg>
  );
};