// src/apps/tripHome/tripRoomService.js
//
// 房间（切片 B）的数据读写层：当前选的房间/日夜、已解锁的房间、每个房间
// 标定好的地板配置，这几样东西都在一起放在 db.settings 的 'tripHomeRoomState'
// 一行里（原因同 tripService.js 里旅费那一行：这几样总是一起读一起改，
// 放一行用事务整体读改写最不容易算错）。
//
// 留言板用独立的 db.tripBoardPosts 表（切片 B 新建，见 db/index.js
// version 96）：它是一条一条独立的留言，不像旅费/背包那样是"一份状态"，
// 更适合当成列表来存取。
//
// 戳一戳台词池：缓存在 db.tripResidents 的 pokeLines 字段上（不是索引
// 字段，不需要升级数据库版本），生成方式照抄
// src/apps/messages/interactions/pokeService.js 的 ensurePokeReplies——
// 按角色人设调一次 AI，解析成 JSON 数组缓存下来，以后戳这个居民直接从
// 缓存里随机挑，不再调用 AI。

import db from '../../db';
import { getTripRoom, TRIP_ROOMS } from './tripCatalog';

export const ROOM_STATE_KEY = 'tripHomeRoomState';
const MAX_BOARD_POSTS = 20;

/* ---------- 房间状态：当前房间 / 日夜 / 已解锁 / 每个房间的标定数据 ---------- */

const createDefaultRoomState = () => ({
  selectedRoomId: TRIP_ROOMS[0].id,
  isNight: false,
  unlockedRoomIds: TRIP_ROOMS.filter((room) => room.unlockCost <= 0).map((room) => room.id),
  roomConfigs: {},
});

const normalizeRoomState = (raw) => {
  const base = createDefaultRoomState();
  if (!raw || typeof raw !== 'object') return base;

  const unlockedSet = new Set(base.unlockedRoomIds);
  if (Array.isArray(raw.unlockedRoomIds)) {
    raw.unlockedRoomIds.forEach((id) => {
      if (TRIP_ROOMS.some((room) => room.id === id)) unlockedSet.add(id);
    });
  }

  const roomConfigs = {};
  if (raw.roomConfigs && typeof raw.roomConfigs === 'object') {
    Object.keys(raw.roomConfigs).forEach((roomId) => {
      if (TRIP_ROOMS.some((room) => room.id === roomId)) {
        roomConfigs[roomId] = raw.roomConfigs[roomId];
      }
    });
  }

  const selectedRoomId = unlockedSet.has(raw.selectedRoomId) ? raw.selectedRoomId : base.selectedRoomId;

  return {
    selectedRoomId,
    isNight: !!raw.isNight,
    unlockedRoomIds: Array.from(unlockedSet),
    roomConfigs,
  };
};

const readRoomStateInTx = async () => {
  const row = await db.settings.get(ROOM_STATE_KEY);
  return normalizeRoomState(row?.value);
};

const writeRoomStateInTx = (state) => db.settings.put({ key: ROOM_STATE_KEY, value: state });

export const getRoomState = async () => {
  const row = await db.settings.get(ROOM_STATE_KEY);
  return normalizeRoomState(row?.value);
};

export const setSelectedRoom = async (roomId) =>
  db.transaction('rw', db.settings, async () => {
    const state = await readRoomStateInTx();
    if (!state.unlockedRoomIds.includes(roomId)) return { ok: false, reason: 'locked', state };
    state.selectedRoomId = roomId;
    await writeRoomStateInTx(state);
    return { ok: true, state };
  });

export const setNightMode = async (isNight) =>
  db.transaction('rw', db.settings, async () => {
    const state = await readRoomStateInTx();
    state.isNight = !!isNight;
    await writeRoomStateInTx(state);
    return { ok: true, state };
  });

// 用旅费解锁一个房间。旅费存在另一行（tripService.js 的 TRIP_STATE_KEY），
// 两行都在同一个事务里读改写，避免"扣了钱但没解锁"或反过来的半途失败。
export const unlockRoom = async (roomId) => {
  const room = getTripRoom(roomId);
  if (!room) return { ok: false, reason: 'unknown_room' };

  return db.transaction('rw', db.settings, async () => {
    const roomState = await readRoomStateInTx();
    if (roomState.unlockedRoomIds.includes(roomId)) {
      return { ok: true, roomState, alreadyUnlocked: true };
    }

    const tripRow = await db.settings.get('tripHomeState');
    const tripState = tripRow?.value || { coins: 0 };
    const coins = Math.max(0, Math.floor(Number(tripState.coins) || 0));

    if (coins < room.unlockCost) {
      return { ok: false, reason: 'not_enough_coins' };
    }

    const nextTripState = { ...tripState, coins: coins - room.unlockCost };
    await db.settings.put({ key: 'tripHomeState', value: nextTripState });

    roomState.unlockedRoomIds = [...roomState.unlockedRoomIds, roomId];
    roomState.selectedRoomId = roomId;
    await writeRoomStateInTx(roomState);

    return { ok: true, roomState, tripState: nextTripState };
  });
};

// 标定工具"应用到房间"：把这个房间的地板/障碍物配置（已经是百分比格式，
// 由调用方用 tripRoomGeometry.toPercentPolygon 转换好）整份存起来。
export const saveRoomFloorConfig = async (roomId, config) =>
  db.transaction('rw', db.settings, async () => {
    const state = await readRoomStateInTx();
    state.roomConfigs = { ...state.roomConfigs, [roomId]: config };
    await writeRoomStateInTx(state);
    return { ok: true, state };
  });

/* ---------- 留言板 ---------- */

export const BOARD_AUTHOR = {
  USER: 'user',
  CHARACTER: 'character',
};

export const listBoardPosts = async () => {
  const rows = await db.tripBoardPosts.toArray();
  return rows.sort((a, b) => b.createdAt - a.createdAt);
};

// 用户在留言板上贴一句话。status 固定是 'pending'——角色下次回来时那一次
// AI 调用会顺带回应（这部分是切片 C 的事，这里只负责把留言存好）。
export const addUserBoardPost = async (text) => {
  const trimmed = String(text || '').trim().slice(0, 120);
  if (!trimmed) return { ok: false, reason: 'empty' };

  const now = Date.now();

  return db.transaction('rw', db.tripBoardPosts, async () => {
    await db.tripBoardPosts.add({
      authorType: BOARD_AUTHOR.USER,
      authorResidentId: null,
      text: trimmed,
      status: 'pending',
      relatedJourneyId: null,
      createdAt: now,
    });

    // 只留最近 MAX_BOARD_POSTS 条，旧的物理删除（跟项目里 textGameMatches
    // "flat row, last N kept" 的惯例一样）。
    const all = await db.tripBoardPosts.orderBy('createdAt').reverse().toArray();
    const overflow = all.slice(MAX_BOARD_POSTS);
    if (overflow.length > 0) {
      await db.tripBoardPosts.bulkDelete(overflow.map((row) => row.id));
    }

    return { ok: true };
  });
};

/* ---------- 戳一戳台词池（照抄 pokeService.js 的 ensurePokeReplies 写法） ---------- */

const FALLBACK_TRIP_POKE_LINES = [
  '干嘛戳我～',
  '嗯？在叫我吗。',
  '今天就想在家待着。',
  '别戳啦，怪痒的。',
  '有事直说，戳我做什么。',
];

const removeEmoji = (text = '') =>
  String(text)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .trim();

// resident.pokeLines 已经有内容就直接用；没有就按角色人设调一次 AI 生成
// 一个台词池（不分状态，就一个池子，设计里明确说了"台词不按状态分类"），
// 生成结果缓存回 db.tripResidents，以后不再调用 AI。角色记录在这里自己
// 查（调用方只有 resident 的话不用再额外去拿 character），角色已经被
// 删除时直接用通用兜底文案。
export const ensureResidentPokeLines = async (resident) => {
  const cached = Array.isArray(resident?.pokeLines)
    ? resident.pokeLines.filter((line) => typeof line === 'string' && line.trim())
    : [];
  if (cached.length >= 3) return cached;

  try {
    const character = resident?.characterId != null ? await db.characters.get(resident.characterId) : null;
    if (!character) return FALLBACK_TRIP_POKE_LINES;

    const apiSetting = await db.settings.get('apiConfig');
    const apiConfig = apiSetting?.value || {};
    if (!apiConfig.baseUrl || !apiConfig.apiKey) return FALLBACK_TRIP_POKE_LINES;

    const baseUrl = String(apiConfig.baseUrl).replace(/\/$/, '');

    const systemPrompt = `你正在扮演角色：${character.name}。

角色设定：
${character.bio || '无'}

补充设定：
${character.extraNotes || '无'}

这个角色现在住在用户的"旅行小屋"里，平时就在屋子里晃悠、偶尔出门旅行。
用户会不定期在屋子里"戳一戳"TA（一种很轻的逗弄式互动，不是正式对话，
TA不知道自己马上要被戳，也不是在等用户）。请给出 6 到 10 句这个角色被
戳一下时，第一人称脱口而出的即时反应，要符合人设语气，内容贴近"在家
待着的日常小事"（发呆、犯懒、想吃的、想出门、刚睡醒之类），不要提到
具体某一次旅行或某个人名，彼此之间语气可以有变化。

严格要求：
- 只输出合法 JSON 数组，形如 ["...", "...", "..."]；
- 每一句 4 到 16 个汉字之间；
- 不使用 Emoji；
- 不要输出 Markdown、代码块围栏、编号或任何多余说明，只输出这个 JSON 数组本身。`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: apiConfig.model || 'gpt-3.5-turbo',
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.9,
      }),
    });

    if (!response.ok) return FALLBACK_TRIP_POKE_LINES;

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content || '';
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    const lines = Array.isArray(parsed)
      ? parsed.map((line) => removeEmoji(line).slice(0, 20)).filter(Boolean).slice(0, 10)
      : [];

    if (lines.length < 3) return FALLBACK_TRIP_POKE_LINES;

    if (resident?.id) {
      await db.tripResidents.update(resident.id, { pokeLines: lines });
    }

    return lines;
  } catch (error) {
    console.warn('[TripRoomService] 戳一戳台词生成失败，先用通用文案顶上。', error);
    return FALLBACK_TRIP_POKE_LINES;
  }
};

export const pickPokeLine = (lines) => {
  const list = Array.isArray(lines) && lines.length > 0 ? lines : FALLBACK_TRIP_POKE_LINES;
  return list[Math.floor(Math.random() * list.length)];
};