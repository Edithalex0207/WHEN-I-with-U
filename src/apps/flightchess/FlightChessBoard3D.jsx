// src/apps/flightchess/FlightChessBoard3D.jsx
//
// 3D 倾斜棋盘：格子按「蛇形」排成网格，整块棋盘用 CSS perspective +
// rotateX 压成斜俯视，格子靠 box-shadow 做出厚度；棋子站在格子上（反向
// 倾斜站直），每一步落下有弹跳，最终落点有果冻挤压 + 地面光环 + 玩家专属
// 特效，点击棋子也会播特效。本组件只负责「画」，不含任何游戏规则。

import React, { useEffect, useRef, useState } from 'react';
import {
  Flag, Trophy, MessageCircle, Users, PiggyBank, Wallet, Zap, Flame,
  Heart, Gem, Map as MapIcon, ChevronsRight, ChevronsLeft, Pause, Layers,
} from 'lucide-react';

import {
  TILE_TYPE_LABELS, TILE_TONES, layoutSerpentine,
} from './flightChessBoardData';
import {
  PLAYER_COLORS, PLAYER_GLOWS, TOKEN_KINDS, TokenIcon, FxBurst,
} from './FlightChessTokens';

const COLUMNS = 6;

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

const tileBadge = (tile) => {
  if (tile.type === 'forward' || tile.type === 'back') {
    return `${tile.type === 'forward' ? '+' : '-'}${tile.steps || 2}`;
  }
  return '';
};

const FlightChessBoard3D = ({
  tiles,
  players,
  activeIndex,
  motion,
  tileFx,
  focus,
  onTokenTap,
  playerNames,
}) => {
  const tileRefs = useRef({});
  const [ripples, setRipples] = useState([]);

  const layout = layoutSerpentine(tiles.length, COLUMNS);
  const rows = Math.ceil(tiles.length / COLUMNS);

  // 格子被踩到：整块格子像被按下去再弹回来（Web Animations API，可以随时重播），
  // 同时在格子平面上荡开一圈光环。
  useEffect(() => {
    if (!tileFx) return undefined;
    const el = tileRefs.current[tileFx.tileIndex];
    const isLand = tileFx.mode === 'land';

    if (el && el.animate && tileFx.mode !== 'tap') {
      el.animate(
        isLand
          ? [
            { transform: 'translateY(0) scale(1)' },
            { transform: 'translateY(5px) scale(0.92)', offset: 0.25 },
            { transform: 'translateY(-2px) scale(1.08)', offset: 0.55 },
            { transform: 'translateY(1px) scale(0.98)', offset: 0.78 },
            { transform: 'translateY(0) scale(1)' },
          ]
          : [
            { transform: 'translateY(0) scale(1)' },
            { transform: 'translateY(3px) scale(0.96)', offset: 0.35 },
            { transform: 'translateY(0) scale(1)' },
          ],
        { duration: isLand ? 650 : 320, easing: 'ease-out' }
      );
    }

    const id = `${tileFx.nonce}-${tileFx.tileIndex}`;
    setRipples((prev) => [
      ...prev.slice(-4),
      { id, tileIndex: tileFx.tileIndex, color: PLAYER_COLORS[tileFx.playerIndex % 4] },
    ]);
    const timer = setTimeout(() => {
      setRipples((prev) => prev.filter((ripple) => ripple.id !== id));
    }, 950);
    return () => clearTimeout(timer);
  }, [tileFx]);

  // 镜头跟随：把当前格子滚到视野中间
  useEffect(() => {
    if (!focus) return;
    const el = tileRefs.current[focus.index];
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [focus]);

  const currentTilePositions = new Set(
    players.filter((_, i) => i === activeIndex).map((p) => p.position)
  );

  const activeColor = PLAYER_COLORS[activeIndex % 4];
  const activeGlow = PLAYER_GLOWS[activeIndex % 4];

  return (
    <div
      className="fc-stage"
      style={{
        '--cols': COLUMNS,
        '--rows': rows,
        '--fc-active': activeColor,
        '--fc-active-glow': activeGlow,
        aspectRatio: `${COLUMNS} / ${rows * 0.8}`,
      }}
    >
      <div className="fc-board">
        {tiles.map((tile, index) => {
          const { row, col } = layout[index];
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
              className={`fc-tile tone-${tone}${tile.type === 'end' ? ' is-end' : ''}${currentTilePositions.has(index) ? ' is-current' : ''}`}
              style={{ gridRow: row + 1, gridColumn: col + 1 }}
            >
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
      </div>
    </div>
  );
};

export default FlightChessBoard3D;