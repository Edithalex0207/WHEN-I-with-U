// src/apps/footprintMap/footprintMapService.js
//
// 足迹地图的数据层：只读，不新建表、不写入任何东西。
// 全部数据来自已有的三张表：
//   places          地点本身（名字、坐标、到访次数、聊天时段统计）
//   placeMemories   "这里发生过的事"，author 是 'user' 或 'char'
//   locationSettings 每个聊天窗有没有开定位
//
// 这个文件只负责把它们拼成地图页需要的形状，定位抓取、地点归类、
// 小记录的增删改查仍然全部在 src/apps/location/ 里，这里一个都不动。

import db from '../../db';
import { listPlaces } from '../location/placeService';
import { listPlaceMemories } from '../location/placeMemoryService';
import { getChatPattern } from '../location/placePatternService';

// 图钉颜色是固定的，不跟主题：酒红 = 我留下的，蓝 = 角色留下的。
export const PIN_COLOR_USER = '#8e1f2f';
export const PIN_COLOR_CHAR = '#2c4a6b';

// 第一次打开时的隐私说明页，同意之后写进 db.settings，之后不再出现。
export const FOOTPRINT_CONSENT_KEY = 'footprintMapConsent';

export const FOOTPRINT_FILTERS = {
  ALL: 'all',
  ME: 'me',
  CHAR: 'char',
};

export const getFootprintConsent = async () => {
  try {
    const row = await db.settings.get(FOOTPRINT_CONSENT_KEY);

    return Boolean(row?.value?.agreed);
  } catch (error) {
    console.warn('[FootprintMap] 读取隐私同意状态失败：', error);
    return false;
  }
};

export const saveFootprintConsent = async () => {
  await db.settings.put({
    key: FOOTPRINT_CONSENT_KEY,
    value: { agreed: true, agreedAt: new Date().toISOString() },
  });
};

// 底图（CARTO）要求每个人用自己的免费 key，只存在本机的 db.settings 里，不写死在代码中。
export const FOOTPRINT_MAP_KEY_SETTING = 'footprintMapKey';
const FOOTPRINT_MAP_KEY_MAX_CHARS = 200;

export const getFootprintMapKey = async () => {
  try {
    const row = await db.settings.get(FOOTPRINT_MAP_KEY_SETTING);

    return typeof row?.value?.key === 'string' ? row.value.key : '';
  } catch (error) {
    console.warn('[FootprintMap] 读取底图 key 失败：', error);
    return '';
  }
};

// 返回清理过的 key（去掉所有空白、限制长度）；传空就是清除。
export const saveFootprintMapKey = async (raw) => {
  const key = String(raw ?? '').replace(/\s+/g, '').slice(0, FOOTPRINT_MAP_KEY_MAX_CHARS);

  if (!key) {
    await db.settings.delete(FOOTPRINT_MAP_KEY_SETTING);

    return '';
  }

  await db.settings.put({
    key: FOOTPRINT_MAP_KEY_SETTING,
    value: { key, savedAt: new Date().toISOString() },
  });

  return key;
};

const toTime = (iso) => {
const time = new Date(iso).getTime();

  return Number.isFinite(time) ? time : 0;
};

// "昨天 / 3 天前 / 上个月 / 3 周前" 这种口语化的相对时间。
export const formatRelativeTime = (iso, now = Date.now()) => {
  const time = toTime(iso);

  if (!time) return '';

  const days = Math.floor((now - time) / (24 * 60 * 60 * 1000));

  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.max(1, Math.floor(days / 30))} 个月前`;

  return `${Math.floor(days / 365)} 年前`;
};

/**
 * 选聊天窗那一页的数据：每个聊天窗一行。
 * enabled 为 false（没开定位）的聊天窗在页面上灰色、不能点。
 */
export const loadFootprintChats = async () => {
  const [chats, characters, settingsRows, places] = await Promise.all([
    db.chats.orderBy('updatedAt').reverse().toArray(),
    db.characters.toArray(),
    db.locationSettings.toArray(),
    db.places.filter((place) => place.isNamed).toArray(),
  ]);

  const characterById = new Map(characters.map((character) => [character.id, character]));
  const settingsByChat = new Map(settingsRows.map((row) => [row.chatId, row]));

  const placesByChat = new Map();

  places.forEach((place) => {
    const list = placesByChat.get(place.chatId) || [];

    list.push(place);
    placesByChat.set(place.chatId, list);
  });

  return chats.map((chat) => {
    const character = characterById.get(chat.characterId);
    const chatPlaces = placesByChat.get(chat.id) || [];
    const latest = chatPlaces.reduce(
      (max, place) => Math.max(max, toTime(place.lastVisitAt)),
      0,
    );

    return {
      chatId: chat.id,
      name: character?.name || chat.title || '未命名',
      enabled: Boolean(settingsByChat.get(chat.id)?.enabled),
      placeCount: chatPlaces.length,
      lastVisitAt: latest ? new Date(latest).toISOString() : '',
    };
  });
};

/**
 * 一个聊天窗的全部图钉。
 *
 * kinds 决定图钉颜色和筛选：
 *   这个地点下有用户写的小记录   -> 包含 'user'
 *   这个地点下有角色写的小记录   -> 包含 'char'
 *   一条小记录都没有（自动识别出来的地点）-> 算用户自己去过的，只有 'user'
 * 两者都有时，图钉是酒红色，右上角带一个小蓝点。
 */
export const loadFootprintPlaces = async (chatId) => {
  const [places, memories] = await Promise.all([
    listPlaces(chatId),
    db.placeMemories.where('chatId').equals(chatId).toArray(),
  ]);

  const authorsByPlace = new Map();

  memories.forEach((memory) => {
    const set = authorsByPlace.get(memory.placeId) || new Set();

    set.add(memory.author === 'char' ? 'char' : 'user');
    authorsByPlace.set(memory.placeId, set);
  });

  // 编号按"第一次来这里"的先后顺序固定下来，这样以后新增地点不会让旧编号乱掉。
  const numbered = [...places]
    .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng))
    .sort((a, b) => (
      toTime(a.firstVisitAt) - toTime(b.firstVisitAt) || (a.id - b.id)
    ))
    .map((place, index) => {
      const authors = authorsByPlace.get(place.id);
      const kinds = authors && authors.size > 0 ? Array.from(authors) : ['user'];

      return {
        id: place.id,
        no: index + 1,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        note: place.note || '',
        visitCount: Number(place.visitCount) || 0,
        lastVisitAt: place.lastVisitAt || '',
        tendency: getChatPattern(place)?.tendency || '',
        kinds,
        memoryCount: memories.filter((memory) => memory.placeId === place.id).length,
      };
    });

  return numbered;
};

// 图钉用哪种颜色：只有角色留下过 -> 蓝，其余都是酒红。
export const getPinColor = (kinds) => (
  kinds.length === 1 && kinds[0] === 'char' ? PIN_COLOR_CHAR : PIN_COLOR_USER
);

export const isPlaceVisibleForFilter = (place, filter) => {
  if (filter === FOOTPRINT_FILTERS.ME) return place.kinds.includes('user');
  if (filter === FOOTPRINT_FILTERS.CHAR) return place.kinds.includes('char');

  return true;
};

/** 详情页里"这里发生过的事"，最新的在前面。 */
export const loadFootprintMemories = async (placeId) => {
  const list = await listPlaceMemories(placeId);

  return list.map((memory) => ({
    id: memory.id,
    author: memory.author === 'char' ? 'char' : 'user',
    text: memory.text,
    createdAt: memory.createdAt,
  }));
};

export default {
  getFootprintConsent,
  getFootprintMapKey,
    saveFootprintConsent,
  saveFootprintMapKey,
  formatRelativeTime,
  loadFootprintChats,
  loadFootprintPlaces,
  loadFootprintMemories,
  getPinColor,
  isPlaceVisibleForFilter,
};