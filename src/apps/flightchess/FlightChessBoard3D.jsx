// src/apps/flightchess/FlightChessBoard3D.jsx
//
// 方形环形赛道 + 斜俯视镜头。
//
// 格子沿方形的四条边顺时针排一圈（起点在左下角，先沿左边向上），四个角是
// 大格；中间是庭院（机库、牌堆、塔台）。整块棋盘放在一个「世界」里，用
// perspective + rotateX 压成斜俯视，格子靠 translateZ 抬高并带侧壁，所以有
// 真实的厚度和视差。
//
// 镜头：默认推近并跟着当前玩家的棋子走（follow），也可以拉远看全景
// （overview）。镜头只改世界的 transform，棋子靠反向旋转保持站直。
//
// 本组件只负责「画」，不含任何游戏规则。

import React, {
  useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import {
  Flag, Trophy, MessageCircle, Users, PiggyBank, Wallet, Zap, Flame,
  Heart, Gem, Map as MapIcon, ChevronsRight, ChevronsLeft, Pause, Layers,
} from 'lucide-react';

import { TILE_TYPE_LABELS, TILE_TONES } from './flightChessBoardData';
import {
  PLAYER_COLORS, PLAYER_GLOWS, TOKEN_KINDS, TokenIcon, FxBurst,
} from './FlightChessTokens';

const TILE_ICONS = {
  start: Flag,
  end: Trophy,
  truth: MessageCircle,
  task: Users,
  deposit: PiggyBank,
  withdraw: Wallet,
  punish: Zap,
  passion: Flame,
  intimacy: Heart,
  commit: Gem,
  map: MapIcon,
  forward: ChevronsRight,
  back: ChevronsLeft,
  skip: Pause,
  draw: Layers,
  event: Layers,
  question: Layers,
};

// 每种色调对应的格子强调色（格子内侧的色条和侧壁）
const TONE_ACCENTS = {
  rose: '#f4a6b5',
  blue: '#8fb8ea',
  mint: '#8fd0a4',
  gold: '#f1cf6a',
  violet: '#b9a6e3',
  gray: '#b8b0a0',
};

const FOLLOW_SCALE = 1.7;
const FOLLOW_SCALE_WITH_SHEET = 1.45;

const tileBadge = (tile) => {
  if (tile.type === 'forward' || tile.type === 'back') {
    return `${tile.type === 'forward' ? '+' : '-'}${tile.steps || 2}`;
  }
  return '';
};

/** 方形环的边长（格数）：4 * (边长 - 1) >= 格子总数。内置 48 格正好是 13。 */
const getRingSize = (count) => {
  let size = 3;
  while (4 * (size - 1) < count) size += 1;
  return size;
};

/**
 * 第 index 格在环上的位置（网格行列从 1 开始）：
 * 左下角起点 -> 沿左边向上 -> 左上角 -> 沿上边向右 -> 右上角
 * -> 沿右边向下 -> 右下角 -> 沿下边向左，回到起点旁边。
 */
const getRingCell = (index, size) => {
  const last = size - 1;
  if (index === 0) return { row: size, col: 1, side: 'corner' };
  if (index < last) return { row: size - index, col: 1, side: 'left' };
  if (index === last) return { row: 1, col: 1, side: 'corner' };
  if (index < 2 * last) return { row: 1, col: index - last + 1, side: 'top' };
  if (index === 2 * last) return { row: 1, col: size, side: 'corner' };
  if (index < 3 * last) return { row: index - 2 * last + 1, col: size, side: 'right' };
  if (index === 3 * last) return { row: size, col: size, side: 'corner' };
  return { row: size, col: size - (index - 3 * last), side: 'bottom' };
};

// 色条画在格子朝向庭院的一侧：左边那列的色条在右侧，依此类推
const SIDE_CLASS = {
  left: 'is-side-left',
  right: 'is-side-right',
  top: 'is-side-top',
  bottom: 'is-side-bottom',
  corner: 'is-corner',
};

const FlightChessBoard3D = ({
  tiles,
  players,
  activeIndex,
  motion,
  tileFx,
  onTokenTap,
  playerNames,
  cameraMode = 'follow',
  sheetOpen = false,
}) => {
  const viewRef = useRef(null);
  const worldRef = useRef(null);
  const boardRef = useRef(null);
  const tileRefs = useRef({});
  const [ripples, setRipples] = useState([]);
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });

  const ringSize = getRingSize(tiles.length);
  const lastStep = ringSize - 1;
  const cornerIndexes = [0, lastStep, 2 * lastStep, 3 * lastStep];
  const trackSizes = `110px repeat(${Math.max(ringSize - 2, 0)}, 60px) 110px`;

  /* ------------------------------ 镜头 ------------------------------ */

  useEffect(() => {
    const el = viewRef.current;
    if (!el) return undefined;
    const update = () => setViewSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update);
      observer.observe(el);
    } else {
      window.addEventListener('resize', update);
    }
    return () => {
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', update);
    };
  }, []);

  const followIndex = players[activeIndex]?.position ?? 0;
  const isHopping = Boolean(motion && motion.mode === 'hop');

  useLayoutEffect(() => {
    const world = worldRef.current;
    const board = boardRef.current;
    const tileEl = tileRefs.current[followIndex];
    if (!world || !board || !viewSize.w || !viewSize.h) return;

    const boardW = board.offsetWidth;
    const boardH = board.offsetHeight;
    let scale;
    let anchorX = viewSize.w / 2;
    let anchorY;
    let focusX;
    let focusY;

    if (cameraMode === 'overview' || !tileEl) {
      scale = Math.min((viewSize.w - 16) / boardW, (viewSize.h - 250) / (boardH * 0.72));
      scale = Math.max(scale, 0.2);
      focusX = boardW / 2;
      focusY = boardH / 2;
      anchorY = viewSize.h * 0.5;
    } else {
      scale = sheetOpen ? FOLLOW_SCALE_WITH_SHEET : FOLLOW_SCALE;
      focusX = tileEl.offsetLeft + tileEl.offsetWidth / 2;
      focusY = tileEl.offsetTop + tileEl.offsetHeight / 2;
      anchorY = viewSize.h * (sheetOpen ? 0.3 : 0.6);
    }

    world.style.transitionDuration = isHopping ? '0.3s' : '0.8s';
    world.style.transform = `translate(${anchorX}px, ${anchorY}px) rotateX(var(--fc-tilt)) scale(${scale}) translate(${-focusX}px, ${-focusY}px)`;
  }, [viewSize, followIndex, cameraMode, sheetOpen, isHopping, tiles.length]);

  /* ------------------------------ 落点特效 ------------------------------ */

  // 格子被踩到：整块格子被按下再弹起（Web Animations API，可随时重播），
  // 同时在格子平面上荡开一圈光环。
  useEffect(() => {
    if (!tileFx) return undefined;
    const el = tileRefs.current[tileFx.tileIndex];
    const isLand = tileFx.mode === 'land';
    const base = cornerIndexes.includes(tileFx.tileIndex) ? 16 : 7;

    if (el && el.animate && tileFx.mode !== 'tap') {
      el.animate(
        isLand
          ? [
            { transform: `translateZ(${base}px)` },
            { transform: `translateZ(${base + 26}px)`, offset: 0.3 },
            { transform: `translateZ(${base - 2}px)`, offset: 0.6 },
            { transform: `translateZ(${base}px)` },
          ]
          : [
            { transform: `translateZ(${base}px)` },
            { transform: `translateZ(${base + 8}px)`, offset: 0.4 },
            { transform: `translateZ(${base}px)` },
          ],
        { duration: isLand ? 750 : 320, easing: 'ease-out' }
      );
    }

    const id = `${tileFx.nonce}-${tileFx.tileIndex}`;
    setRipples((prev) => [
      ...prev.slice(-4),
      { id, tileIndex: tileFx.tileIndex, color: PLAYER_COLORS[tileFx.playerIndex % 4] },
    ]);
    const timer = setTimeout(() => {
      setRipples((prev) => prev.filter((ripple) => ripple.id !== id));
    }, 1050);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileFx]);

  const currentTilePositions = new Set(
    players.filter((_, i) => i === activeIndex).map((p) => p.position)
  );

  const activeColor = PLAYER_COLORS[activeIndex % 4];
  const activeGlow = PLAYER_GLOWS[activeIndex % 4];

  const hangarSlots = ['bl', 'tr', 'tl', 'br'];

  return (
    <div
      className="fc-camera"
      ref={viewRef}
      style={{ '--fc-active': activeColor, '--fc-active-glow': activeGlow }}
    >
      <div className="fc-world" ref={worldRef}>
        <div
          className="fc-board"
          ref={boardRef}
          style={{ gridTemplateColumns: trackSizes, gridTemplateRows: trackSizes }}
        >
          {tiles.map((tile, index) => {
            const { row, col, side } = getRingCell(index, ringSize);
            const Icon = TILE_ICONS[tile.type] || Layers;
            const tone = TILE_TONES[tile.type] || 'gray';
            const occupants = players
              .map((player, playerIndex) => ({ player, playerIndex }))
              .filter(({ player }) => player.position === index);
            const badge = tileBadge(tile);
            const showBurst = tileFx
              && tileFx.tileIndex === index
              && (tileFx.mode === 'land' || tileFx.mode === 'tap');

            return (
              <div
                key={index}
                ref={(el) => { tileRefs.current[index] = el; }}
                className={`fc-tile ${SIDE_CLASS[side]}${tile.type === 'end' ? ' is-end' : ''}${currentTilePositions.has(index) ? ' is-current' : ''}`}
                style={{
                  gridRow: row,
                  gridColumn: col,
                  '--tile-accent': TONE_ACCENTS[tone] || TONE_ACCENTS.gray,
                }}
              >
                <i className="fc-tile-stripe" />
                <span className="fc-tile-num">{index + 1}</span>
                {badge && <span className="fc-tile-badge">{badge}</span>}
                <Icon />
                <span className="fc-tile-label">{TILE_TYPE_LABELS[tile.type]}</span>

                {ripples
                  .filter((ripple) => ripple.tileIndex === index)
                  .map((ripple) => (
                    <span
                      key={ripple.id}
                      className="fc-ripple"
                      style={{ '--fx-color': ripple.color }}
                    />
                  ))}

                {occupants.length > 0 && (
                  <div className="fc-tokens">
                    {occupants.map(({ playerIndex }, slot) => {
                      const kind = TOKEN_KINDS[playerIndex % 4];
                      const offset = (slot - (occupants.length - 1) / 2) * 15;
                      const motionHere = motion && motion.playerIndex === playerIndex ? motion : null;
                      return (
                        <div
                          key={playerIndex}
                          className={`fc-token${playerIndex === activeIndex ? ' is-active' : ''}`}
                          style={{
                            '--ox': `${offset}px`,
                            '--tk-color': PLAYER_COLORS[playerIndex % 4],
                            '--tk-glow': PLAYER_GLOWS[playerIndex % 4],
                          }}
                        >
                          <span className="fc-token-shadow" />
                          <div
                            className="fc-token-stand"
                            role="button"
                            aria-label={`${playerNames[playerIndex] || '棋子'}的棋子`}
                            onClick={() => onTokenTap?.(playerIndex)}
                          >
                            <div
                              key={motionHere ? motionHere.nonce : 'rest'}
                              className={`fc-token-body fc-token-motion${motionHere ? ` ${motionHere.mode}` : ''}`}
                            >
                              <div className="fc-token-head"><TokenIcon kind={kind} /></div>
                              <div className="fc-token-neck" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {showBurst && (
                  <FxBurst
                    kind={TOKEN_KINDS[tileFx.playerIndex % 4]}
                    color={PLAYER_COLORS[tileFx.playerIndex % 4]}
                    big={tileFx.mode === 'land'}
                    nonce={tileFx.nonce}
                  />
                )}
              </div>
            );
          })}

          {/* 中央庭院：每位玩家一个机库、两摞牌堆、中央塔台 */}
          <div className="fc-courtyard" style={{ gridArea: `2 / 2 / ${ringSize} / ${ringSize}` }}>
            {players.slice(0, 4).map((player, index) => (
              <div
                key={index}
                className={`fc-hangar is-${hangarSlots[index]}`}
                style={{ '--hangar-color': PLAYER_COLORS[index % 4] }}
              >
                <i /><i /><i /><i />
                <b>{playerNames[index]}的机库</b>
              </div>
            ))}
            <div className="fc-deck is-left"><i /><i /><i /><i /><span>提问卡</span></div>
            <div className="fc-deck is-right"><i /><i /><i /><i /><span>事件卡</span></div>
            <div className="fc-tower">
              <span className="fc-tower-disc is-1" />
              <span className="fc-tower-disc is-2" />
              <span className="fc-tower-disc is-3" />
              <div className="fc-tower-jet">
                <div className="fc-tower-jet-stand"><TokenIcon kind="plane" /></div>
              </div>
            </div>
          </div>

          <div className="fc-clouds"><i /><i /><i /></div>
        </div>
      </div>
    </div>
  );
};

export default FlightChessBoard3D;