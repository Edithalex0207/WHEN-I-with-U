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
// 记录字段：{ id, name, remark, tags, enabled, createdAt, updatedAt }
// remark 是用户自己写的备注（可选、不建索引），旧记录没有这个字段时当作空字符串。

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

export const createArtistTagPreset = async ({ name, tags, remark = '', enabled = false }) => {
  const cleanName = String(name || '').trim();
  const cleanTags = String(tags || '').trim();

  if (!cleanName || !cleanTags) return null;

  const nowIso = new Date().toISOString();

  return db.artistTagPresets.add({
    name: cleanName,
    tags: cleanTags,
    remark: String(remark || '').trim(),
    enabled: Boolean(enabled),
    createdAt: nowIso,
    updatedAt: nowIso,
  });
};

/**
 * 只允许改 name / tags / remark / enabled 四个字段，别的字段传进来也忽略。
 */
export const updateArtistTagPreset = async (id, patch) => {
  if (!id) return;

  const next = { updatedAt: new Date().toISOString() };

  if (typeof patch?.name === 'string') next.name = patch.name.trim();
  if (typeof patch?.tags === 'string') next.tags = patch.tags.trim();
  if (typeof patch?.remark === 'string') next.remark = patch.remark.trim();
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

// 这些词出现在冒号前面时是标签自己的命名空间（artist:xxx），不是用户起的名称。
const TAG_NAMESPACES = [
  'artist',
  'character',
  'copyright',
  'series',
  'style',
  'model',
  'rating',
  'general',
  'meta',
  'species',
  'year',
];

const MAX_NAME_LENGTH = 24;

/**
 * 判断冒号前面的这段是不是用户写的名称。
 * 不是名称的情况：为空、太长、带逗号、带括号 / 花括号 / 尖括号 / 竖线、纯数字（权重写法 1.2::xxx）、
 * 或者是 artist 这类标签命名空间。
 */
const looksLikeName = (prefix) => {
  const text = prefix.trim();
  if (!text || text.length > MAX_NAME_LENGTH) return false;
  if (/[,，{}\[\]()（）<>|]/.test(text)) return false;
  if (/^[\d.+-]+$/.test(text)) return false;
  if (TAG_NAMESPACES.includes(text.toLowerCase())) return false;
  return true;
};

/**
 * 解析批量导入的文本：每个非空行是一条画师串。
 * 行里写了"名称：标签"（中文或英文冒号都行，取第一个能判断为名称的冒号）就拆出名称，
 * 否则整行当标签，名称自动编号为"导入 003"（编号接在已有数量之后）。
 * 纯函数，不碰数据库，导入弹窗用它做识别预览。
 *
 * 返回 [{ name, tags, autoNamed }]
 */
export const parseArtistTagBulkText = (text, existingCount = 0) => {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    let name = '';
    let tags = line;

    const colonAt = line.search(/[:：]/);
    if (colonAt > 0) {
      const prefix = line.slice(0, colonAt);
      const rest = line.slice(colonAt + 1).replace(/^[:：]+/, '').trim();
      if (rest && looksLikeName(prefix)) {
        name = prefix.trim();
        tags = rest;
      }
    }

    const autoNamed = !name;
    if (autoNamed) name = `导入 ${String(existingCount + index + 1).padStart(3, '0')}`;

    return { name, tags, autoNamed };
  });
};

/**
 * 把解析好的若干条一次性写进库，默认全部未启用。
 * createdAt 逐条错开 1 毫秒，保证拼提示词时的顺序跟粘贴的顺序一致。
 * 返回导入的条数。
 */
export const importArtistTagPresets = async (entries) => {
  const list = (entries || []).filter((item) => item?.name && item?.tags);
  if (list.length === 0) return 0;

  const base = Date.now();

  await db.artistTagPresets.bulkAdd(
    list.map((item, index) => {
      const iso = new Date(base + index).toISOString();
      return {
        name: String(item.name).trim(),
        tags: String(item.tags).trim(),
        remark: '',
        enabled: false,
        createdAt: iso,
        updatedAt: iso,
      };
    })
  );

  return list.length;
};

export default {
  parseArtistTagBulkText,
  importArtistTagPresets,
  getAllArtistTagPresets,
  createArtistTagPreset,
  updateArtistTagPreset,
  setArtistTagPresetEnabled,
  deleteArtistTagPreset,
  getEnabledArtistTagString,
};