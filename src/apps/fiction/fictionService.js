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
//
// 第 3 轮起：存档上冗余 segmentCount（当前路径长度）和 branchCount（分支数）
// 两个数字，书架直接读它们，不再把全部节点读出来现算。凡是改动节点结构的
// 操作（新增节点、切换当前节点）都要在同一个事务里更新这两个数字。
// 分支数算法：同一父节点下「不同 actionKey」的个数减一，累加；
// actionKey 相同的是重 roll 版本，不算分支。

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
  segmentCount: 0,
  branchCount: 0,
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

export const hasChildren = async (saveId, nodeId) => (
  (await db.fictionNodes.where('[saveId+parentId]').equals([saveId, nodeId]).count()) > 0
);

// 开场节点（可能有多个，那是重 roll 出来的版本，取最早的一个）。
export const getRootNode = async (saveId) => {
  const roots = await listChildren(saveId, ROOT_PARENT_ID);

  return roots.sort((a, b) => a.id - b.id)[0] || null;
};

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

// 路径长度（只数节点个数，不把正文读出来之外的东西带走）。
const countPathLength = async (nodeId) => (await getPathToNode(nodeId)).length;

/**
 * 新增一个节点，并把它设为存档的当前节点。节点写入和存档上
 * currentNodeId / segmentCount / branchCount 的更新在同一个事务里，
 * 要么都成功要么都不动。返回新节点的 id。
 *
 * data 里至少要有 parentId（开场用 ROOT_PARENT_ID）和 actionKey。
 */
export const appendNode = (saveId, data) => (
  db.transaction('rw', db.fictionSaves, db.fictionNodes, async () => {
    const save = await db.fictionSaves.get(saveId);

    if (!save) throw new Error('存档不存在');

    const parentId = data.parentId ?? ROOT_PARENT_ID;
    const actionKey = data.actionKey || '';

    const siblings = await listChildren(saveId, parentId);
    const isNewBranch = siblings.length > 0 && !siblings.some((node) => (node.actionKey || '') === actionKey);

    const depth = parentId === ROOT_PARENT_ID ? 1 : (await countPathLength(parentId)) + 1;

    const nodeId = await createNode(saveId, { ...data, parentId, actionKey });

    await db.fictionSaves.update(saveId, {
      currentNodeId: nodeId,
      segmentCount: depth,
      branchCount: (save.branchCount || 0) + (isNewBranch ? 1 : 0),
      updatedAt: now(),
    });

    return nodeId;
  })
);

// 回退 / 切换到某个节点：更新当前节点和段数。分支数不变（节点都还在）。
export const setCurrentNode = (saveId, nodeId) => (
  db.transaction('rw', db.fictionSaves, db.fictionNodes, async () => {
    const node = await db.fictionNodes.get(nodeId);

    if (!node || node.saveId !== saveId) throw new Error('节点不存在');

    await db.fictionSaves.update(saveId, {
      currentNodeId: nodeId,
      segmentCount: await countPathLength(nodeId),
      updatedAt: now(),
    });
  })
);

// 兜底：把存档的 segmentCount / branchCount 按全部节点重新算一遍。
// 平时不用调用（增量更新就够了）；删除节点或数据对不上时用。
export const recomputeSaveCounters = (saveId) => (
  db.transaction('rw', db.fictionSaves, db.fictionNodes, async () => {
    const save = await db.fictionSaves.get(saveId);

    if (!save) return;

    const nodes = await listNodesBySave(saveId);
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

    await db.fictionSaves.update(saveId, {
      segmentCount: save.currentNodeId ? await countPathLength(save.currentNodeId) : 0,
      branchCount,
    });
  })
);

// ---------- 书架用的汇总 ----------

// 段数、分支数都直接读存档上的冗余字段；第 2 轮之前建的存档没有这两个字段，补 0。
export const listSaveSummaries = async () => {
  const saves = await listSaves();

  return saves.map((save) => ({
    ...save,
    segmentCount: save.segmentCount || 0,
    branchCount: save.branchCount || 0,
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
  hasChildren,
  getRootNode,
  getPathToNode,
  appendNode,
  setCurrentNode,
  recomputeSaveCounters,
  listSaveSummaries,
};