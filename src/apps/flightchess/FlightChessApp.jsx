// src/apps/flightchess/FlightChessApp.jsx
//
// 飞行棋子应用入口：大厅（对局列表） -> 建局向导 -> 对局房间。
//   - 大厅界面在 FlightChessLobby.jsx，建局向导在 FlightChessWizard.jsx，
//     这里只管数据加载、页面切换和删除确认；
//   - 一次只能开一局：还有没结束的对局时，大厅不提供「新建」入口，
//     这里也再挡一道（onNew 里再查一次）。

import React, { useCallback, useEffect, useState } from 'react';

import db from '../../db';
import ConfirmModal from '../../components/ConfirmModal';
import { getAllSessions, deleteSession, getAllBoards } from './flightChessService';
import FlightChessRoom from './FlightChessRoom';
import FlightChessLobby from './FlightChessLobby';
import FlightChessWizard from './FlightChessWizard';
import FlightChessDeckManager from './FlightChessDeckManager';

const FlightChessApp = ({ onBackHub, onChatRoomStateChange }) => {
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [charactersById, setCharactersById] = useState({});
  const [boardsById, setBoardsById] = useState({});
  const [showWizard, setShowWizard] = useState(false);
  const [showDeckManager, setShowDeckManager] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const loadSessions = useCallback(async () => {
    const [list, chars, boards] = await Promise.all([
      getAllSessions(),
      db.characters.toArray(),
      getAllBoards(),
    ]);
    setSessions(list);
    setCharactersById(Object.fromEntries(chars.map((c) => [c.id, c])));
    setBoardsById(Object.fromEntries(boards.map((b) => [b.id, b])));
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // 大厅和向导都是全屏的，进入时隐藏底部导航（房间自己也会这么做）
  useEffect(() => {
    if (activeSessionId) return undefined;
    onChatRoomStateChange?.(true);
    return () => onChatRoomStateChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  const handleNew = () => {
    if (sessions.some((item) => item.status !== 'finished')) return;
    setShowWizard(true);
  };

  const handleCreated = async (newId) => {
    setShowWizard(false);
    await loadSessions();
    setActiveSessionId(newId);
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    await deleteSession(deleteTargetId);
    setDeleteTargetId(null);
    loadSessions();
  };

  if (activeSessionId) {
    return (
      <FlightChessRoom
        sessionId={activeSessionId}
        onBack={() => {
          setActiveSessionId(null);
          loadSessions();
        }}
        onChatRoomStateChange={onChatRoomStateChange}
      />
    );
  }

  return (
    <>
      <FlightChessLobby
        sessions={sessions}
        charactersById={charactersById}
        boardsById={boardsById}
        onBackHub={onBackHub}
        onOpen={setActiveSessionId}
        onNew={handleNew}
        onDelete={setDeleteTargetId}
        onOpenDecks={() => setShowDeckManager(true)}
      />

      {showWizard && (
        <FlightChessWizard
          onCancel={() => setShowWizard(false)}
          onCreated={handleCreated}
        />
      )}

      {showDeckManager && (
        <FlightChessDeckManager onBack={() => setShowDeckManager(false)} />
      )}

      {deleteTargetId && (
        <ConfirmModal
          isOpen={Boolean(deleteTargetId)}
          title="删除对局"
          message="确定删除这一局飞行棋吗？"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}
    </>
  );
};

export default FlightChessApp;