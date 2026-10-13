// src/apps/flightchess/flightChessEngine.js
//
// 飞行棋的纯规则函数：掷骰、路径、回合轮转、会话形状规整。
// 不碰 Dexie、不碰 React、不调 AI，方便单独推演和以后换规则。

export const rollDie = () => Math.floor(Math.random() * 6) + 1;

/**
 * 从 from 往前走 steps 格，返回逐格经过的位置（含最终落点）。
 * 走到终点（lastIndex）就停，不会越过。
 */
export const buildForwardPath = (from, steps, lastIndex) => {
  const path = [];
  let position = from;
  for (let i = 0; i < steps; i += 1) {
    if (position >= lastIndex) break;
    position += 1;
    path.push(position);
  }
  return path;
};

/** 从 from 往后退 steps 格，最多退到起点（0）。 */
export const buildBackwardPath = (from, steps) => {
  const path = [];
  let position = from;
  for (let i = 0; i < steps; i += 1) {
    if (position <= 0) break;
    position -= 1;
    path.push(position);
  }
  return path;
};

/**
 * 轮到下一位玩家。被「暂停一轮」的玩家会被直接跳过（并清掉标记）。
 * 返回 { nextIndex, players, skippedIndexes }，不修改传入的数组。
 */
export const advanceTurn = (players, currentIndex) => {
  const count = players.length;
  const nextPlayers = players.map((player) => ({ ...player }));
  const skippedIndexes = [];
  let index = (currentIndex + 1) % count;

  for (let guard = 0; guard < count; guard += 1) {
    if (nextPlayers[index].skipNext) {
      nextPlayers[index].skipNext = false;
      skippedIndexes.push(index);
      index = (index + 1) % count;
    } else {
      break;
    }
  }

  return { nextIndex: index, players: nextPlayers, skippedIndexes };
};

const emptyStats = () => ({ deposit: 0, withdraw: 0, punish: 0 });

/**
 * 把库里读出来的会话规整成当前版本需要的形状（第一版只有
 * position/finished，这里补齐新字段，不改库，读出来用就行）。
 */
export const normalizeSession = (session) => {
  if (!session) return null;

  const players = (session.players || []).map((player) => ({
    type: player.type,
    characterId: player.characterId ?? null,
    position: Number(player.position) || 0,
    skipNext: Boolean(player.skipNext),
    perks: Array.isArray(player.perks) ? player.perks : [],
    stats: { ...emptyStats(), ...(player.stats || {}) },
  }));

  const rawCards = session.questionCards || {};
  const questionCards = {
    userCards: Array.isArray(rawCards.userCards) ? rawCards.userCards : [],
    characterCards:
      rawCards.characterCards && !Array.isArray(rawCards.characterCards)
        ? rawCards.characterCards
        : {},
  };

  return {
    ...session,
    players,
    questionCards,
    drawnCardIds: Array.isArray(session.drawnCardIds) ? session.drawnCardIds : [],
    log: Array.isArray(session.log) ? session.log : [],
    currentTurnIndex: Number(session.currentTurnIndex) || 0,
    turnCount: Number(session.turnCount) || 0,
    winnerPlayerIndex:
      session.winnerPlayerIndex === undefined ? null : session.winnerPlayerIndex,
  };
};

const MAX_LOG = 80;

/** 往日志末尾追加一条（保留最近 MAX_LOG 条）。 */
export const appendLog = (log, entry) => {
  const next = [...(log || []), { at: Date.now(), ...entry }];
  return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next;
};

/** 给玩家记一次格子类别统计（存款/取款/惩罚）。 */
export const bumpStat = (player, tileType) => {
  const key = ['deposit', 'withdraw', 'punish'].includes(tileType) ? tileType : null;
  if (!key) return player;
  return { ...player, stats: { ...player.stats, [key]: (player.stats?.[key] || 0) + 1 } };
};

/** 结算时谁赢：第一个到达终点的人（session.winnerPlayerIndex）。输家 = 其余所有人。 */
export const getLoserIndexes = (players, winnerIndex) => (
  players.map((_, index) => index).filter((index) => index !== winnerIndex)
);