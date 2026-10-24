// src/apps/location/characterPlaceService.js
//
// 角色地图：角色自己提到/决定去了的地方。跟 placeService.js 的用户真实
// GPS 地点表（db.places）完全独立、不共享任何数据——这边没有经纬度，
// 也不依赖定位权限，纯粹是角色自己说的"我去了哪"，由
// characterPlaceSession.js 在角色主动触发后写入。
//
// 数据形状特意跟 db.places / db.placeMemories 对齐（visitCount /
// firstVisitAt / lastVisitAt，还有按地点挂一条条小记录的
// characterPlaceMemories 表），因为 UI 要做成跟地点小册子同一个质感的
// 姊妹页，数据模型越像，两边写法差异越小越好维护。

import db from '../../db';

const nowIso = () => new Date().toISOString();

// 判断"是不是同一个地方"时忽略空白和标点，并且互相包含也算一致——
// 跟 bubbleStyleSession.js 的 findByName 同一个思路，避免角色这次写
// "常去的那家咖啡馆"、上次写"咖啡馆"就被当成两个不同地方。
const normalizeForCompare = (text) => (
  String(text || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
);

const cleanText = (raw, maxChars) => (
  Array.from(
    String(raw ?? '')
      .replace(/[\p{Extended_Pictographic}️]/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .slice(0, maxChars)
    .join('')
);

export const CHARACTER_PLACE_REVIEW_MAX_CHARS = 60;
export const CHARACTER_PLACE_MOOD_MAX_CHARS = 12;
export const CHARACTER_PLACE_USER_COMMENT_MAX_CHARS = 120;

export const listCharacterPlaces = async (chatId) => {
  const list = await db.characterPlaces.where('chatId').equals(chatId).toArray();

  return list.sort((a, b) => (
    String(b.lastVisitAt).localeCompare(String(a.lastVisitAt))
  ));
};

export const listCharacterPlaceMemories = async (placeId) => {
  const list = await db.characterPlaceMemories.where('placeId').equals(placeId).toArray();

  return list.sort((a, b) => (
    String(b.createdAt).localeCompare(String(a.createdAt)) || (b.id - a.id)
  ));
};

const findExistingPlace = async (chatId, rawName) => {
  const name = normalizeForCompare(rawName);
  if (!name) return null;

  const places = await db.characterPlaces.where('chatId').equals(chatId).toArray();

  return places.find((place) => {
    const existing = normalizeForCompare(place.name);
    return existing === name || existing.includes(name) || name.includes(existing);
  }) || null;
};

/**
 * 角色这次说去了/提到了一个地方：按名字模糊匹配这个聊天窗已有的角色
 * 地点，匹配上就算"又来了一次"（visitCount+1），匹配不上就新建一条。
 * 返回 { place, isFirstVisit }，名字为空时返回 null。
 */
export const recordCharacterPlaceVisit = async ({ chatId, characterId, name }) => {
  const trimmed = cleanText(name, 20);
  if (!trimmed) return null;

  const timestamp = nowIso();
  const existing = await findExistingPlace(chatId, trimmed);

  if (existing) {
    await db.characterPlaces.update(existing.id, {
      lastVisitAt: timestamp,
      visitCount: (existing.visitCount || 1) + 1,
    });

    return {
      place: await db.characterPlaces.get(existing.id),
      isFirstVisit: false,
    };
  }

  const id = await db.characterPlaces.add({
    chatId,
    characterId,
    name: trimmed,
    visitCount: 1,
    firstVisitAt: timestamp,
    lastVisitAt: timestamp,
    createdAt: timestamp,
  });

  return {
    place: await db.characterPlaces.get(id),
    isFirstVisit: true,
  };
};

/** author: 'char' | 'user'。mood 只在 author 'char' 时有意义。 */
export const addCharacterPlaceMemory = async ({ chatId, placeId, author, text, mood = '' }) => {
  const maxChars = author === 'char'
    ? CHARACTER_PLACE_REVIEW_MAX_CHARS
    : CHARACTER_PLACE_USER_COMMENT_MAX_CHARS;

  const cleaned = cleanText(text, maxChars);
  if (!cleaned) return null;

  const timestamp = nowIso();
  const id = await db.characterPlaceMemories.add({
    chatId,
    placeId,
    author,
    text: cleaned,
    mood: author === 'char' ? cleanText(mood, CHARACTER_PLACE_MOOD_MAX_CHARS) : '',
    createdAt: timestamp,
  });

  return db.characterPlaceMemories.get(id);
};

export const deleteCharacterPlace = async (placeId) => {
  await db.characterPlaces.delete(placeId);
  await db.characterPlaceMemories.where('placeId').equals(placeId).delete();
};

export default {
  listCharacterPlaces,
  listCharacterPlaceMemories,
  recordCharacterPlaceVisit,
  addCharacterPlaceMemory,
  deleteCharacterPlace,
};