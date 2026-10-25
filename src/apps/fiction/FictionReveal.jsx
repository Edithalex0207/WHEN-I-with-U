// src/apps/fiction/FictionReveal.jsx
//
// 回看（Hindsight）：回头看某一段。
//   - 这一段的正文（默认收起，可展开）
//   - 当时的几个选项，每个选项的数值变化都摊开给你看（游玩时可能是藏着的）
//   - 你当时选的那个高亮，并标出这一步前后各个数值怎么变的（32 → 34）
//   - 自由输入走的那一步，显示你写的话和数值变化
//   - 底部：从这里另开分支 / 回到当前进度
//
// 数值前后的算法：这一段的 statsSnapshot = 进入这一段之后的数值；
// 你选的那个行动生成的下一段的 statsSnapshot = 选完之后的数值。
// 只读，不改任何数据；「另开分支」交给游玩页处理。

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

import { getNode, listChildren } from './fictionService';
import { normalizeStatDefs } from './fictionParser';
import { ACTION_TYPES } from './fictionPromptAssembler';
import './fictionStory.css';

const EXCERPT_MAX = 150;

const formatDelta = (value) => `${value > 0 ? '+' : '−'}${Math.abs(value)}`;

const FictionReveal = ({
  save,
  nodeId,
  chosenChildId,
  number,
  busy,
  onClose,
  onReturn,
  onBranch,
}) => {
  const [node, setNode] = useState(null);
  const [children, setChildren] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const [found, kids] = await Promise.all([getNode(nodeId), listChildren(save.id, nodeId)]);

        if (!alive) return;

        setNode(found || null);
        setChildren(kids);
      } catch (loadError) {
        console.warn('[Fiction] 读取回看失败：', loadError);
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoaded(true);
      }
    };

    void load();

    return () => {
      alive = false;
    };
  }, [save.id, nodeId]);

  const stats = useMemo(() => normalizeStatDefs(save.stats), [save.stats]);
  const chosen = children.find((child) => child.id === chosenChildId) || null;
  const exploredKeys = useMemo(() => new Set(children.map((child) => child.actionKey)), [children]);

  // 选完之后哪些数值变了：[{ id, name, before, after }]
  const changes = useMemo(() => {
    if (!node || !chosen) return [];

    return stats
      .map((stat) => {
        const before = node.statsSnapshot?.[stat.id] ?? stat.initial;
        const after = chosen.statsSnapshot?.[stat.id] ?? before;

        return { id: stat.id, name: stat.name, before, after };
      })
      .filter((item) => item.before !== item.after);
  }, [node, chosen, stats]);

  const deltaPills = (deltas) => stats
    .filter((stat) => deltas && deltas[stat.id])
    .map((stat) => `${stat.name} ${formatDelta(deltas[stat.id])}`);

  const text = String(node?.text || '');
  const long = Array.from(text).length > EXCERPT_MAX;
  const shown = expanded || !long ? text : `${Array.from(text).slice(0, EXCERPT_MAX).join('')}…`;
  const chosenIsFree = chosen?.userAction?.type === ACTION_TYPES.FREE;
  const options = node?.options || [];

  const renderChanges = () => changes.length > 0 && (
    <div className="fic-r-changes">
      {changes.map((item) => (
        <span key={item.id} className="fic-r-change">
          {item.name} <b>{item.before}</b> → <b>{item.after}</b>
        </span>
      ))}
    </div>
  );

  const renderOption = (option) => {
    const isChosen = Boolean(chosen) && chosen.actionKey === `opt:${option.key}`;
    const pills = deltaPills(option.deltas);

    return (
      <div key={option.key} className={`fic-r-option ${isChosen ? 'is-chosen' : ''}`}>
        <span className="fic-r-key">{option.key}</span>
        <div className="fic-r-body">
          <div className="fic-r-text">{option.text}</div>
          {pills.length > 0 && (
            <div className="fic-r-pills">
              {pills.map((pill) => <span key={pill} className="fic-r-pill">{pill}</span>)}
            </div>
          )}
          {isChosen && <div className="fic-r-mark">你选了这个</div>}
          {isChosen && renderChanges()}
          {!isChosen && exploredKeys.has(`opt:${option.key}`) && (
            <div className="fic-r-also">另一条分支走过这个</div>
          )}
        </div>
      </div>
    );
  };

  const renderBody = () => {
    if (failed || (loaded && !node)) {
      return <p className="fic-r-empty">这一段读取不出来了，请回到游玩页再试一次。</p>;
    }

    if (!loaded) return <p className="fic-r-empty">读取中……</p>;

    return (
      <>
        <div className="fic-r-card">
          <p className="fic-r-excerpt">{shown}</p>
          {long && (
            <button
              type="button"
              className="fic-btn-reset fic-r-toggle"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? '收起' : '展开全文'}
            </button>
          )}
        </div>

        {options.length > 0 && (
          <>
            <div className="fic-r-label">当时的选项</div>
            <div className="fic-r-options">{options.map(renderOption)}</div>
          </>
        )}

        {chosenIsFree && (
          <>
            <div className="fic-r-label">你自己写的行动</div>
            <div className="fic-r-option is-chosen">
              <span className="fic-r-key">✎</span>
              <div className="fic-r-body">
                <div className="fic-r-text">{chosen.userAction.text}</div>
                <div className="fic-r-mark">你选了这个</div>
                {renderChanges()}
                {changes.length === 0 && stats.length > 0 && (
                  <div className="fic-r-also">这一步没有数值变化</div>
                )}
              </div>
            </div>
          </>
        )}

        {!chosen && (
          <p className="fic-r-hand">这一段后面还没有往下走。</p>
        )}
        {!save.showDeltas && options.length > 0 && (
          <p className="fic-r-hand">玩的时候这些数字是藏着的，现在才让你看见。</p>
        )}
      </>
    );
  };

  return (
    <div className="fic-s-layer fic-r-layer">
      <button
        type="button"
        className="fic-btn-reset fic-round-btn fic-back"
        aria-label="关闭回看"
        onClick={onClose}
      >
        <ArrowLeft size={18} strokeWidth={1.6} aria-hidden="true" />
      </button>

      <div className="fic-s-head">
        <div className="fic-s-eyebrow">Segment {number}</div>
        <div className="fic-s-title">回看</div>
        <div className="fic-s-sub">{save.title}</div>
      </div>

      <div className="fic-r-scroll">{renderBody()}</div>

      <div className="fic-r-foot">
        <button
          type="button"
          className="fic-btn-reset fic-sheet-btn fic-s-solid"
          disabled={Boolean(busy) || !node}
          onClick={() => onBranch(nodeId)}
        >
          从这里另开分支
        </button>
        <button type="button" className="fic-btn-reset fic-sheet-btn" onClick={onReturn}>
          回到当前进度
        </button>
      </div>
    </div>
  );
};

export default FictionReveal;