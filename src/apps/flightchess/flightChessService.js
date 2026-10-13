// src/apps/flightchess/flightChessService.js
//
// 飞行棋（事件卡骰子棋）子应用切片A：棋盘库 + 对局会话的增删查改。
// 这一切片只做到「建局向导走完、创建出一条 status:'setup' 的会话」
// 为止——真正的掷骰子/移动/问答/AI反应/终局总结消息是 Slice B 的范围，
// 不在这个文件里。
//
// 表结构说明见 db/index.js 的 v85 注释，这里不重复。

import db from '../../db';
import {
  parseImportedBoardJson,
  BUILTIN_SAMPLE_BOARD,
  BUILTIN_BOARD_VERSION,
} from './flightChessBoardData';

export const MAX_EXTRA_CHARACTERS = 2;

/* ------------------------------------------------------------------ */
/* 棋盘库                                                               */
/* ------------------------------------------------------------------ */

/**
 * 按更新时间倒序取棋盘库列表。取之前先同步一下内置棋盘：库里没有就
 * 种一张；有但版本号落后于代码里的 BUILTIN_BOARD_VERSION，就原地更新
 * 成最新内容（只动 isBuiltin 的那一条，用户自己导入的棋盘不受影响）。
 */
export const getAllBoards = async () => {
  try {
    await syncBuiltinBoard();
    return await db.flightChessBoards.orderBy('updatedAt').reverse().toArray();
  } catch (err) {
    console.error('[flightChessService] 获取棋盘列表失败:', err);
    return [];
  }
};

const syncBuiltinBoard = async () => {
  try {
    const all = await db.flightChessBoards.toArray();
    const builtin = all.find((board) => board.isBuiltin);
    const now = Date.now();

    if (!builtin) {
      await db.flightChessBoards.add({
        title: BUILTIN_SAMPLE_BOARD.title,
        tiles: BUILTIN_SAMPLE_BOARD.tiles,
        isBuiltin: true,
        builtinVersion: BUILTIN_BOARD_VERSION,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    if ((builtin.builtinVersion || 0) < BUILTIN_BOARD_VERSION) {
      await db.flightChessBoards.update(builtin.id, {
        title: BUILTIN_SAMPLE_BOARD.title,
        tiles: BUILTIN_SAMPLE_BOARD.tiles,
        builtinVersion: BUILTIN_BOARD_VERSION,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.error('[flightChessService] 同步内置棋盘失败:', err);
  }
};

export const getBoardById = async (boardId) => {
  if (boardId === null || boardId === undefined) return null;
  try {
    return await db.flightChessBoards.get(Number(boardId));
  } catch (err) {
    console.error('[flightChessService] 获取棋盘详情失败:', err);
    return null;
  }
};

/**
 * 导入一份新棋盘（纯JSON，见 flightChessBoardData.parseImportedBoardJson
 * 的校验规则）。校验不通过时返回 { ok:false, error }，不写入数据库。
 * 校验通过时总是新建一条记录，不会覆盖已有棋盘（跟 rpPresetService
 * 的导入约定一致）。
 */
export const importBoardFromJson = async (rawJsonText) => {
  let parsed;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch (err) {
    return { ok: false, error: '不是合法的 JSON：' + err.message };
  }

  const result = parseImportedBoardJson(parsed);
  if (!result.ok) return result;

  try {
    const now = Date.now();
    const newId = await db.flightChessBoards.add({
      title: result.board.title,
      tiles: result.board.tiles,
      isBuiltin: false,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, boardId: newId };
  } catch (err) {
    console.error('[flightChessService] 导入棋盘写入失败:', err);
    return { ok: false, error: '写入数据库失败，请重试。' };
  }
};

export const deleteBoard = async (boardId) => {
  if (boardId === null || boardId === undefined) return;
  try {
    await db.flightChessBoards.delete(Number(boardId));
  } catch (err) {
    console.error('[flightChessService] 删除棋盘失败:', err);
  }
};

/* ------------------------------------------------------------------ */
/* 对局会话                                                             */
/* ------------------------------------------------------------------ */

export const getAllSessions = async () => {
  try {
    return await db.flightChessSessions.orderBy('updatedAt').reverse().toArray();
  } catch (err) {
    console.error('[flightChessService] 获取对局列表失败:', err);
    return [];
  }
};

export const getSessionById = async (sessionId) => {
  if (sessionId === null || sessionId === undefined) return null;
  try {
    return await db.flightChessSessions.get(Number(sessionId));
  } catch (err) {
    console.error('[flightChessService] 获取对局详情失败:', err);
    return null;
  }
};

/**
 * 建局向导走完后调用。固定把棋子顺序排成
 * [user, 主角色, ...额外角色]，位置都从0（起点）开始。
 * questionCards 这一切片先建一个空结构占位（{ userCards: [],
 * characterCards: [] }），真正「开局必须各填3张」的流程留给 Slice B，
 * 跟真正能开始掷骰子的那一刻绑在一起做，这一切片创建完就停在
 * status:'setup'，落地到一个空壳房间。
 *
 * @param {object} params
 * @param {number} params.mainChatId
 * @param {number} params.mainCharacterId
 * @param {number[]} params.extraCharacterIds 最多 MAX_EXTRA_CHARACTERS 个
 * @param {number} params.boardId
 * @param {string} [params.title]
 */
export const createSession = async ({
  mainChatId,
  mainCharacterId,
  extraCharacterIds = [],
  boardId,
  title,
} = {}) => {
  if (!mainChatId || !mainCharacterId || !boardId) return null;

  const trimmedExtras = extraCharacterIds
    .filter((id) => id !== mainCharacterId)
    .slice(0, MAX_EXTRA_CHARACTERS);

  const newPlayer = (type, characterId) => ({
    type,
    characterId,
    position: 0,
    skipNext: false,
    perks: [],
    stats: { deposit: 0, withdraw: 0, punish: 0 },
  });

  const players = [
    newPlayer('user', null),
    newPlayer('character', mainCharacterId),
    ...trimmedExtras.map((characterId) => newPlayer('character', characterId)),
  ];

  try {
    const now = Date.now();
    const newId = await db.flightChessSessions.add({
      title: String(title || '').trim() || '一局飞行棋',
      mainChatId: Number(mainChatId),
      mainCharacterId: Number(mainCharacterId),
      extraCharacterIds: trimmedExtras,
      boardId: Number(boardId),
      players,
      questionCards: { userCards: [], characterCards: {} },
      drawnCardIds: [],
      log: [],
      turnCount: 0,
      currentTurnIndex: 0,
      status: 'setup',
      winnerPlayerIndex: null,
      createdAt: now,
      updatedAt: now,
    });
    return newId;
  } catch (err) {
    console.error('[flightChessService] 创建对局失败:', err);
    return null;
  }
};

/**
 * 局部更新一条对局会话（棋子位置、回合、日志等都走这个），自动带上 updatedAt。
 */
export const updateSession = async (sessionId, patch) => {
  if (sessionId === null || sessionId === undefined) return;
  try {
    await db.flightChessSessions.update(Number(sessionId), {
      ...patch,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[flightChessService] 更新对局失败:', err);
  }
};

export const deleteSession = async (sessionId) => {
  if (sessionId === null || sessionId === undefined) return;
  try {
    await db.flightChessSessions.delete(Number(sessionId));
  } catch (err) {
    console.error('[flightChessService] 删除对局失败:', err);
  }
};

export default {
  MAX_EXTRA_CHARACTERS,
  getAllBoards,
  getBoardById,
  importBoardFromJson,
  deleteBoard,
  getAllSessions,
  getSessionById,
  createSession,
  updateSession,
  deleteSession,
};