// src/apps/flightchess/FlightChessLobby.jsx
//
// 飞行棋大厅：漂浮的立体棋盘岛 + 进行中的对局卡 + 往期航程。
// 一次只能开一局：有没结束的对局时不显示「新建」，只显示「回到棋局」。
// 只负责显示，所有数据和动作由 FlightChessApp 通过 props 传进来。

import React from 'react';
import { ArrowLeft, ChevronRight, Lock, Plane, Trash2 } from 'lucide-react';

import { PLAYER_COLORS } from './FlightChessTokens';
import {
  CharAvatar, IsoBoard, LobbySky, firstChar,
} from './FlightChessLobbyBits';
import './flightChessLobby.css';

const HERO_TOKENS = [0, 12, 24, 36].map((index, i) => ({ index, color: PLAYER_COLORS[i] }));

const formatDate = (timestamp) => {
  const date = new Date(timestamp || Date.now());
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
};

const FlightChessLobby = ({
  sessions,
  charactersById,
  boardsById,
  onBackHub,
  onOpen,
  onNew,
  onDelete,
}) => {
  const unfinished = sessions.filter((s) => s.status !== 'finished');
  const finished = sessions.filter((s) => s.status === 'finished');

  const nameOfPlayer = (player) => (
    player.type === 'user' ? '你' : charactersById[player.characterId]?.name || '角色'
  );

  return (
    <div className="fcl-root">
      <LobbySky />

      <div className="fcl-screen">
        <div className="fcl-topbar">
          <button type="button" className="fcl-iconbtn" onClick={onBackHub} aria-label="返回主页">
            <ArrowLeft />
          </button>
          <span className="fcl-eyebrow">Flight Chess</span>
          <span className="fcl-spacer" />
        </div>

        <h1 className="fcl-title">飞行棋</h1>

        <div className="fcl-hero">
          <span className="fcl-cloud" style={{ left: '2%', top: 34, width: 84 }} />
          <span className="fcl-cloud" style={{ right: 0, top: 116, width: 64, animationDelay: '-8s' }} />
          <IsoBoard className="fcl-iso" tw={24} depth={7} tokens={HERO_TOKENS} plane />
        </div>

        {unfinished.map((session) => {
          const board = boardsById[session.boardId];
          const total = board?.tiles?.length || 0;
          const userPlayer = session.players.find((p) => p.type === 'user');
          const position = userPlayer ? userPlayer.position : 0;
          const percent = total > 1 ? Math.min(100, Math.round((position / (total - 1)) * 100)) : 0;
          const isSetup = session.status === 'setup';
          return (
            <div className="fcl-glass fcl-active" key={session.id}>
              <div className="fcl-row between">
                <div className="fcl-grow">
                  <div className="fcl-eyebrow">{isSetup ? '准备中' : '进行中'}</div>
                  <h3 className="fcl-card-title">{session.title}</h3>
                </div>
                <span className={`fcl-pill${isSetup ? ' warn' : ''}`}>
                  {isSetup ? '待写提问卡' : `第 ${(session.turnCount || 0) + 1} 回合`}
                </span>
              </div>

              <div className="fcl-row between">
                <div className="fcl-seats">
                  {session.players.map((player, index) => (
                    <span
                      key={index}
                      className="fcl-seat"
                      style={{ '--c': PLAYER_COLORS[index % 4] }}
                    >
                      {player.type === 'user' ? '你' : firstChar(nameOfPlayer(player))}
                    </span>
                  ))}
                </div>
                {!isSetup && total > 0 && (
                  <div className="fcl-sub right">第 {position + 1} / {total} 格</div>
                )}
              </div>

              {!isSetup && <div className="fcl-progress"><i style={{ width: `${percent}%` }} /></div>}

              <div className="fcl-row between">
                <span className="fcl-sub">
                  {board ? `${board.title} · ${total} 格` : '棋盘已被删除'}
                </span>
                <div className="fcl-row">
                  <button
                    type="button"
                    className="fcl-iconbtn small"
                    onClick={() => onDelete(session.id)}
                    aria-label="删除这一局"
                  >
                    <Trash2 />
                  </button>
                  <button type="button" className="fcl-btn small" onClick={() => onOpen(session.id)}>
                    {isSetup ? '继续准备' : '回到棋局'} <ChevronRight />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {unfinished.length > 0 ? (
          <div className="fcl-lock-note">
            <Lock /> 一次只能开一局，玩完或删除这一局后才能新建
          </div>
        ) : (
          <div className="fcl-cta">
            <p className="fcl-sub center">
              选一位角色，挑一张棋盘，<br />和 TA 开始一局新的飞行棋。
            </p>
            <button type="button" className="fcl-btn" onClick={onNew}>
              <Plane /> 起飞新的一局
            </button>
          </div>
        )}

        {finished.length > 0 && (
          <>
            <div className="fcl-section-label"><span className="fcl-eyebrow">往期航程</span></div>
            <div className="fcl-history">
              {finished.map((session) => {
                const winner = session.players[session.winnerPlayerIndex];
                const board = boardsById[session.boardId];
                const mainCharacter = charactersById[session.mainCharacterId];
                return (
                  <div className="fcl-glass fcl-hist" key={session.id}>
                    <div className="fcl-row between">
                      <b className="fcl-grow">{session.title}</b>
                      <button
                        type="button"
                        className="fcl-iconbtn tiny"
                        onClick={() => onDelete(session.id)}
                        aria-label="删除这一局"
                      >
                        <Trash2 />
                      </button>
                    </div>
                    <small>{winner ? `${nameOfPlayer(winner)} 先到终点` : '已结束'}</small>
                    <div className="fcl-row between">
                      <span className="fcl-pill mute">{formatDate(session.updatedAt)}</span>
                      {mainCharacter && (
                        <CharAvatar character={mainCharacter} className="fcl-mini-avatar" />
                      )}
                    </div>
                    {board && <small className="fcl-faint">{board.title}</small>}
                    <button
                      type="button"
                      className="fcl-link"
                      onClick={() => onOpen(session.id)}
                    >
                      查看结算
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FlightChessLobby;