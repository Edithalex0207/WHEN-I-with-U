// src/apps/fiction/fictionService.js
//
// 互动文游的数据层：存档（fictionSaves）、剧情节点（fictionNodes）的增删改查。
// 配图相关的两张表（fictionImages 元数据 / fictionImageFiles Blob 本体）
// 这一轮只在删除存档时用到，读写图片留到第 7 轮。
//
// 两条约定，写代码时容易忘：
// 1. 开场节点的 parentId 用 ROOT_PARENT_ID（0），不用 null。
//    IndexedDB 的索引键不能是 null，parentId 为 null 的记录不会进
//    parentId 索引，也不会进 [saveId+parentId] 复合索引，按父节点查子节点时会漏掉开场。
// 2. 所有时间戳都存毫秒数（Date.now()），updatedAt 要拿来排序。

import db from '../../db';

export const FICTION_MODES = {
  CHOICE: 'choice',
  NOVEL: 'novel',
};

export const FICTION_IMAGE_MODES = {
  OFF: 'off',
  MANUAL: 'manual',
  AUTO: 'auto',
};

export const ROOT_PARENT_ID = 0;

const now = () => Date.now();

// ---------- 存档 ----------

export const buildBlankSave = (overrides = {}) => ({
  mode: FICTION_MODES.CHOICE,
  title: '未命名故事',
  background: '',
  outline: '',
  style: { presetId: '', custom: '' },
  wordMin: 2000,
  optionMin: 3,
  allowFreeInput: true,
  showDeltas: false,
  imageMode: FICTION_IMAGE_MODES.OFF,
  worldBookIds: [],
  localEntries: [],
  persona: null,
  mainCharacter: null,
  importedCharacters: [],
  npcs: [],
  stats: [],
  currentNodeId: null,
  coverImageId: null,
  ...overrides,
});

export const createSave = async (data = {}) => {
  const timestamp = now();

  return db.fictionSaves.add({
    ...buildBlankSave(data),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
};

export const getSave = (saveId) => db.fictionSaves.get(saveId);

export const updateSave = async (saveId, patch) => {
  await db.fictionSaves.update(saveId, { ...patch, updatedAt: now() });
};

// 只刷新「最近游玩」时间，不改别的字段。
export const touchSave = (saveId) => updateSave(saveId, {});

export const listSaves = () => db.fictionSaves.orderBy('updatedAt').reverse().toArray();

// 删除存档：节点、配图元数据、配图本体一起删，放在同一个事务里，
// 要么全删要么都不动，不会留下找不到存档的孤儿节点。
export const deleteSave = async (saveId) => {
  await db.transaction(
    'rw',
    db.fictionSaves,
    db.fictionNodes,
    db.fictionImages,
    db.fictionImageFiles,
    async () => {
      const images = await db.fictionImages.where('saveId').equals(saveId).toArray();
      const fileIds = images.map((image) => image.fileId).filter((id) => id != null);

      if (fileIds.length > 0) await db.fictionImageFiles.bulkDelete(fileIds);

      await db.fictionImages.where('saveId').equals(saveId).delete();
      await db.fictionNodes.where('saveId').equals(saveId).delete();
      await db.fictionSaves.delete(saveId);
    },
  );
};

// ---------- 节点 ----------

export const createNode = async (saveId, data) => {
  const timestamp = now();

  return db.fictionNodes.add({
    parentId: ROOT_PARENT_ID,
    userAction: null,
    actionKey: '',
    text: '',
    options: [],
    statsSnapshot: {},
    imageIds: [],
    isSavePoint: false,
    savePointName: '',
    chapter: 1,
    summaryText: '',
    ...data,
    saveId,
    createdAt: timestamp,
  });
};

export const getNode = (nodeId) => db.fictionNodes.get(nodeId);

export const updateNode = (nodeId, patch) => db.fictionNodes.update(nodeId, patch);

export const listNodesBySave = (saveId) => db.fictionNodes.where('saveId').equals(saveId).toArray();

export const listChildren = (saveId, parentId) => (
  db.fictionNodes.where('[saveId+parentId]').equals([saveId, parentId]).toArray()
);

// 从某个节点一路往上走到开场，返回从开场到该节点的顺序数组。
// 提示词组装、故事线、回看都靠它取「当前路径」。
export const getPathToNode = async (nodeId) => {
  const path = [];
  const seen = new Set();
  let cursor = nodeId ? await db.fictionNodes.get(nodeId) : null;

  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.push(cursor);
    cursor = cursor.parentId === ROOT_PARENT_ID ? null : await db.fictionNodes.get(cursor.parentId);
  }

  return path.reverse();
};

// ---------- 书架用的汇总 ----------

// 段数 = 当前路径长度；分支数 = 同一父节点下「不同 actionKey」的个数减一，
// 累加。actionKey 相同的是重 roll 版本，不算分支。
// 注意：这里会把存档的全部节点读出来（含正文）。第一轮存档都是空的没问题，
// 到第 3 轮节点变多之后，改成在存档上冗余 segmentCount / branchCount 两个数字。
const summarizeNodes = (save, nodes) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set();
  let segmentCount = 0;
  let cursor = save.currentNodeId ? byId.get(save.currentNodeId) : null;

  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    segmentCount += 1;
    cursor = byId.get(cursor.parentId);
  }

  const keysByParent = new Map();

  nodes.forEach((node) => {
    const keys = keysByParent.get(node.parentId) || new Set();

    keys.add(node.actionKey || `#${node.id}`);
    keysByParent.set(node.parentId, keys);
  });

  let branchCount = 0;

  keysByParent.forEach((keys) => {
    branchCount += Math.max(0, keys.size - 1);
  });

  return { segmentCount, branchCount };
};

export const listSaveSummaries = async () => {
  const saves = await listSaves();

  return Promise.all(saves.map(async (save) => {
    const nodes = await listNodesBySave(save.id);

    return { ...save, ...summarizeNodes(save, nodes) };
  }));
};

export default {
  FICTION_MODES,
  FICTION_IMAGE_MODES,
  ROOT_PARENT_ID,
  buildBlankSave,
  createSave,
  getSave,
  updateSave,
  touchSave,
  listSaves,
  deleteSave,
  createNode,
  getNode,
  updateNode,
  listNodesBySave,
  listChildren,
  getPathToNode,
  listSaveSummaries,
};