// src/apps/fiction/FictionStoryline.jsx
//
// 故事线：整棵剧情树。主线竖着排在最左一列，分支各占右边一列。
//   - 点一个点 → 底部抽屉：版本数 / 当前位置 / 节选 / 另开分支 / 命名存档点 / 回看
//   - 另开分支 = 回到那一段，再选一个不同的行动，新的行动就是一条新分支
//     （数值不用管：每个节点都存着自己的数值快照，回去自然就是当时的数值）
//   - 重 roll 出来的版本合成一个点，点上标「N 个版本」
//
// 它盖在游玩页上面（absolute，不是 fixed），游玩页的状态不会丢。
// 布局算法在 fictionStoryTree.js（纯函数）。

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Flag, X } from 'lucide-react';

import {
  SAVE_POINT_NAME_MAX,
  clearSavePoint,
  listNodesBySave,
  setSavePoint,
} from './fictionService';
import { buildStoryTree } from './fictionStoryTree';
import './fictionStory.css';

const LANE_W = 116;
const ROW_H = 64;
const PAD_X = 20;
const PAD_TOP = 12;
const NODE_H = 48;
const NODE_W = 104;
const DOT = 14;
const LABEL_MAX = 12;
const EXCERPT_MAX = 100;

const clip = (text, max) => {
  const chars = Array.from(String(text || '').replace(/\s+/g, ' ').trim());

  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
};

const FictionStoryline = ({
  save,
  currentNodeId,
  onClose,
  onJump,
  onReveal,
}) => {
  const [nodes, setNodes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [naming, setNaming] = useState(false);
  const [nameText, setNameText] = useState('');
  const [message, setMessage] = useState('');
  const scrollRef = useRef(null);
  const centeredRef = useRef(false);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const list = await listNodesBySave(save.id);

        if (alive) setNodes(list);
      } catch (loadError) {
        console.warn('[Fiction] 读取故事线失败：', loadError);
        if (alive) setMessage('读取故事线失败，请关掉再打开一次。');
      } finally {
        if (alive) setLoaded(true);
      }
    };

    void load();

    return () => {
      alive = false;
    };
  }, [save.id]);

  const tree = useMemo(() => buildStoryTree(nodes, currentNodeId), [nodes, currentNodeId]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const itemByKey = useMemo(() => new Map(tree.items.map((item) => [item.key, item])), [tree]);

  // 当前路径上的节点 id（用来找「这一段后面你实际走了哪个行动」）
  const pathIds = useMemo(() => {
    const ids = new Set();
    let cursor = nodeById.get(currentNodeId);

    while (cursor && !ids.has(cursor.id)) {
      ids.add(cursor.id);
      cursor = nodeById.get(cursor.parentId);
    }

    return ids;
  }, [nodeById, currentNodeId]);

  const showNext = Boolean(tree.currentItem) && !tree.currentItem.hasChildren;
  const rows = tree.depthMax + (showNext ? 1 : 0);
  const canvasW = PAD_X * 2 + tree.laneCount * LANE_W;
  const canvasH = PAD_TOP * 2 + Math.max(1, rows) * ROW_H;

  const nodeLeft = (lane) => PAD_X + lane * LANE_W;
  const nodeTop = (depth) => PAD_TOP + (depth - 1) * ROW_H;
  const dotX = (lane) => nodeLeft(lane) + 4 + DOT / 2;
  const dotY = (depth) => nodeTop(depth) + NODE_H / 2;

  // 打开时把当前位置滚到屏幕中间
  useEffect(() => {
    const box = scrollRef.current;
    const current = tree.currentItem;

    if (!loaded || !box || !current || centeredRef.current) return;

    centeredRef.current = true;
    box.scrollTo({
      top: Math.max(0, dotY(current.depth) - box.clientHeight / 2),
      left: Math.max(0, dotX(current.lane) - box.clientWidth / 2),
    });
  }, [loaded, tree]);

  const selected = selectedKey ? itemByKey.get(selectedKey) : null;
  const selectedNode = selected ? nodeById.get(selected.nodeId) : null;

  const closeSheet = () => {
    setSelectedKey(null);
    setNaming(false);
    setMessage('');
  };

  const handleSelect = (item) => {
    setSelectedKey(item.key);
    setNaming(false);
    setMessage('');
  };

  // 这一段后面实际走的那个行动：优先当前路径上的，其次被接着玩过的，否则最新的
  const findChosenChildId = (nodeId) => {
    const kids = nodes.filter((node) => node.parentId === nodeId);

    if (kids.length === 0) return null;

    const onPath = kids.find((kid) => pathIds.has(kid.id));

    if (onPath) return onPath.id;

    const played = kids.filter((kid) => nodes.some((other) => other.parentId === kid.id));

    return (played.length > 0 ? played[played.length - 1] : kids[kids.length - 1]).id;
  };

  const handlePrimary = () => {
    if (!selected) return;

    if (selected.isCurrent) onClose();
    else onJump(selected.nodeId);
  };

  const handleReveal = () => {
    if (!selected) return;

    onReveal({
      nodeId: selected.nodeId,
      chosenChildId: findChosenChildId(selected.nodeId),
      number: selected.depth,
    });
  };

  const applyLocal = (ids, patch) => {
    const idSet = new Set(ids);

    setNodes((previous) => previous.map((node) => (idSet.has(node.id) ? { ...node, ...patch } : node)));
  };

  const handleStartNaming = () => {
    setNameText(selected?.savePointName || '');
    setMessage('');
    setNaming(true);
  };

  const handleSaveName = async () => {
    if (!selected) return;

    const clean = nameText.trim();

    if (!clean) {
      setMessage('给这个存档点起个名字吧。');
      return;
    }

    const targetId = selected.isSavePoint ? selected.saveNodeId : selected.nodeId;

    try {
      const saved = await setSavePoint(targetId, clean);

      applyLocal([targetId], { isSavePoint: true, savePointName: saved });
      setNaming(false);
      setMessage('');
    } catch (saveError) {
      console.warn('[Fiction] 保存存档点失败：', saveError);
      setMessage('保存失败，请再试一次。');
    }
  };

  const handleClearSavePoint = async () => {
    if (!selected) return;

    const flagged = selected.versionIds.filter((id) => nodeById.get(id)?.isSavePoint);

    try {
      await Promise.all(flagged.map((id) => clearSavePoint(id)));

      applyLocal(flagged, { isSavePoint: false, savePointName: '' });
      setNaming(false);
      setMessage('');
    } catch (clearError) {
      console.warn('[Fiction] 取消存档点失败：', clearError);
      setMessage('操作失败，请再试一次。');
    }
  };

  const handleNameKeyDown = (event) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSaveName();
    }
  };

  // ---------- 渲染 ----------

  const renderLines = () => (
    <svg className="fic-s-lines" width={canvasW} height={canvasH} aria-hidden="true">
      {tree.items.map((item) => {
        const parent = item.parentKey ? itemByKey.get(item.parentKey) : null;

        if (!parent) return null;

        const px = dotX(parent.lane);
        const py = dotY(parent.depth);
        const cx = dotX(item.lane);
        const cy = dotY(item.depth);
        const d = px === cx
          ? `M ${px} ${py + DOT / 2} V ${cy - DOT / 2}`
          : `M ${px} ${py + DOT / 2} V ${py + ROW_H / 2} H ${cx} V ${cy - DOT / 2}`;

        return (
          <path key={item.key} d={d} className={`fic-s-line ${item.onPath ? 'is-path' : ''}`} />
        );
      })}
      {showNext && (
        <path
          d={`M ${dotX(tree.currentItem.lane)} ${dotY(tree.currentItem.depth) + DOT / 2} V ${dotY(tree.currentItem.depth + 1) - DOT / 2}`}
          className="fic-s-line is-dash"
        />
      )}
    </svg>
  );

  const renderNode = (item) => (
    <button
      key={item.key}
      type="button"
      className={`fic-btn-reset fic-s-node ${item.onPath ? 'is-path' : ''} ${item.isCurrent ? 'is-current' : ''} ${selectedKey === item.key ? 'is-selected' : ''}`}
      style={{ left: nodeLeft(item.lane), top: nodeTop(item.depth), width: NODE_W, height: NODE_H }}
      aria-label={`第 ${item.depth} 段：${item.label}${item.isCurrent ? '（当前位置）' : ''}`}
      onClick={() => handleSelect(item)}
    >
      <span className="fic-s-dot" />
      <span className="fic-s-meta">
        <span className="fic-s-no">
          {item.depth}
          {item.versionCount > 1 && <span className="fic-s-ver">×{item.versionCount}</span>}
          {item.isSavePoint && <Flag size={10} strokeWidth={2} aria-hidden="true" />}
        </span>
        {item.isSavePoint && item.savePointName
          ? <span className="fic-s-flag-name">{item.savePointName}</span>
          : <span className="fic-s-label">{clip(item.label, LABEL_MAX)}</span>}
      </span>
    </button>
  );

  const renderSheet = () => {
    if (!selected || !selectedNode) return null;

    const hasSavePoint = selected.isSavePoint;

    return (
      <>
        <button
          type="button"
          className="fic-btn-reset fic-s-scrim"
          aria-label="关闭"
          onClick={closeSheet}
        />
        <div className="fic-s-sheet">
          <div className="fic-s-grab" />
          <div className="fic-s-sheet-head">
            <span className="fic-s-sheet-title">
              Seg. {selected.depth} · {clip(selected.label, LABEL_MAX)}
            </span>
            <button
              type="button"
              className="fic-btn-reset fic-s-x"
              aria-label="关闭"
              onClick={closeSheet}
            >
              <X size={18} strokeWidth={1.6} aria-hidden="true" />
            </button>
          </div>

          <div className="fic-s-pills">
            {selected.versionCount > 1 && (
              <span className="fic-s-pill">{selected.versionCount} 个版本</span>
            )}
            {selected.isCurrent && <span className="fic-s-pill is-current">当前位置</span>}
            {hasSavePoint && <span className="fic-s-pill">存档点 · {selected.savePointName}</span>}
          </div>

          <p className="fic-s-excerpt">{clip(selectedNode.text, EXCERPT_MAX)}</p>

          {message && <p className="fic-s-message" role="alert">{message}</p>}

          {naming ? (
            <div className="fic-s-naming">
              <input
                type="text"
                className="fic-s-name-input"
                value={nameText}
                maxLength={SAVE_POINT_NAME_MAX}
                placeholder="比如：渡口前"
                enterKeyHint="done"
                aria-label="存档点名称"
                onChange={(event) => setNameText(event.target.value)}
                onKeyDown={handleNameKeyDown}
              />
              <div className="fic-s-actions">
                <button
                  type="button"
                  className="fic-btn-reset fic-sheet-btn"
                  onClick={() => setNaming(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="fic-btn-reset fic-sheet-btn fic-s-solid"
                  onClick={handleSaveName}
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="fic-s-actions">
                <button
                  type="button"
                  className="fic-btn-reset fic-sheet-btn fic-s-solid"
                  onClick={handlePrimary}
                >
                  {selected.isCurrent ? '回到游玩' : '另开分支'}
                </button>
                <button
                  type="button"
                  className="fic-btn-reset fic-sheet-btn"
                  onClick={handleStartNaming}
                >
                  {hasSavePoint ? '改存档点名' : '命名存档点'}
                </button>
              </div>
              <div className="fic-s-links">
                <button type="button" className="fic-btn-reset fic-s-link" onClick={handleReveal}>
                  回看这一段
                </button>
                {hasSavePoint && (
                  <button
                    type="button"
                    className="fic-btn-reset fic-s-link"
                    onClick={handleClearSavePoint}
                  >
                    取消存档点
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="fic-s-layer">
      <button
        type="button"
        className="fic-btn-reset fic-round-btn fic-back"
        aria-label="返回游玩"
        onClick={onClose}
      >
        <ArrowLeft size={18} strokeWidth={1.6} aria-hidden="true" />
      </button>

      <div className="fic-s-head">
        <div className="fic-s-eyebrow">
          {tree.branchCount} {tree.branchCount === 1 ? 'Branch' : 'Branches'}
        </div>
        <div className="fic-s-title">故事线</div>
        <div className="fic-s-sub">{save.title}</div>
      </div>

      <div className="fic-s-scroll" ref={scrollRef}>
        {!loaded && <p className="fic-s-empty">读取中……</p>}
        {loaded && tree.items.length === 0 && (
          <p className="fic-s-empty">还没有任何剧情，先开始故事吧。</p>
        )}
        {loaded && tree.items.length > 0 && (
          <div className="fic-s-canvas" style={{ width: canvasW, height: canvasH }}>
            {renderLines()}
            {tree.items.map(renderNode)}
            {showNext && (
              <div
                className="fic-s-next"
                style={{
                  left: nodeLeft(tree.currentItem.lane),
                  top: nodeTop(tree.currentItem.depth + 1),
                  width: NODE_W,
                  height: NODE_H,
                }}
              >
                <span className="fic-s-dot is-dash" />
                <span className="fic-s-next-text">next…</span>
              </div>
            )}
          </div>
        )}
        {loaded && message && !selected && <p className="fic-s-empty">{message}</p>}
      </div>

      {renderSheet()}
    </div>
  );
};

export default FictionStoryline;