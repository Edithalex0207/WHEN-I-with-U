// src/apps/fiction/fictionStoryTree.js
//
// 故事线的分支树布局（纯函数，不碰数据库，可以脱离浏览器测试）。
//
// 输入是一份存档的全部节点和当前节点 id，输出是「每个点放在第几列、第几行」。
//
// 几个约定：
// 1. 版本不单独画点。同一个父节点下 actionKey 相同的节点是重 roll 出来的版本，
//    合成一个「组」画一个点，点上标「N 个版本」。
// 2. 一个组的父组 = 它的父节点所在的组。父节点有多个版本时，各个版本的后续
//    都挂在同一个父组下面。
// 3. 当前路径（从开场到当前节点）永远排在第 0 列；每个分叉处，其余的后续各开一个
//    新列，列号只增不复用，所以不同分支之间不会重叠。
// 4. 行 = 段数：开场在第 1 行，往下一行加一。
//
// 每个组选一个「代表节点」，点它就回到这个节点：优先取在当前路径上的版本，
// 其次取被接着玩过的版本，最后取最新的版本。

export const ROOT_PARENT_ID = 0;

const groupKeyOf = (node) => `${node.parentId}|${node.actionKey || `#${node.id}`}`;

export const buildStoryTree = (nodes, currentNodeId) => {
  const list = Array.isArray(nodes) ? [...nodes].sort((a, b) => a.id - b.id) : [];
  const byId = new Map(list.map((node) => [node.id, node]));
  const hasChild = new Set(list.map((node) => node.parentId));

  // 当前路径上的节点 id 和组 key
  const pathIds = new Set();
  const pathKeys = new Set();
  let cursor = byId.get(currentNodeId);

  while (cursor && !pathIds.has(cursor.id)) {
    pathIds.add(cursor.id);
    pathKeys.add(groupKeyOf(cursor));
    cursor = cursor.parentId === ROOT_PARENT_ID ? null : byId.get(cursor.parentId);
  }

  // 分组
  const groups = new Map();

  list.forEach((node) => {
    const key = groupKeyOf(node);
    let group = groups.get(key);

    if (!group) {
      const parent = node.parentId === ROOT_PARENT_ID ? null : byId.get(node.parentId);

      group = { key, parentKey: parent ? groupKeyOf(parent) : null, nodes: [], minId: node.id };
      groups.set(key, group);
    }

    group.nodes.push(node);
  });

  const childrenOf = new Map();
  const roots = [];

  groups.forEach((group) => {
    if (group.parentKey === null) {
      roots.push(group);
      return;
    }

    const siblings = childrenOf.get(group.parentKey) || [];

    siblings.push(group);
    childrenOf.set(group.parentKey, siblings);
  });

  // 当前路径上的先排，其余按创建顺序
  const byPathThenAge = (a, b) => (
    (Number(pathKeys.has(b.key)) - Number(pathKeys.has(a.key))) || (a.minId - b.minId)
  );

  const items = [];
  let nextLane = 1;
  let depthMax = 0;

  const pickRep = (group) => {
    const onPath = group.nodes.find((node) => pathIds.has(node.id));

    if (onPath) return onPath;

    const played = group.nodes.filter((node) => hasChild.has(node.id));

    return played.length > 0 ? played[played.length - 1] : group.nodes[group.nodes.length - 1];
  };

  const place = (group, lane, depth) => {
    const rep = pickRep(group);
    const savePoint = group.nodes.find((node) => node.isSavePoint);
    const kids = (childrenOf.get(group.key) || []).slice().sort(byPathThenAge);

    depthMax = Math.max(depthMax, depth);

    items.push({
      key: group.key,
      parentKey: group.parentKey,
      nodeId: rep.id,
      versionIds: group.nodes.map((node) => node.id),
      versionCount: group.nodes.length,
      depth,
      lane,
      onPath: pathKeys.has(group.key),
      isCurrent: rep.id === currentNodeId,
      hasChildren: kids.length > 0,
      label: rep.parentId === ROOT_PARENT_ID ? '开场' : (rep.userAction?.text || '继续'),
      isSavePoint: Boolean(savePoint),
      savePointName: savePoint?.savePointName || '',
      saveNodeId: savePoint ? savePoint.id : rep.id,
    });

    kids.forEach((kid, index) => {
      place(kid, index === 0 ? lane : nextLane++, depth + 1);
    });
  };

  roots.sort(byPathThenAge).forEach((root, index) => {
    place(root, index === 0 ? 0 : nextLane++, 1);
  });

  // 分支数：每个分叉处「不同行动的个数 − 1」之和（和存档上的 branchCount 同一算法）
  let branchCount = Math.max(0, roots.length - 1);

  childrenOf.forEach((kids) => {
    branchCount += Math.max(0, kids.length - 1);
  });

  return {
    items,
    branchCount,
    laneCount: Math.max(1, nextLane),
    depthMax,
    currentItem: items.find((item) => item.isCurrent) || null,
  };
};

export default { ROOT_PARENT_ID, buildStoryTree };