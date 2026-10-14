// src/apps/flightchess/FlightChessWizard.jsx
//
// 建局向导（4 步）：① 选主搭档（主聊天框） ② 选同伴（最多 MAX_EXTRA_CHARACTERS 位）
// ③ 选棋盘（或导入新棋盘） ④ 起名字、开关掷骰反应、确认起飞。
// 自己从 Dexie 读聊天/角色/棋盘，创建对局后通过 onCreated(newId) 通知父组件。
// 「掷骰反应」开关存在对局上的 rollReactions 字段（不存在时按开启处理）。

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ArrowLeft, Check, ChevronRight, Plane, Plus, Upload,
} from 'lucide-react';

import db from '../../db';
import {
  createSession,
  updateSession,
  getAllBoards,
  importBoardFromJson,
  MAX_EXTRA_CHARACTERS,
} from './flightChessService';
import { PLAYER_COLORS } from './FlightChessTokens';
import {
  CharAvatar, IsoBoard, LobbySky, firstChar, toneForIndex,
} from './FlightChessLobbyBits';
import './flightChessLobby.css';

const STEP_COUNT = 4;

const FlightPath = ({ step }) => {
  const percent = ((step - 1) / (STEP_COUNT - 1)) * 100;
  return (
    <div className="fcl-flightpath" aria-hidden="true">
      <div className="track" />
      <div className="done" style={{ width: `${percent}%` }} />
      {Array.from({ length: STEP_COUNT }, (_, i) => (
        <i
          key={i}
          className={`stop${i + 1 <= step ? ' on' : ''}`}
          style={{ left: `${(i / (STEP_COUNT - 1)) * 100}%` }}
        />
      ))}
      <div className="jet" style={{ left: `${percent}%` }}><Plane /></div>
    </div>
  );
};

const FlightChessWizard = ({ onCancel, onCreated }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [boards, setBoards] = useState([]);

  const [selectedChatId, setSelectedChatId] = useState(null);
  const [extraIds, setExtraIds] = useState([]);
  const [boardId, setBoardId] = useState(null);
  const [title, setTitle] = useState('');
  const [rollReactions, setRollReactions] = useState(true);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const deckRef = useRef(null);
  const boardsRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      const [chatList, charList, boardList] = await Promise.all([
        db.chats.toArray(),
        db.characters.toArray(),
        getAllBoards(),
      ]);
      if (!mountedRef.current) return;
      setChats(chatList);
      setCharacters(charList);
      setBoards(boardList);
      setSelectedChatId(chatList[0]?.id ?? null);
      setBoardId(boardList[0]?.id ?? null);
      setLoading(false);
    })();
    return () => { mountedRef.current = false; };
  }, []);

  const charactersById = useMemo(
    () => Object.fromEntries(characters.map((c) => [c.id, c])),
    [characters]
  );
  const selectedChat = chats.find((c) => c.id === selectedChatId) || null;
  const mainCharacterId = selectedChat ? selectedChat.characterId : null;
  const mainCharacter = charactersById[mainCharacterId] || null;
  const selectedBoard = boards.find((b) => b.id === boardId) || null;
  const extraCharacters = extraIds.map((id) => charactersById[id]).filter(Boolean);
  const companionPool = characters.filter((c) => c.id !== mainCharacterId);

  /* ------------------------ 横向卡片：居中的那张就是选中的 ------------------------ */

  const syncDeckFocus = useCallback(() => {
    const deck = deckRef.current;
    if (!deck) return;
    const mid = deck.scrollLeft + deck.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    Array.from(deck.children).forEach((el, index) => {
      const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    });
    const chat = chats[best];
    if (chat && chat.id !== selectedChatId) {
      setSelectedChatId(chat.id);
      setExtraIds((prev) => prev.filter((id) => id !== chat.characterId));
    }
  }, [chats, selectedChatId]);

  const syncBoardFocus = useCallback(() => {
    const row = boardsRef.current;
    if (!row) return;
    const mid = row.scrollLeft + row.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    Array.from(row.children).forEach((el, index) => {
      const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    });
    const board = boards[best];
    if (board && board.id !== boardId) setBoardId(board.id);
  }, [boards, boardId]);

  const centerChild = (container, index, smooth) => {
    const el = container?.children?.[index];
    if (!el) return;
    container.scrollTo({
      left: el.offsetLeft - (container.clientWidth - el.offsetWidth) / 2,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  // 进入步骤时，把已选的卡片滚到中间
  useEffect(() => {
    if (loading) return;
    if (step === 1) {
      const index = chats.findIndex((c) => c.id === selectedChatId);
      requestAnimationFrame(() => centerChild(deckRef.current, Math.max(0, index), false));
    }
    if (step === 3) {
      const index = boards.findIndex((b) => b.id === boardId);
      requestAnimationFrame(() => centerChild(boardsRef.current, Math.max(0, index), false));
    }
    // 只在换步骤时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loading]);

  /* ------------------------ 动作 ------------------------ */

  const toggleExtra = (characterId) => {
    setExtraIds((prev) => {
      if (prev.includes(characterId)) return prev.filter((id) => id !== characterId);
      if (prev.length >= MAX_EXTRA_CHARACTERS) return prev;
      return [...prev, characterId];
    });
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportText(await file.text());
    event.target.value = '';
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    const result = await importBoardFromJson(importText);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    const list = await getAllBoards();
    if (!mountedRef.current) return;
    setBoards(list);
    setBoardId(result.boardId);
    setImportError('');
    setImportText('');
    setImportOpen(false);
    const index = list.findIndex((b) => b.id === result.boardId);
    requestAnimationFrame(() => centerChild(boardsRef.current, Math.max(0, index), true));
  };

  const handleCreate = async () => {
    if (!selectedChatId || !mainCharacterId || !boardId || creating) return;
    setCreating(true);
    setCreateError('');
    const newId = await createSession({
      mainChatId: selectedChatId,
      mainCharacterId,
      extraCharacterIds: extraIds,
      boardId,
      title: title.trim(),
    });
    if (!newId) {
      if (mountedRef.current) {
        setCreating(false);
        setCreateError('创建失败了，再试一次。');
      }
      return;
    }
    await updateSession(newId, { rollReactions });
    onCreated(newId);
  };

  const canNext = step === 1 ? Boolean(selectedChatId) : step === 3 ? Boolean(boardId) : true;

  /* ------------------------ 各步骤 ------------------------ */

  const headings = {
    1: ['谁来当你的主搭档', '对手，以及终局的总结，都会发到和 TA 的聊天框里。'],
    2: ['再带几位同伴上机', '可以不选。同伴会轮流加入棋局，也会随机来和你聊任务。'],
    3: ['挑一张棋盘', '每张棋盘都是一圈赛道，格子里的任务各不相同。'],
    4: ['一切就绪', '确认一下登机名单和棋盘，就可以起飞了。'],
  };

  const renderStep1 = () => {
    if (chats.length === 0) {
      return (
        <div className="fcl-glass fcl-empty">
          还没有聊天记录，先去跟一个角色聊起来吧。
        </div>
      );
    }
    return (
      <>
        <div className="fcl-deck" ref={deckRef} onScroll={syncDeckFocus}>
          {chats.map((chat, index) => {
            const character = charactersById[chat.characterId];
            const tone = toneForIndex(index);
            const on = chat.id === selectedChatId;
            return (
              <button
                key={chat.id}
                type="button"
                className={`fcl-pass${on ? ' on' : ''}`}
                style={{ '--c1': tone.c1, '--c2': tone.c2 }}
                onClick={() => centerChild(deckRef.current, index, true)}
              >
                <span className="art" />
                <CharAvatar character={character} className="avatar" />
                <span className="check"><Check /></span>
                <b>{character?.name || '未知角色'}</b>
                <small>{chat.title || `和${character?.name || 'TA'}的聊天`}</small>
              </button>
            );
          })}
        </div>
        <div className="fcl-dots">
          {chats.map((chat) => <i key={chat.id} className={chat.id === selectedChatId ? 'on' : ''} />)}
        </div>
      </>
    );
  };

  const renderStep2 = () => {
    const seats = [
      { label: '你', text: '你' },
      { label: mainCharacter?.name || '主搭档', text: firstChar(mainCharacter?.name) },
      ...Array.from({ length: MAX_EXTRA_CHARACTERS }, (_, i) => {
        const c = extraCharacters[i];
        return { label: c ? c.name : '空位', text: c ? firstChar(c.name) : '' };
      }),
    ];
    return (
      <>
        <div className="fcl-glass fcl-cabin">
          <div className="fcl-row between">
            <span className="fcl-eyebrow">机舱座位</span>
            <span className="fcl-pill warn">最多 {MAX_EXTRA_CHARACTERS} 位同伴</span>
          </div>
          <div className="fcl-seatrow">
            {seats.map((seat, i) => (
              <div className="fcl-seatcol" key={i}>
                {seat.text ? (
                  <span className="fcl-seat big" style={{ '--c': PLAYER_COLORS[i % 4] }}>{seat.text}</span>
                ) : (
                  <span className="fcl-seat big empty"><Plus /></span>
                )}
                <span>{seat.label}</span>
              </div>
            ))}
          </div>
        </div>
        {companionPool.length === 0 ? (
          <div className="fcl-empty fcl-sub center">角色库里没有别的角色了，直接下一步也可以。</div>
        ) : (
          <div className="fcl-bubbles">
            {companionPool.map((character, index) => {
              const position = extraIds.indexOf(character.id);
              const on = position > -1;
              const off = !on && extraIds.length >= MAX_EXTRA_CHARACTERS;
              const tone = toneForIndex(index + 1);
              return (
                <button
                  key={character.id}
                  type="button"
                  className={`fcl-bub${on ? ' on' : ''}${off ? ' off' : ''}`}
                  style={{
                    '--c1': tone.c1,
                    '--c2': tone.c2,
                    '--sc': PLAYER_COLORS[(on ? position : 0) + 2],
                  }}
                  disabled={off}
                  onClick={() => toggleExtra(character.id)}
                >
                  <span className="orb">
                    <CharAvatar character={character} className="orb-face" />
                    <span className="badge-n">{position + 1}</span>
                  </span>
                  <span className="n">{character.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  };

  const renderStep3 = () => (
    <div className="fcl-boards" ref={boardsRef} onScroll={syncBoardFocus}>
      {boards.map((board, index) => (
        <button
          key={board.id}
          type="button"
          className={`fcl-glass fcl-bcard${board.id === boardId ? ' on' : ''}`}
          onClick={() => centerChild(boardsRef.current, index, true)}
        >
          <div className="model">
            <IsoBoard
              tiles={board.tiles}
              tw={17}
              depth={5}
              stroke={0.6}
              tokens={[{ index: 0, color: PLAYER_COLORS[0] }, { index: Math.floor(board.tiles.length / 2), color: PLAYER_COLORS[1] }]}
            />
          </div>
          <b>{board.title}</b>
          <div className="fcl-row wrap">
            <span className="fcl-pill">{board.tiles.length} 格</span>
            {board.isBuiltin && <span className="fcl-pill mute">内置示例</span>}
          </div>
        </button>
      ))}
      <button type="button" className="fcl-bcard import" onClick={() => setImportOpen(true)}>
        <Upload />
        <b>导入新棋盘</b>
        <span className="fcl-sub center">选一份 JSON 文件，<br />或粘贴棋盘内容</span>
      </button>
    </div>
  );

  const renderStep4 = () => {
    const seatTexts = ['你', firstChar(mainCharacter?.name), ...extraCharacters.map((c) => firstChar(c.name))];
    return (
      <div className="fcl-glass fcl-manifest">
        <div className="fcl-field">
          <label htmlFor="fcl-title">给这一局起个名字</label>
          <input
            id="fcl-title"
            className="fcl-input"
            placeholder="例如：周末的小冒险（可不填）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="fcl-field">
          <label>登机名单</label>
          <div className="fcl-seats">
            {seatTexts.map((text, i) => (
              <span key={i} className="fcl-seat" style={{ '--c': PLAYER_COLORS[i % 4] }}>{text}</span>
            ))}
          </div>
        </div>

        <div className="fcl-field">
          <label>棋盘 · {selectedBoard?.title || ''}</label>
          <div className="fcl-miniboard">
            {selectedBoard && <IsoBoard tiles={selectedBoard.tiles} tw={14} depth={4} stroke={0.5} />}
          </div>
        </div>

        <div className="fcl-switchrow">
          <div className="t">
            <b>掷骰反应</b>
            <small>每次掷骰后，角色会随口说一句话。会多用一次 AI 调用，可以关掉。</small>
          </div>
          <button
            type="button"
            className="fcl-sw"
            role="switch"
            aria-checked={rollReactions}
            aria-label="掷骰反应"
            onClick={() => setRollReactions((v) => !v)}
          />
        </div>

        {createError && <p className="fcl-error">{createError}</p>}
      </div>
    );
  };

  /* ------------------------ 渲染 ------------------------ */

  const [headTitle, headSub] = headings[step];

  return (
    <div className="fcl-root is-wizard">
      <LobbySky />

      <div className="fcl-screen" key={step}>
        <div className="fcl-topbar">
          <button
            type="button"
            className="fcl-iconbtn"
            onClick={() => (step === 1 ? onCancel() : setStep((s) => s - 1))}
            aria-label="返回"
          >
            <ArrowLeft />
          </button>
          <span className="fcl-eyebrow">新的一局 · {step} / {STEP_COUNT}</span>
          <span className="fcl-spacer" />
        </div>

        <FlightPath step={step} />

        <div className="fcl-stephead">
          <h2 className="fcl-title small">{headTitle}</h2>
          <p className="fcl-sub">{headSub}</p>
        </div>

        {loading && <div className="fcl-empty fcl-sub center">正在准备登机口...</div>}
        {!loading && step === 1 && renderStep1()}
        {!loading && step === 2 && renderStep2()}
        {!loading && step === 3 && renderStep3()}
        {!loading && step === 4 && renderStep4()}
      </div>

      <div className="fcl-footbar">
        <button
          type="button"
          className="fcl-btn ghost"
          onClick={() => (step === 1 ? onCancel() : setStep((s) => s - 1))}
        >
          {step === 1 ? '取消' : '上一步'}
        </button>
        {step < STEP_COUNT ? (
          <button
            type="button"
            className="fcl-btn"
            disabled={!canNext || loading}
            onClick={() => setStep((s) => s + 1)}
          >
            下一步 <ChevronRight />
          </button>
        ) : (
          <button
            type="button"
            className="fcl-btn"
            disabled={creating || !selectedChatId || !boardId}
            onClick={handleCreate}
          >
            <Plane /> {creating ? '起飞中...' : '起飞'}
          </button>
        )}
      </div>

      {importOpen && (
        <div className="fcl-sheet-backdrop" onClick={() => setImportOpen(false)}>
          <div className="fcl-glass fcl-import-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 className="fcl-card-title">导入新棋盘</h3>
            <p className="fcl-sub">粘贴一份棋盘 JSON，或者直接选择文件。</p>
            <textarea
              className="fcl-input mono"
              rows={5}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='{"title":"...", "tiles":[{"type":"start"},{"type":"event"},{"type":"end"}]}'
            />
            {importError && <p className="fcl-error">{importError}</p>}
            <div className="fcl-row between">
              <label className="fcl-btn ghost small">
                <Upload /> 选择文件
                <input type="file" accept="application/json,.json" hidden onChange={handleImportFile} />
              </label>
              <div className="fcl-row">
                <button type="button" className="fcl-btn ghost small" onClick={() => setImportOpen(false)}>取消</button>
                <button type="button" className="fcl-btn small" disabled={!importText.trim()} onClick={handleImport}>导入</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlightChessWizard;