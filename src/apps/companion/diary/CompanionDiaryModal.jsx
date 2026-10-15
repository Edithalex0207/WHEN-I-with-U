/*
 * CompanionDiaryModal.jsx —— 小伙伴的日记本。
 *
 * 跟其它 companion 弹窗共用同一套视觉语言（.cp-overlay/.cp-backdrop/
 * .cp-panel.bottom.cp-stall，颜色变量是 companionPage.css 的 --cp-*），
 * 列表部分直接复用 CompanionPage.jsx 时间线用的 .cp-tl/.cp-tl-item/
 * .cp-tl-bubble 样式（见 companionPage.css），只在气泡下面新增了一行
 * 点赞/留言的交互区（见 companionPage.css 末尾新增的 .cp-diary-* 规则）。
 *
 * 由"重要事件触发"写日记，这里只负责展示 + 点赞/留言，不负责生成——
 * 生成逻辑在 companionDiaryService.js / companionDiaryAiService.js，
 * 由 companionEventService.js 在事件触发时调用。
 *
 * Props:
 *   companionId   number   — 小伙伴 ID
 *   companionName string   — 小伙伴名字（空状态文案用）
 *   onClose       function — 关闭弹窗
 */

import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';

import { getDiaries, toggleDiaryLike, commentOnDiary } from './companionDiaryService';
import CompanionHeartIcon from '../CompanionHeartIcon';

const formatDiaryTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 60) return minutes < 1 ? '刚刚' : `${minutes} 分钟前`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} 小时前`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

// 单篇日记卡片——拆成子组件主要是为了让"留言输入框"的本地状态
// （草稿文字）只属于这一张卡片，不会互相干扰。
const DiaryEntry = ({ entry, index, onToggleLike, onSubmitComment }) => {
  const [draft, setDraft] = useState(entry.userComment || '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasComment = Boolean(entry.userComment);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmitComment(entry.id, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="cp-tl-item diary" style={{ '--i': Math.min(index, 8) }}>
      <span className="cp-sticker"><BookOpen className="cp-ic" /></span>
      <div className="cp-tl-bubble cp-diary-bubble">
        <div className="cp-tl-meta">
          <b>{entry.triggerLabel || '日记'}</b>
          <time>{formatDiaryTime(entry.timestamp)}</time>
        </div>
        <p>{entry.content}</p>

        <div className="cp-diary-actions">
          <button
            type="button"
            className={`cp-diary-like ${entry.liked ? 'is-on' : ''}`}
            onClick={() => onToggleLike(entry.id)}
            aria-label={entry.liked ? '取消点赞' : '点赞'}
          >
            <CompanionHeartIcon className="cp-heart-ic" />
          </button>

          {!editing && (
            <button
              type="button"
              className="cp-diary-comment-trigger"
              onClick={() => { setDraft(entry.userComment || ''); setEditing(true); }}
            >
              {hasComment ? '改留言' : '留句话'}
            </button>
          )}
        </div>

        {hasComment && !editing && (
          <p className="cp-diary-comment">你：{entry.userComment}</p>
        )}

        {editing && (
          <div className="cp-diary-comment-edit">
            <input
              type="text"
              value={draft}
              maxLength={200}
              placeholder="留一句话给它看看…"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="button" disabled={saving} onClick={handleSubmit}>
              {saving ? '…' : '发送'}
            </button>
            <button type="button" className="cp-diary-comment-cancel" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
        )}
      </div>
    </li>
  );
};

const CompanionDiaryModal = ({ companionId, companionName = '小伙伴', onClose }) => {
  const [diaries, setDiaries] = useState(null); // null = 加载中

  useEffect(() => {
    let cancelled = false;
    if (!companionId) return undefined;
    getDiaries(companionId).then((rows) => {
      if (!cancelled) setDiaries(rows);
    });
    return () => { cancelled = true; };
  }, [companionId]);

  const handleToggleLike = async (diaryId) => {
    const updated = await toggleDiaryLike(companionId, diaryId);
    if (!updated) return;
    setDiaries((rows) => rows.map((row) => (row.id === diaryId ? updated : row)));
  };

  const handleSubmitComment = async (diaryId, text) => {
    const updated = await commentOnDiary(companionId, diaryId, text);
    if (!updated) return;
    setDiaries((rows) => rows.map((row) => (row.id === diaryId ? updated : row)));
  };

  return (
    <div className="cp-overlay">
      <div className="cp-backdrop" onClick={onClose} />

      <div className="cp-panel bottom cp-stall">
        <i className="cp-handle" />

        <h3 className="cp-panel-title">
          <span>日记</span>
        </h3>

        <div className="cp-panel-scroll">
          {diaries === null && <p className="cp-empty">正在翻开日记本…</p>}

          {diaries !== null && diaries.length === 0 && (
            <p className="cp-empty">{companionName}还没写过日记，等遇到点什么特别的事再说吧。</p>
          )}

          {diaries !== null && diaries.length > 0 && (
            <ul className="cp-tl">
              {diaries.map((entry, index) => (
                <DiaryEntry
                  key={entry.id}
                  entry={entry}
                  index={index}
                  onToggleLike={handleToggleLike}
                  onSubmitComment={handleSubmitComment}
                />
              ))}
            </ul>
          )}
        </div>

        <button type="button" className="cp-close-link" onClick={onClose}>
          合上日记本
        </button>
      </div>
    </div>
  );
};

export default CompanionDiaryModal;