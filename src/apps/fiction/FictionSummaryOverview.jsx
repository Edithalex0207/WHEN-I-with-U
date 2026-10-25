// src/apps/fiction/FictionSummaryOverview.jsx
//
// 第 5A 轮：总结总览页。
//   - 已经做好的总结，按顺序列出来，每条可以展开编辑、保存
//   - 当前路径如果有「满一批却还没总结」的区间，底部多一张待总结卡片：
//     AI 生成草稿 → 可以接着改 → 保存；也可以「暂不总结」先关掉，下次再开还在
//   - 右上角常驻入口按钮（在 FictionPlayRoom 里）：有待总结内容时带一个小红点
//
// 不碰游玩页的生成逻辑，只管总结本身：
//   读取 fictionService.getSummaryStatus(saveId)
//   草稿 fictionAiService.generateSummaryDraft(saveId, { from, to, signal })
//   保存 fictionService.saveSummary(nodeId, text)

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';

import { getSummaryStatus, saveSummary } from './fictionService';
import { generateSummaryDraft, FICTION_ERROR } from './fictionAiService';
import './fictionSummary.css';

const FictionSummaryOverview = ({ save, onClose }) => {
  const [loaded, setLoaded] = useState(false);
  const [batches, setBatches] = useState([]);
  const [pending, setPending] = useState(null); // { from, to } | null
  const [pathLength, setPathLength] = useState(0);
  const [pendingNodeId, setPendingNodeId] = useState(null);

  const [editingId, setEditingId] = useState(null); // batch.nodeId 正在编辑的那一条，或 'pending'
  const [draftText, setDraftText] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const reload = async () => {
    try {
      const status = await getSummaryStatus(save.id);

      if (!mountedRef.current) return;

      setBatches(status.batches);
      setPending(status.pending);
      setPathLength(status.pathNodes.length);
      setPendingNodeId(status.pending ? status.pathNodes[status.pending.to - 1]?.id ?? null : null);
    } catch (loadError) {
      console.warn('[Fiction] 读取总结状态失败：', loadError);
      if (mountedRef.current) setError('读取总结失败，请关闭后再试一次。');
    } finally {
      if (mountedRef.current) setLoaded(true);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.id]);

  const startEdit = (id, text) => {
    setEditingId(id);
    setDraftText(text);
    setError('');
  };

  const cancelEdit = () => {
    if (abortRef.current) abortRef.current.abort();
    setEditingId(null);
    setDraftText('');
    setDrafting(false);
  };

  const handleDraft = async () => {
    if (!pending || drafting) return;

    const controller = new AbortController();

    abortRef.current = controller;
    setDrafting(true);
    setError('');

    try {
      const text = await generateSummaryDraft(save.id, {
        from: pending.from,
        to: pending.to,
        signal: controller.signal,
      });

      if (!mountedRef.current) return;

      setDraftText(text);
      setEditingId('pending');
    } catch (draftError) {
      if (!mountedRef.current || draftError?.code === FICTION_ERROR.ABORTED) return;

      console.warn('[Fiction] 生成总结草稿失败：', draftError);
      setError(draftError?.message || '生成草稿失败，请再试一次。');
    } finally {
      abortRef.current = null;
      if (mountedRef.current) setDrafting(false);
    }
  };

  const handleSave = async (nodeId) => {
    const text = draftText.trim();

    if (!text || saving) return;

    setSaving(true);
    setError('');

    try {
      await saveSummary(nodeId, text);

      if (!mountedRef.current) return;

      setEditingId(null);
      setDraftText('');
      await reload();
    } catch (saveError) {
      console.warn('[Fiction] 保存总结失败：', saveError);
      if (mountedRef.current) setError(saveError?.message || '保存失败，请再试一次。');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const renderBatch = (batch) => {
    const isEditing = editingId === batch.nodeId;

    return (
      <div key={batch.nodeId} className="fic-sum-card">
        <div className="fic-sum-card-head">
          <span className="fic-sum-range">第 {batch.from}-{batch.to} 段</span>
          {!isEditing && (
            <button
              type="button"
              className="fic-btn-reset fic-sum-link"
              onClick={() => startEdit(batch.nodeId, batch.text)}
            >
              编辑
            </button>
          )}
        </div>

        {isEditing ? (
          <>
            <textarea
              className="fic-sum-textarea"
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              rows={6}
            />
            <div className="fic-sum-actions">
              <button
                type="button"
                className="fic-btn-reset fic-sheet-btn fic-s-solid"
                disabled={saving || !draftText.trim()}
                onClick={() => handleSave(batch.nodeId)}
              >
                {saving ? '保存中…' : '保存'}
              </button>
              <button type="button" className="fic-btn-reset fic-sheet-btn" onClick={cancelEdit}>
                取消
              </button>
            </div>
          </>
        ) : (
          <p className="fic-sum-text">{batch.text}</p>
        )}
      </div>
    );
  };

  const renderPending = () => {
    if (!pending) return null;

    const isEditing = editingId === 'pending';

    return (
      <div className="fic-sum-card is-pending">
        <div className="fic-sum-card-head">
          <span className="fic-sum-range">第 {pending.from}-{pending.to} 段 · 待总结</span>
        </div>

        {!isEditing && (
          <>
            <p className="fic-sum-hint">
              已经写到第 {pathLength} 段了，这一批还没有总结。总结之前，这一批的原文会一直带进提示词——不总结也能继续玩，只是上下文会一直比较长。
            </p>
            <button
              type="button"
              className="fic-btn-reset fic-sheet-btn fic-s-solid"
              disabled={drafting}
              onClick={handleDraft}
            >
              {drafting ? <>正在生成草稿…</> : <><Sparkles size={15} strokeWidth={1.8} aria-hidden="true" /> AI 生成总结草稿</>}
            </button>
          </>
        )}

        {isEditing && (
          <>
            <p className="fic-sum-hint">AI 写好了草稿，改到满意再保存：</p>
            <textarea
              className="fic-sum-textarea"
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              rows={6}
              autoFocus
            />
            <div className="fic-sum-actions">
              <button
                type="button"
                className="fic-btn-reset fic-sheet-btn fic-s-solid"
                disabled={saving || !draftText.trim() || !pendingNodeId}
                onClick={() => handleSave(pendingNodeId)}
              >
                {saving ? '保存中…' : '保存总结'}
              </button>
              <button type="button" className="fic-btn-reset fic-sheet-btn" onClick={cancelEdit} disabled={saving}>
                重新生成
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="fic-s-layer fic-sum-layer">
      <button
        type="button"
        className="fic-btn-reset fic-round-btn fic-back"
        aria-label="关闭总结"
        onClick={onClose}
      >
        <ArrowLeft size={18} strokeWidth={1.6} aria-hidden="true" />
      </button>

      <div className="fic-s-head">
        <div className="fic-s-eyebrow">Summary</div>
        <div className="fic-s-title">总结</div>
        <div className="fic-s-sub">{save.title}</div>
      </div>

      <div className="fic-sum-scroll">
        {!loaded && <p className="fic-sum-empty">读取中……</p>}

        {loaded && batches.length === 0 && !pending && (
          <p className="fic-sum-empty">还没有到需要总结的地方（每满 50 段才会提醒一次）。</p>
        )}

        {error && <p className="fic-sum-error" role="alert">{error}</p>}

        {batches.map(renderBatch)}
        {renderPending()}
      </div>
    </div>
  );
};

export default FictionSummaryOverview;