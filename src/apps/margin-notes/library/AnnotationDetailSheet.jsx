// src/apps/margin-notes/library/AnnotationDetailSheet.jsx
//
// 点正文里的划线/小标记打开的「批注」面板：
//   原文 → 我的批注（可编辑）→ 角色的批注（点按钮才生成，存在这条划线上，之后随时能看）。
// 角色批注不会自动生成：只有用户点「请 TA 批注」才会调一次 AI。
// 面板只负责展示和按钮，怎么生成/存储由父组件的 onAsk 决定。

import React, { useState } from 'react';
import { Pencil, X } from 'lucide-react';

import { HIGHLIGHT_COLORS } from './readerTheme';

export default function AnnotationDetailSheet({
  annotation,
  characterName,
  onAsk,
  onEdit,
  onClose,
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');

  if (!annotation) return null;

  const hasCharacter = Boolean(characterName);
  const charNote = String(annotation.charNote || '').trim();
  const myNote = String(annotation.note || '').trim();

  const handleAsk = async () => {
    if (asking) return;
    setAsking(true);
    setError('');
    try {
      await onAsk(annotation);
    } catch (err) {
      console.warn('[阅读器] 请 TA 批注失败：', err);
      setError(err?.message || '没能生成，请再试一次。');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="mn-rd-sheet-backdrop" onClick={onClose} role="presentation">
      <section
        className="mn-rd-comment mn-rd-detail"
        role="dialog"
        aria-modal="true"
        aria-label="批注"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mn-rd-comment__head">
          <span className="mn-rd-comment__title">批注</span>
          <button
            type="button"
            className="mn-rd-comment__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="mn-rd-comment__body">
          <div
            className="mn-rd-detail__quote"
            style={{ background: HIGHLIGHT_COLORS[annotation.color]?.bg }}
          >
            {annotation.text}
          </div>

          <div className="mn-rd-detail__block">
            <div className="mn-rd-detail__label">
              <span className="mn-rd-detail__dot mn-rd-detail__dot--me" />
              我的批注
              <button
                type="button"
                className="mn-rd-detail__edit"
                onClick={() => onEdit(annotation)}
                aria-label="编辑我的批注"
              >
                <Pencil size={13} strokeWidth={1.8} />
                编辑
              </button>
            </div>
            <div className={`mn-rd-detail__text${myNote ? '' : ' is-empty'}`}>
              {myNote || '只划了线，还没有写想法。'}
            </div>
          </div>

          <div className="mn-rd-detail__block">
            <div className="mn-rd-detail__label">
              <span className="mn-rd-detail__dot mn-rd-detail__dot--ta" />
              {hasCharacter ? `${characterName} 的批注` : 'TA 的批注'}
            </div>

            {asking ? (
              <div className="mn-rd-detail__text is-empty">
                {characterName} 正在写……
              </div>
            ) : charNote ? (
              <div className="mn-rd-detail__text">{charNote}</div>
            ) : (
              <div className="mn-rd-detail__text is-empty">
                {hasCharacter
                  ? '还没有批注，点下面的按钮请 TA 写一条。'
                  : '这本书还没绑定聊天室，绑定以后可以请 TA 批注。'}
              </div>
            )}

            {error && <div className="mn-rd-detail__error">{error}</div>}

            {hasCharacter && (
              <button
                type="button"
                className="mn-rd-comment__again"
                onClick={handleAsk}
                disabled={asking}
              >
                {charNote ? '让 TA 重新写一条' : '请 TA 批注'}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}