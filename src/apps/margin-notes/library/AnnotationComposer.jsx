// src/apps/margin-notes/library/AnnotationComposer.jsx
//
// 写批注的面板。两种来源：
//   - 新划线：draft 是 { text, color }，还没存成记录；保存时才新建。
//   - 已有的划线：annotation 是数据库里的那一行；保存时是更新，另外给「删除」按钮。
// 「同时发到聊天室」默认开着（批注、发到聊天室两个入口都打开这同一个面板，
// 已经发过的已有批注默认不再重复发一遍）。没绑定聊天室的书，这一行禁用。

import React, { useState } from 'react';
import { X } from 'lucide-react';

import { HIGHLIGHT_COLOR_IDS, HIGHLIGHT_COLORS } from './readerTheme';

export default function AnnotationComposer({
  quoteText,
  initialColor,
  initialNote = '',
  chatLabel,
  canSendToChat,
  isEditing,
  alreadySent,
  onCancel,
  onSave,
  onDelete,
}) {
  const [color, setColor] = useState(initialColor);
  const [note, setNote] = useState(initialNote);
  const [sendToChat, setSendToChat] = useState(canSendToChat && !alreadySent);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave({ color, note: note.trim(), sendToChat: canSendToChat && sendToChat });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy || !onDelete) return;
    const confirmed = window.confirm('删除这条批注？划线和想法都会被删掉，不能恢复。');
    if (!confirmed) return;
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mn-rd-sheet-backdrop" onClick={onCancel} role="presentation">
      <section
        className="mn-rd-composer"
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? '编辑批注' : '写批注'}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mn-rd-composer__head">
          <span className="mn-rd-composer__title">{isEditing ? '编辑批注' : '写批注'}</span>
          <button
            type="button"
            className="mn-rd-composer__close"
            onClick={onCancel}
            aria-label="关闭"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="mn-rd-composer__body">
          <div className="mn-rd-composer__quote-label">原文</div>
          <div
            className="mn-rd-composer__quote"
            style={{ background: HIGHLIGHT_COLORS[color]?.bg }}
          >
            {quoteText}
          </div>

          <textarea
            className="mn-rd-composer__textarea"
            aria-label="批注内容"
            placeholder="写下你的想法（留空就只是划线）"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />

          <div className="mn-rd-composer__row">
            <span className="mn-rd-composer__row-label">高亮颜色</span>
            <div className="mn-rd-composer__colors">
              {HIGHLIGHT_COLOR_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-label={HIGHLIGHT_COLORS[id].label}
                  aria-pressed={color === id}
                  className={`mn-rd-composer__swatch${color === id ? ' is-active' : ''}`}
                  style={{ background: HIGHLIGHT_COLORS[id].dot }}
                  onClick={() => setColor(id)}
                />
              ))}
            </div>
          </div>

          <div
            className={`mn-rd-composer__chat${canSendToChat ? '' : ' is-disabled'}`}
          >
            <div className="mn-rd-composer__chat-text">
              <span className="mn-rd-composer__chat-title">
                {canSendToChat ? `同时发到聊天室「${chatLabel}」` : '这本书还没绑定聊天室'}
              </span>
              <span className="mn-rd-composer__chat-sub">
                {canSendToChat
                  ? 'TA 会看到这段原文和你的批注，不会读到整本书。'
                  : '去藏书页的「管理这本书」里绑定以后才能发。'}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={sendToChat}
              aria-label="同时发到聊天室"
              disabled={!canSendToChat}
              className={`mn-rd-switch${sendToChat && canSendToChat ? ' is-on' : ''}`}
              onClick={() => setSendToChat((value) => !value)}
            >
              <span className="mn-rd-switch__knob" />
            </button>
          </div>

          <div className="mn-rd-composer__actions">
            <button
              type="button"
              className="mn-rd-composer__btn"
              onClick={onCancel}
              disabled={busy}
            >
              取消
            </button>
            <button
              type="button"
              className="mn-rd-composer__btn mn-rd-composer__btn--primary"
              onClick={handleSave}
              disabled={busy}
            >
              {sendToChat && canSendToChat ? '保存并发送' : '保存'}
            </button>
          </div>

          {isEditing && onDelete && (
            <button
              type="button"
              className="mn-rd-composer__delete"
              onClick={handleDelete}
              disabled={busy}
            >
              删除这条批注
            </button>
          )}
        </div>
      </section>
    </div>
  );
}