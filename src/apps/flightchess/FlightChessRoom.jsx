// src/apps/flightchess/FlightChessRoom.jsx
//
// 飞行棋对局房间：把 3D 棋盘、骰子、翻牌弹窗、提问卡填写和终局结算串成
// 一整局游戏。规则细节在 flightChessEngine.js，卡牌/格子数据在
// flightChessCardData.js / flightChessBoardData.js，AI 调用在
// flightChessAiService.js，这里只负责「流程编排」：
//
//   setup（写提问卡）-> active（轮流掷骰/移动/结算格子）-> finished（结算+发总结）
//
// 一个回合：掷骰 -> 逐格跳过去 -> 落点结算 -> 弹出翻牌弹窗（真心话/任务/抽卡）
// -> 角色做出反应 -> 点「继续」-> 应用格子效果（前进/后退/暂停一轮）-> 下一位。
// 轮到 AI 角色时整个流程自动跑；轮到用户时点骰子开始。
//
// 状态都落库（棋子位置、回合、日志），中途退出再进来会停在当前轮次，
// 只有「半截的翻牌弹窗」不恢复（会回到该玩家掷骰前）。

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { ArrowLeft, Maximize2, Crosshair } from 'lucide-react';

import db from '../../db';
import { getSessionById, getBoardById, updateSession } from './flightChessService';
import {
  isContentTile, isDrawTile, TILE_TONES,
} from './flightChessBoardData';
import {
  drawCardFromDeck, drawCustomCard, getDeck, CUSTOM_DECK_META,
} from './flightChessCardData';
import {
  rollDie, buildForwardPath, buildBackwardPath, advanceTurn, normalizeSession,
  appendLog, bumpStat, getLoserIndexes,
} from './flightChessEngine';
import {
  generateCharacterQuestionCards, generateTileReaction,
  generateFinalSummary, postSummaryToMainChat,
} from './flightChessAiService';
import FlightChessBoard3D from './FlightChessBoard3D';
import FlightChessCardModal from './FlightChessCardModal';
import FlightChessDiceStage from './FlightChessDiceStage';
import FlightChessSetupCards from './FlightChessSetupCards';
import {
  PLAYER_COLORS, PLAYER_GLOWS, TOKEN_KINDS, TokenIcon,
} from './FlightChessTokens';
import './flightChess.css';

const PIP_PATTERNS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

class UnmountedError extends Error {}

const FlightChessRoom = ({ sessionId, onBack, onChatRoomStateChange }) => {
  const [session, setSession] = useState(null);
  const [board, setBoard] = useState(null);
  const [charactersById, setCharactersById] = useState({});
  const [chat, setChat] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | setup | idle | rolling | moving | modal | finished
  const [dice, setDice] = useState(1);
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(null);
  const [motion, setMotion] = useState(null);
  const [tileFx, setTileFx] = useState(null);
  const [, setFocus] = useState(null);
  const [cameraMode, setCameraMode] = useState('follow'); // follow | overview
  const [setupBusy, setSetupBusy] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [diceRequest, setDiceRequest] = useState(null);

  const sessionRef = useRef(null);
  const ctxRef = useRef({});
  const modalRef = useRef(null);
  const modalResolveRef = useRef(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const nonceRef = useRef(0);
  const fxTimerRef = useRef(null);
  const diceSettleRef = useRef(null);

  const userName = chat?.userName || '你';

  ctxRef.current = { board, charactersById, userName };
  modalRef.current = modal;

  /* ------------------------------------------------------------------ */
  /* 加载                                                                 */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    mountedRef.current = true;
    onChatRoomStateChange?.(true);
    loadData();
    return () => {
      mountedRef.current = false;
            clearTimeout(fxTimerRef.current);
      diceSettleRef.current?.reject(new UnmountedError());
      diceSettleRef.current = null;
      onChatRoomStateChange?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const loadData = async () => {
    const found = await getSessionById(sessionId);
    if (!found) return;
    const normalized = normalizeSession(found);

    const [foundBoard, chars, foundChat] = await Promise.all([
      getBoardById(normalized.boardId),
      db.characters.toArray(),
      db.chats.get(normalized.mainChatId),
    ]);
    if (!mountedRef.current) return;

    const lastIndex = Math.max(0, (foundBoard?.tiles?.length || 1) - 1);
    normalized.players = normalized.players.map((player) => ({
      ...player,
      position: Math.min(player.position, lastIndex),
    }));

    sessionRef.current = normalized;
    setSession(normalized);
    setBoard(foundBoard);
    setCharactersById(Object.fromEntries(chars.map((c) => [c.id, c])));
    setChat(foundChat || null);

    if (normalized.status === 'setup') {
      setPhase('setup');
    } else if (normalized.status === 'finished') {
      setPhase('finished');
    } else {
      setPhase('idle');
    }
  };

  /* ------------------------------------------------------------------ */
  /* 小工具                                                               */
  /* ------------------------------------------------------------------ */

  const sleep = useCallback((ms) => new Promise((resolve, reject) => {
    setTimeout(() => {
      if (mountedRef.current) resolve();
      else reject(new UnmountedError());
    }, ms);
  }), []);

  const nameOf = useCallback((playerIndex) => {
    const s = sessionRef.current;
    const player = s?.players?.[playerIndex];
    if (!player) return '';
    if (player.type === 'user') return ctxRef.current.userName;
    return ctxRef.current.charactersById[player.characterId]?.name || '角色';
  }, []);

  const commit = useCallback(async (patch, { persist = true } = {}) => {
    const next = normalizeSession({ ...sessionRef.current, ...patch });
    sessionRef.current = next;
    if (mountedRef.current) setSession(next);
    if (persist) await updateSession(next.id, patch);
    return next;
  }, []);

    // 打开全屏骰子,等它播完再继续;点数由调用方先定好
  const showDice = useCallback((request) => new Promise((resolve, reject) => {
    diceSettleRef.current = { resolve, reject };
    nonceRef.current += 1;
    setDiceRequest({ ...request, nonce: nonceRef.current });
  }), []);

  const handleDiceDone = useCallback(() => {
    const settle = diceSettleRef.current;
    diceSettleRef.current = null;
    setDiceRequest(null);
    settle?.resolve();
  }, []);

  const scheduleFxClear = useCallback(() => {
    clearTimeout(fxTimerRef.current);
    fxTimerRef.current = setTimeout(() => setTileFx(null), 1600);
  }, []);

  /* ------------------------------------------------------------------ */
  /* 移动                                                                 */
  /* ------------------------------------------------------------------ */

  const movePlayer = useCallback(async (playerIndex, path) => {
    for (let k = 0; k < path.length; k += 1) {
      const position = path[k];
      const isLast = k === path.length - 1;
      const players = sessionRef.current.players.map((p, i) => (
        i === playerIndex ? { ...p, position } : p
      ));
      // eslint-disable-next-line no-await-in-loop
      await commit({ players }, { persist: false });

      nonceRef.current += 1;
      const nonce = nonceRef.current;
      setMotion({ playerIndex, mode: isLast ? 'land' : 'hop', nonce });
      setTileFx({ tileIndex: position, playerIndex, mode: isLast ? 'land' : 'pass', nonce });
      setFocus({ index: position, nonce });
      // eslint-disable-next-line no-await-in-loop
      await sleep(isLast ? 560 : 270);
    }
    await updateSession(sessionRef.current.id, { players: sessionRef.current.players });
    scheduleFxClear();
  }, [commit, scheduleFxClear, sleep]);

  /* ------------------------------------------------------------------ */
  /* 翻牌弹窗                                                             */
  /* ------------------------------------------------------------------ */

  const openPromptModal = useCallback((config) => new Promise((resolve) => {
    modalResolveRef.current = resolve;
    setPhase('modal');
    setModal({
      answer: '',
      stage: 'prompt',
      reaction: '',
      reactorName: '',
      loading: false,
      started: false,
      flipped: false,
      ...config,
    });
  }), []);

  const handleFlip = useCallback(() => {
    setModal((m) => (m && !m.flipped ? { ...m, flipped: true } : m));
  }, []);

  const runReaction = useCallback(async ({ reactorIndex, answer }) => {
    const s = sessionRef.current;
    const m = modalRef.current;
    if (!s || !m) return;

    const reactorPlayer = s.players[reactorIndex];
    const reactor = ctxRef.current.charactersById[reactorPlayer?.characterId];
    const reactorName = nameOf(reactorIndex);

    let text = '……';
    if (reactor) {
      text = await generateTileReaction({
        reactor,
        userName: ctxRef.current.userName,
        actorIsCharacter: m.actorIsCharacter,
        actorName: m.actorName,
        promptTitle: m.title,
        promptText: m.text,
        userAnswer: answer,
        log: s.log,
      });
    }
    if (!mountedRef.current) return;

    setModal((prev) => (prev ? {
      ...prev, reaction: text, loading: false, stage: 'reaction', reactorName,
    } : prev));

    let log = sessionRef.current.log;
    if (answer && answer.trim()) {
      log = appendLog(log, { who: ctxRef.current.userName, text: answer.trim() });
    }
    log = appendLog(log, { who: reactorName, text });
    await commit({ log });
  }, [commit, nameOf]);

  // 翻面之后：角色落子 -> 立刻让它自己回答；用户落子 -> 等用户写回应
  useEffect(() => {
    if (!modal || !modal.flipped || modal.started) return;
    if (modal.actorIsCharacter) {
      setModal((m) => (m ? {
        ...m, started: true, stage: 'reaction', loading: true, reactorName: m.actorName,
      } : m));
      runReaction({ reactorIndex: modal.actorIndex, answer: '' });
    } else {
      setModal((m) => (m ? { ...m, started: true, stage: 'responding' } : m));
    }
  }, [modal, runReaction]);

  const handleSubmitAnswer = useCallback(() => {
    const m = modalRef.current;
    const s = sessionRef.current;
    if (!m || !s) return;

    const characterIndexes = s.players
      .map((p, i) => (p.type === 'character' ? i : -1))
      .filter((i) => i >= 0);
    const reactorIndex = characterIndexes[Math.floor(Math.random() * characterIndexes.length)];

    setModal((prev) => (prev ? {
      ...prev, loading: true, stage: 'reaction', reactorName: nameOf(reactorIndex),
    } : prev));
    runReaction({ reactorIndex, answer: m.answer });
  }, [nameOf, runReaction]);

  const handleContinue = useCallback(() => {
    const resolve = modalResolveRef.current;
    modalResolveRef.current = null;
    setModal(null);
    resolve?.();
  }, []);

  /* ------------------------------------------------------------------ */
  /* 回合流程                                                             */
  /* ------------------------------------------------------------------ */

  const endTurn = useCallback(async (playerIndex) => {
    const s = sessionRef.current;
    const { nextIndex, players, skippedIndexes } = advanceTurn(s.players, playerIndex);
    let log = s.log;
    skippedIndexes.forEach((index) => {
      log = appendLog(log, { kind: 'system', text: `${nameOf(index)} 暂停一轮，被跳过` });
    });
    await commit({
      players, currentTurnIndex: nextIndex, turnCount: s.turnCount + 1, log,
    });
    setPhase('idle');
    setStatus(
      players[nextIndex].type === 'user' ? '轮到你了，点骰子' : `${nameOf(nextIndex)} 准备掷骰子...`
    );
  }, [commit, nameOf]);

  const finishGame = useCallback(async (winnerIndex) => {
    const s = sessionRef.current;

    // 结算抽卡：赢家抽一张赢家福利卡，其余每人抽一张甜蜜暴击
    const winnerDraw = drawCardFromDeck('winner', []);
    let sweetDrawn = [];
    const loserCards = getLoserIndexes(s.players, winnerIndex).map((playerIndex) => {
      const draw = drawCardFromDeck('sweet', sweetDrawn);
      sweetDrawn = draw.nextDrawnIds;
      return { playerIndex, card: draw.card };
    });

    let log = appendLog(s.log, { kind: 'system', text: `${nameOf(winnerIndex)} 最先抵达终点` });
    await commit({
      status: 'finished',
      winnerPlayerIndex: winnerIndex,
      settlement: { winnerCard: winnerDraw.card, loserCards },
      log,
    });
    setPhase('finished');
    setStatus('');

    // 终局总结：主角色写，发回主聊天框
    setSummaryBusy(true);
    try {
      const latest = sessionRef.current;
      const mainCharacter = ctxRef.current.charactersById[latest.mainCharacterId];
      if (mainCharacter) {
        const statsLines = latest.players.map((p, i) => (
          `${nameOf(i)}：存款格${p.stats.deposit}次、取款格${p.stats.withdraw}次、惩罚格${p.stats.punish}次`
        ));
        const highlights = latest.log
          .filter((entry) => entry.who)
          .slice(-8)
          .map((entry) => `${entry.who}：${entry.text}`);
        const text = await generateFinalSummary({
          character: mainCharacter,
          userName: ctxRef.current.userName,
          winnerName: nameOf(winnerIndex),
          statsLines,
          highlights,
        });
        const posted = await postSummaryToMainChat({
          chatId: latest.mainChatId,
          characterId: latest.mainCharacterId,
          text,
        });
        if (mountedRef.current || posted) {
          await commit({ summaryPosted: Boolean(posted), summaryText: text });
        }
      }
    } finally {
      if (mountedRef.current) setSummaryBusy(false);
    }
  }, [commit, nameOf]);

  const applyEffect = useCallback(async (playerIndex, effect) => {
    if (!effect) return false;
    const lastIndex = ctxRef.current.board.tiles.length - 1;
    const current = sessionRef.current.players[playerIndex];

    if (effect.type === 'forward') {
      const path = buildForwardPath(current.position, effect.steps || 2, lastIndex);
      setStatus(`${nameOf(playerIndex)} 前进 ${path.length} 格`);
      await movePlayer(playerIndex, path);
    } else if (effect.type === 'back') {
      const path = buildBackwardPath(current.position, effect.steps || 2);
      setStatus(`${nameOf(playerIndex)} 后退 ${path.length} 格`);
      await movePlayer(playerIndex, path);
    }

    if (effect.type === 'skip' || effect.perk) {
      const players = sessionRef.current.players.map((p, i) => {
        if (i !== playerIndex) return p;
        return {
          ...p,
          skipNext: effect.type === 'skip' ? true : p.skipNext,
          perks: effect.perk ? [...p.perks, effect.perk] : p.perks,
        };
      });
      await commit({ players });
    }

    const after = sessionRef.current.players[playerIndex];
    if (effect.type === 'forward' && after.position >= lastIndex) {
      await finishGame(playerIndex);
      return true;
    }
    return false;
  }, [commit, finishGame, movePlayer, nameOf]);

  const resolveLanding = useCallback(async (playerIndex) => {
    const { board: currentBoard } = ctxRef.current;
    const s = sessionRef.current;
    const position = s.players[playerIndex].position;
    const tile = currentBoard.tiles[position];
    const lastIndex = currentBoard.tiles.length - 1;

    if (position >= lastIndex) {
      await finishGame(playerIndex);
      return;
    }
    if (!tile || tile.type === 'start') {
      await endTurn(playerIndex);
      return;
    }

    const actorName = nameOf(playerIndex);
    const actorIsCharacter = s.players[playerIndex].type === 'character';

    const players = s.players.map((p, i) => (i === playerIndex ? bumpStat(p, tile.type) : p));
    await commit({
      players,
      log: appendLog(s.log, {
        kind: 'system', text: `${actorName} 落在第${position + 1}格「${tile.title}」`,
      }),
    });

    const config = {
      title: tile.title,
      text: tile.text,
      tone: TILE_TONES[tile.type] || 'gray',
      needsFlip: false,
      actorIndex: playerIndex,
      actorName,
      actorIsCharacter,
      deckMeta: null,
      author: '',
      effect: null,
      effectHint: '',
    };

    if (tile.type === 'forward' || tile.type === 'back') {
      config.effect = { type: tile.type, steps: tile.steps || 2, perk: tile.perk };
      config.effectHint = `${tile.type === 'forward' ? '前进' : '后退'}${tile.steps || 2}格${tile.perk ? `，获得：${tile.perk}` : ''}`;
    } else if (tile.type === 'skip') {
      config.effect = { type: 'skip' };
      config.effectHint = '下一轮暂停';
    } else if (isDrawTile(tile)) {
      const deckId = tile.deck || 'warm';
      const latest = sessionRef.current;
      const names = {
        user: ctxRef.current.userName,
        ...Object.fromEntries(
          Object.entries(ctxRef.current.charactersById).map(([id, c]) => [id, c.name])
        ),
      };
      const draw = deckId === 'custom'
        ? drawCustomCard(latest.questionCards, latest.drawnCardIds, names)
        : drawCardFromDeck(deckId, latest.drawnCardIds);

      config.needsFlip = true;
      config.deckMeta = deckId === 'custom' ? CUSTOM_DECK_META : getDeck(deckId);
      if (draw.card) {
        await commit({ drawnCardIds: draw.nextDrawnIds });
        config.text = draw.card.text;
        config.author = draw.card.author || '';
        config.title = (config.deckMeta && config.deckMeta.name) || tile.title;
        if (draw.card.effect && draw.card.effect.type === 'forward') {
          config.effect = draw.card.effect;
          config.effectHint = `前进${draw.card.effect.steps}格`;
        } else if (draw.card.effect && draw.card.effect.perk) {
          config.effect = { type: 'perk', perk: draw.card.effect.perk };
          config.effectHint = `获得：${draw.card.effect.perk}`;
        }
      } else {
        config.text = tile.text || '这副卡暂时没有可抽的卡了，轻松过一回合吧。';
        config.needsFlip = false;
      }
    } else if (isContentTile(tile) && tile.perk) {
      config.effect = { type: 'perk', perk: tile.perk };
    }

    await openPromptModal(config);
    if (!mountedRef.current) return;

    const finished = await applyEffect(playerIndex, config.effect);
    if (finished) return;
    await endTurn(playerIndex);
  }, [applyEffect, commit, endTurn, finishGame, nameOf, openPromptModal]);

  const runTurn = useCallback(async (playerIndex) => {
    const s = sessionRef.current;
    const lastIndex = ctxRef.current.board.tiles.length - 1;
    const actorName = nameOf(playerIndex);

    setPhase('rolling');
    setStatus(`${actorName} 掷骰子中...`);
    const value = rollDie();
    await showDice({
      playerIndex,
      value,
      actorName,
      isAI: s.players[playerIndex].type === 'character',
    });
    setDice(value);
    setStatus(`${actorName} 掷出了 ${value} 点`);
    await commit({
      log: appendLog(s.log, { kind: 'system', text: `${actorName} 掷出 ${value} 点` }),
    });
    await sleep(420);

    setPhase('moving');
    const path = buildForwardPath(sessionRef.current.players[playerIndex].position, value, lastIndex);
    await movePlayer(playerIndex, path);
    await resolveLanding(playerIndex);
    }, [commit, movePlayer, nameOf, resolveLanding, showDice, sleep]);

  const handleRoll = useCallback(async () => {
    const s = sessionRef.current;
    if (busyRef.current || !s || s.status !== 'active') return;
    busyRef.current = true;
    try {
      await runTurn(s.currentTurnIndex);
    } catch (err) {
      if (!(err instanceof UnmountedError)) {
        console.error('[FlightChessRoom] 回合执行出错:', err);
        if (mountedRef.current) {
          setPhase('idle');
          setStatus('这一步出了点小问题，再点一次骰子试试。');
        }
      }
    } finally {
      busyRef.current = false;
    }
  }, [runTurn]);

  // 轮到 AI 角色：稍等一下自动掷骰
  useEffect(() => {
    if (!session || session.status !== 'active' || phase !== 'idle') return undefined;
    const current = session.players[session.currentTurnIndex];
    if (!current || current.type !== 'character') return undefined;
    const timer = setTimeout(() => { handleRoll(); }, 1100);
    return () => clearTimeout(timer);
  }, [session, phase, handleRoll]);

  /* ------------------------------------------------------------------ */
  /* 开局：写提问卡                                                        */
  /* ------------------------------------------------------------------ */

  const handleStartGame = useCallback(async (userCards) => {
    setSetupBusy(true);
    try {
      const s = sessionRef.current;
      const characterIds = [...new Set(
        s.players.filter((p) => p.type === 'character').map((p) => p.characterId)
      )];
      const characterCards = {};
      await Promise.all(characterIds.map(async (id) => {
        const character = ctxRef.current.charactersById[id];
        if (!character) return;
        characterCards[id] = await generateCharacterQuestionCards({
          character, userName: ctxRef.current.userName, count: 3,
        });
      }));

      await commit({
        questionCards: { userCards, characterCards },
        status: 'active',
        currentTurnIndex: 0,
        log: appendLog([], { kind: 'system', text: '提问卡已洗好，游戏开始' }),
      });
      setPhase('idle');
      setStatus('轮到你了，点骰子');
    } finally {
      if (mountedRef.current) setSetupBusy(false);
    }
  }, [commit]);

  /* ------------------------------------------------------------------ */
  /* 点棋子互动 / 补发总结                                                 */
  /* ------------------------------------------------------------------ */

  const handleTokenTap = useCallback((playerIndex) => {
    if (busyRef.current) return;
    const s = sessionRef.current;
    if (!s) return;
    nonceRef.current += 1;
    const nonce = nonceRef.current;
    setMotion({ playerIndex, mode: 'tap', nonce });
    setTileFx({
      tileIndex: s.players[playerIndex].position, playerIndex, mode: 'tap', nonce,
    });
    scheduleFxClear();
  }, [scheduleFxClear]);

  const handleRepostSummary = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || !s.summaryText) return;
    setSummaryBusy(true);
    const posted = await postSummaryToMainChat({
      chatId: s.mainChatId, characterId: s.mainCharacterId, text: s.summaryText,
    });
    if (posted) await commit({ summaryPosted: true });
    setSummaryBusy(false);
  }, [commit]);

  /* ------------------------------------------------------------------ */
  /* 渲染                                                                 */
  /* ------------------------------------------------------------------ */

  const playerNames = useMemo(() => (
    (session?.players || []).map((p) => (
      p.type === 'user' ? userName : charactersById[p.characterId]?.name || '角色'
    ))
  ), [session, charactersById, userName]);

  if (!session || !board) {
    return (
      <div
        className="fixed inset-0 z-50 flex h-[100dvh] w-full items-center justify-center"
        style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-main)' }}
      >
        <p className="text-xs opacity-60">加载中...</p>
      </div>
    );
  }

  const currentIndex = session.currentTurnIndex;
  const isActive = session.status === 'active';
  const isFinished = session.status === 'finished';
  const currentIsUser = session.players[currentIndex]?.type === 'user';
  const canRoll = isActive && phase === 'idle' && currentIsUser;
  const isRolling = phase === 'rolling';
  const dicePips = PIP_PATTERNS[dice] || [];
  const diceColor = PLAYER_COLORS[currentIndex % 4];

  const capsuleText = (() => {
    if (session.status === 'setup') return '准备中';
    if (isFinished) return '本局结束';
    return `${playerNames[currentIndex]} 领航`;
  })();

  const logItems = session.log.slice(-6);
  const lastIndex = board.tiles.length - 1;
  const endTile = board.tiles[lastIndex];

  return (
    <div className="fc-room animate-fade-in-up">
      <FlightChessBoard3D
        tiles={board.tiles}
        players={session.players}
        activeIndex={currentIndex}
        motion={motion}
        tileFx={tileFx}
        onTokenTap={handleTokenTap}
        playerNames={playerNames}
        cameraMode={cameraMode}
      />

      <div className="fc-header">
        <button type="button" onClick={onBack} className="fc-back">
          <ArrowLeft className="w-4 h-4" /> 返回
        </button>
        <div className="fc-turn-capsule">
          <span
            className="fc-turn-dot"
            style={{
              backgroundColor: diceColor,
              boxShadow: `0 0 12px ${PLAYER_GLOWS[currentIndex % 4]}`,
            }}
          />
          <span>{capsuleText}</span>
        </div>
        <button
          type="button"
          className="fc-cam-btn"
          onClick={() => setCameraMode((mode) => (mode === 'follow' ? 'overview' : 'follow'))}
        >
          {cameraMode === 'follow' ? <Maximize2 /> : <Crosshair />}
          {cameraMode === 'follow' ? '全景' : '跟随'}
        </button>
      </div>

      <div className="fc-players">
        {session.players.map((player, index) => (
          <div
            key={index}
            className={`fc-player-chip${isActive && index === currentIndex ? ' is-active' : ''}`}
            style={{
              '--chip-color': PLAYER_COLORS[index % 4],
              '--chip-glow': PLAYER_GLOWS[index % 4],
            }}
          >
            <span className="fc-player-chip-icon"><TokenIcon kind={TOKEN_KINDS[index % 4]} /></span>
            <span className="fc-player-meta">
              <span>{playerNames[index]}</span>
              <small>
                第{player.position + 1}/{board.tiles.length}格
                {player.skipNext ? ' · 暂停' : ''}
                {player.perks.length > 0 ? ` · 特权${player.perks.length}` : ''}
              </small>
            </span>
          </div>
        ))}
      </div>

      {(session.status === 'setup' || isFinished) && (
        <div className="fc-overlay">
          {session.status === 'setup' && (
            <div className="mb-4">
              <FlightChessSetupCards
                busy={setupBusy}
                onStart={handleStartGame}
                characterNames={playerNames.filter((_, i) => session.players[i].type === 'character')}
              />
            </div>
          )}
          {isFinished && (
            <div className="fc-panel mt-4">
              <h3>本局结算 · {playerNames[session.winnerPlayerIndex]} 先到终点</h3>
              {endTile?.text && (
                <p className="fc-hint" style={{ whiteSpace: 'pre-line' }}>{endTile.text}</p>
              )}
              <div className="mt-2">
                {session.players.map((player, index) => (
                  <div className="fc-settle-row" key={index}>
                    <span>{playerNames[index]}</span>
                    <span className="opacity-70">
                      存款格 {player.stats.deposit} · 取款格 {player.stats.withdraw} · 惩罚格 {player.stats.punish}
                    </span>
                  </div>
                ))}
              </div>

              {session.settlement?.winnerCard && (
                <div className="fc-settle-card">
                  <small>赢家福利卡 · {playerNames[session.winnerPlayerIndex]}</small>
                  {session.settlement.winnerCard.text}
                </div>
              )}
              {(session.settlement?.loserCards || []).map(({ playerIndex, card }) => (
                card ? (
                  <div className="fc-settle-card" key={playerIndex}>
                    <small>甜蜜暴击 · {playerNames[playerIndex]}</small>
                    {card.text}
                  </div>
                ) : null
              ))}

              <div className="mt-4 text-center text-xs opacity-70">
                {summaryBusy && '正在把这局的总结发回聊天...'}
                {!summaryBusy && session.summaryPosted && '总结已发回主聊天框'}
                {!summaryBusy && !session.summaryPosted && session.summaryText && (
                  <button type="button" className="fc-btn is-ghost" onClick={handleRepostSummary}>
                    把总结发回聊天
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!isFinished && logItems.length > 0 && (
        <div className="fc-log">
          {logItems.slice(-2).map((entry, index) => (
            <div
              key={`${entry.at}-${index}`}
              className={`fc-log-item${entry.who ? '' : ' is-system'}`}
            >
              {entry.who && <b>{entry.who}</b>}
              {entry.text}
            </div>
          ))}
        </div>
      )}

      {isActive && (
        <div className="fc-footer">
          <button
            type="button"
            className={`fc-dice${canRoll ? ' is-ready' : ''}${isRolling ? ' is-rolling' : ''}`}
            disabled={!canRoll}
            onClick={handleRoll}
            aria-label="掷骰子"
          >
            <div className="fc-pips">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((pos) => (
                <span
                  key={pos}
                  className={`fc-pip${dicePips.includes(pos) ? ' on' : ''}`}
                  style={{ background: diceColor }}
                />
              ))}
            </div>
          </button>
          <div className="fc-status">
            {status || (currentIsUser ? '轻触骰子，启航' : `${playerNames[currentIndex]} 准备中...`)}
          </div>
        </div>
      )}

      <FlightChessCardModal
        modal={modal}
        onFlip={handleFlip}
        onAnswerChange={(value) => setModal((m) => (m ? { ...m, answer: value } : m))}
        onSubmitAnswer={handleSubmitAnswer}
                onContinue={handleContinue}
      />

      {diceRequest && (
        <FlightChessDiceStage
          key={diceRequest.nonce}
          request={diceRequest}
          onDone={handleDiceDone}
        />
      )}
    </div>
  );
};

export default FlightChessRoom;