// src/apps/imagestudio/artistTagService.js
//
// 画师串存储站的增删改查。每条记录是一串画师标签（比如 "artist:xxx, artist:yyy"），
// 用户可以存很多条，勾选其中一条或几条"启用"，生图时按创建顺序拼进提示词。
//
// 思路参照 rpPresets：一张全局共享的小库，表里只建真正要查询的索引字段。
// enabled 故意不建索引——Dexie 不能把布尔值当索引键查询，启用的条目数量很少，
// 直接读出来在内存里过滤就行。
//
// 表定义见 src/db/index.js 的 db.version(82)：
//   artistTagPresets: '++id, name, createdAt, updatedAt'
// 记录字段：{ id, name, tags, enabled, createdAt, updatedAt }

import db from '../../db';
import { joinPromptParts } from './imageGenRules';

/**
 * 全部画师串，按创建时间从早到晚（也就是拼提示词时的顺序）。
 */
export const getAllArtistTagPresets = async () => {
  try {
    return await db.artistTagPresets.orderBy('createdAt').toArray();
  } catch (error) {
    console.warn('[ImageStudio] 读取画师串失败：', error);
    return [];
  }
};

export const createArtistTagPreset = async ({ name, tags, enabled = false }) => {
  const cleanName = String(name || '').trim();
  const cleanTags = String(tags || '').trim();

  if (!cleanName || !cleanTags) return null;

  const nowIso = new Date().toISOString();

  return db.artistTagPresets.add({
    name: cleanName,
    tags: cleanTags,
    enabled: Boolean(enabled),
    createdAt: nowIso,
    updatedAt: nowIso,
  });
};

/**
 * 只允许改 name / tags / enabled 三个字段，别的字段传进来也忽略。
 */
export const updateArtistTagPreset = async (id, patch) => {
  if (!id) return;

  const next = { updatedAt: new Date().toISOString() };

  if (typeof patch?.name === 'string') next.name = patch.name.trim();
  if (typeof patch?.tags === 'string') next.tags = patch.tags.trim();
  if (typeof patch?.enabled === 'boolean') next.enabled = patch.enabled;

  await db.artistTagPresets.update(id, next);
};

export const setArtistTagPresetEnabled = async (id, enabled) =>
  updateArtistTagPreset(id, { enabled: Boolean(enabled) });

export const deleteArtistTagPreset = async (id) => {
  if (!id) return;
  await db.artistTagPresets.delete(id);
};

/**
 * 当前启用的所有画师串拼成一整段（按创建顺序，逗号分隔）。
 * 没有启用任何一条时返回空字符串。切片B拼最终提示词时直接用这个。
 */
export const getEnabledArtistTagString = async () => {
  const all = await getAllArtistTagPresets();
  return joinPromptParts(all.filter((item) => item.enabled).map((item) => item.tags));
};

export default {
  getAllArtistTagPresets,
  createArtistTagPreset,
  updateArtistTagPreset,
  setArtistTagPresetEnabled,
  deleteArtistTagPreset,
  getEnabledArtistTagString,
};