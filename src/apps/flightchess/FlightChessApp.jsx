// src/apps/flightchess/FlightChessApp.jsx
//
// 飞行棋（事件卡骰子棋）子应用切片A：对局列表 + 建局向导。
// 整体结构参照 src/apps/bubble/BubbleApp.jsx（列表+建房弹窗），但建局
// 向导要分三步：① 选一个「主聊天框」（决定默认反应声音+终局总结发
// 去哪个聊天）② 从角色库再多选最多2个角色一起玩 ③ 选一张已有棋盘，
// 或者粘贴/上传一份JSON导入新棋盘。
//
// 这一切片点进对局只会看到 FlightChessRoom.jsx 的空壳（棋盘走向+
// 玩家列表能看到，但骰子是禁用的占位——真正能玩是 Slice B 的范围）。
// 列表的删除按钮直接做成常亮半透明（opacity-45 hover:opacity-100），
// 不用 opacity-0 group-hover 那种只有鼠标悬停才可见的写法——那个在
// 触屏设备上根本点不到，是这个项目里已知要避免的反模式。

import React, { useEffect, useState } from 'react';
import {
  Dices, Plus, ArrowLeft, Trash2, ChevronRight, ChevronLeft, Upload,
} from 'lucide-react';

import db from '../../db';
import ConfirmModal from '../../components/ConfirmModal';
import {
  getAllSessions,
  createSession,
  deleteSession,
  getAllBoards,
  importBoardFromJson,
  MAX_EXTRA_CHARACTERS,
} from './flightChessService';
import FlightChessRoom from './FlightChessRoom';

const FlightChessApp = ({ onBackHub, onChatRoomStateChange }) => {
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [charactersById, setCharactersById] = useState({});
  const [boardsById, setBoardsById] = useState({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  // 建局向导
  const [wizardStep, setWizardStep] = useState(1);
  const [allChats, setAllChats] = useState([]);
  const [allCharacters, setAllCharacters] = useState([]);
  const [allBoards, setAllBoards] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [selectedExtraIds, setSelectedExtraIds] = useState([]);
  const [selectedBoardId, setSelectedBoardId] = useState(null);
  const [title, setTitle] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    const [list, chars, boards] = await Promise.all([
      getAllSessions(),
      db.characters.toArray(),
      getAllBoards(),
    ]);
    setSessions(list);
    setCharactersById(Object.fromEntries(chars.map((c) => [c.id, c])));
    setBoardsById(Object.fromEntries(boards.map((b) => [b.id, b])));
  };

  const selectedChat = allChats.find((c) => c.id === selectedChatId) || null;
  const mainCharacterId = selectedChat ? selectedChat.characterId : null;

  const handleOpenCreate = async () => {
    const [chats, chars, boards] = await Promise.all([
      db.chats.toArray(),
      db.characters.toArray(),
      getAllBoards(),
    ]);
    setAllChats(chats);
    setAllCharacters(chars);
    setAllBoards(boards);
    setWizardStep(1);
    setSelectedChatId(null);
    setSelectedExtraIds([]);
    setSelectedBoardId(boards[0]?.id ?? null);
    setTitle('');
    setImportText('');
    setImportError('');
    setShowCreateModal(true);
  };

  const handleToggleExtraCharacter = (characterId) => {
    setSelectedExtraIds((prev) => {
      if (prev.includes(characterId)) {
        return prev.filter((id) => id !== characterId);
      }
      if (prev.length >= MAX_EXTRA_CHARACTERS) {
        return prev;
      }
      return [...prev, characterId];
    });
  };

  const handleImportBoard = async () => {
    if (!importText.trim()) return;
    const result = await importBoardFromJson(importText);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    setImportError('');
    setImportText('');
    const boards = await getAllBoards();
    setAllBoards(boards);
    setSelectedBoardId(result.boardId);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportText(text);
    e.target.value = '';
  };

  const handleCreate = async () => {
    if (!selectedChatId || !mainCharacterId || !selectedBoardId) return;

    const newId = await createSession({
      mainChatId: selectedChatId,
      mainCharacterId,
      extraCharacterIds: selectedExtraIds,
      boardId: selectedBoardId,
      title: title.trim(),
    });

    if (!newId) return;

    setShowCreateModal(false);
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

  const canGoNextFromStep1 = Boolean(selectedChatId);
  const canCreate = Boolean(selectedChatId && selectedBoardId);

  return (
    <div className="space-y-4 animate-fade-in pb-12">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBackHub}
          className="flex items-center gap-1 text-xs font-semibold opacity-70 hover:opacity-100"
          style={{ color: 'var(--text-main)' }}
        >
          <ArrowLeft className="w-4 h-4" /> 返回主页
        </button>
        <h2
          className="text-xs font-bold tracking-widest uppercase"
          style={{ color: 'var(--text-main)' }}
        >
          飞行棋
        </h2>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-foreground)' }}
        >
          <Plus className="w-3.5 h-3.5" /> 新建一局
        </button>
      </div>

      {sessions.length === 0 ? (
        <div
          className="py-16 text-center rounded-3xl border opacity-60"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
        >
          <Dices className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-xs">还没有开局，点击右上角新建一局</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {sessions.map((session) => {
            const mainCharacter = charactersById[session.mainCharacterId];
            const board = boardsById[session.boardId];
            const extraCount = (session.extraCharacterIds || []).length;
            return (
              <div
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className="p-4 rounded-3xl border transition-all cursor-pointer relative group shadow-sm"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  borderColor: 'var(--card-border)',
                  color: 'var(--text-main)',
                }}
              >
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-sm">{session.title}</h3>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTargetId(session.id);
                    }}
                    className="opacity-45 hover:opacity-100 active:opacity-100 text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs opacity-60 mt-1">
                  {mainCharacter?.name || '未知角色'}
                  {extraCount > 0 ? ` 等${extraCount + 1}位角色` : ''}
                  {board ? ` · ${board.title}` : ''}
                </p>
                <p className="text-[10px] opacity-40 mt-0.5">
                  {{ setup: '待写提问卡', active: '进行中', finished: '已结束' }[session.status] || session.status}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div
            className="w-full max-w-xs rounded-3xl p-5 space-y-3 shadow-2xl max-h-[85vh] overflow-y-auto"
            style={{
              backgroundColor: 'var(--modal-bg)',
              border: '1px solid var(--modal-border)',
              color: 'var(--text-main)',
            }}
          >
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--divider)' }}>
              <h3 className="text-xs font-semibold">
                新建一局飞行棋 · {wizardStep}/3
              </h3>
            </div>

            {wizardStep === 1 && (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="这局棋起个名字（可不填）..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-2 rounded-xl text-xs border outline-none"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--card-border)' }}
                />
                <span className="block opacity-60 text-[11px]">选一个主聊天框（对手+终局总结会发到这里）：</span>
                {allChats.length === 0 ? (
                  <p className="text-[11px] opacity-50 py-2">还没有聊天记录，先去跟一个角色聊起来吧。</p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {allChats.map((chat) => {
                      const character = allCharacters.find((c) => c.id === chat.characterId);
                      const checked = selectedChatId === chat.id;
                      return (
                        <label
                          key={chat.id}
                          className="flex items-center justify-between p-2 rounded-xl border text-xs"
                          style={{
                            backgroundColor: checked ? 'var(--accent-color)' : 'var(--bg-surface)',
                            borderColor: 'var(--card-border)',
                            color: checked ? 'var(--accent-foreground)' : 'var(--text-main)',
                          }}
                        >
                          <span className="truncate">
                            {chat.title || character?.name || '未命名聊天'}
                          </span>
                          <input
                            type="radio"
                            name="main-chat"
                            checked={checked}
                            onChange={() => setSelectedChatId(chat.id)}
                            className="accent-current w-4 h-4"
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-1.5">
                <span className="block opacity-60 text-[11px]">
                  再从角色库多选几位一起玩（最多 {MAX_EXTRA_CHARACTERS} 位，已选 {selectedExtraIds.length}，可不选）：
                </span>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {allCharacters.filter((c) => c.id !== mainCharacterId).map((c) => {
                    const checked = selectedExtraIds.includes(c.id);
                    const disabled = !checked && selectedExtraIds.length >= MAX_EXTRA_CHARACTERS;
                    return (
                      <label
                        key={c.id}
                        className="flex items-center justify-between p-2 rounded-xl border text-xs"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--card-border)',
                          opacity: disabled ? 0.4 : 1,
                        }}
                      >
                        <span className="truncate">{c.name}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => handleToggleExtraCharacter(c.id)}
                          className="accent-current w-4 h-4"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-2">
                <span className="block opacity-60 text-[11px]">选一张棋盘：</span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {allBoards.map((board) => {
                    const checked = selectedBoardId === board.id;
                    return (
                      <label
                        key={board.id}
                        className="flex items-center justify-between p-2 rounded-xl border text-xs"
                        style={{
                          backgroundColor: checked ? 'var(--accent-color)' : 'var(--bg-surface)',
                          borderColor: 'var(--card-border)',
                          color: checked ? 'var(--accent-foreground)' : 'var(--text-main)',
                        }}
                      >
                        <span className="truncate">
                          {board.title}{board.isBuiltin ? '（内置示例）' : ''} · {board.tiles.length}格
                        </span>
                        <input
                          type="radio"
                          name="board"
                          checked={checked}
                          onChange={() => setSelectedBoardId(board.id)}
                          className="accent-current w-4 h-4"
                        />
                      </label>
                    );
                  })}
                </div>

                <div className="pt-2 border-t space-y-1.5" style={{ borderColor: 'var(--divider)' }}>
                  <span className="block opacity-60 text-[11px]">或者导入一份新棋盘（纯JSON）：</span>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder='{"title":"...", "tiles":[{"type":"start"},{"type":"event"},{"type":"end"}]}'
                    rows={3}
                    className="w-full p-2 rounded-xl text-[11px] border outline-none font-mono"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--card-border)' }}
                  />
                  {importError && (
                    <p className="text-[11px] text-red-500">{importError}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <label
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] cursor-pointer border"
                      style={{ borderColor: 'var(--card-border)' }}
                    >
                      <Upload className="w-3 h-3" /> 选择文件
                      <input type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />
                    </label>
                    <button
                      type="button"
                      onClick={handleImportBoard}
                      disabled={!importText.trim()}
                      className="px-3 py-1 rounded-full text-[11px] font-semibold disabled:opacity-40"
                      style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-foreground)' }}
                    >
                      导入
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (wizardStep === 1) {
                    setShowCreateModal(false);
                  } else {
                    setWizardStep((s) => s - 1);
                  }
                }}
                className="flex items-center gap-1 px-3 py-1 text-xs opacity-60"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                {wizardStep === 1 ? '取消' : '上一步'}
              </button>

              {wizardStep < 3 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep((s) => s + 1)}
                  disabled={wizardStep === 1 && !canGoNextFromStep1}
                  className="flex items-center gap-1 px-4 py-1 rounded-xl text-xs font-semibold disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-foreground)' }}
                >
                  下一步 <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!canCreate}
                  className="px-4 py-1 rounded-xl text-xs font-semibold disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-foreground)' }}
                >
                  创建
                </button>
              )}
            </div>
          </div>
        </div>
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
    </div>
  );
};

export default FlightChessApp;