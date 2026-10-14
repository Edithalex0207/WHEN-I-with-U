// src/apps/margin-notes/library/ReaderExitSummary.jsx
//
// 点返回藏书页的按钮时弹出的「这次读了多少」小结，顺带问要不要发到聊天室。
// 「取消」是收起这个面板、留在阅读页（不退出）；「不发送，直接退出」和
// 「发送并退出」都会真的离开阅读页，区别只是发不发这张卡片——
// 设计稿的两颗按钮没有一个单纯是「不发也退出」，这里加了这条文字链接
// 补上这个选项，免得「问我发不发」被做成了「必须发」。

import React, { useState } from 'react';
import { X } from 'lucide-react';

export default function ReaderExitSummary({
  chapterTitle,
  bookTitle,
  chatLabel,
  canSendToChat,
  hasExistingSummary,
  stats,
  onCancel,
  onLeaveWithoutSending,
  onSend,
}) {
  const [includeRecap, setIncludeRecap] = useState(true);
  const [mode, setMode] = useState('update'); // update | new
  const [sending, setSending] = useState(false);

  const items = [
    { value: stats.minutes, label: '分钟' },
    { value: stats.chaptersRead, label: '节' },
    { value: stats.newAnnotations, label: '条批注' },
    { value: stats.newComments, label: '条留言' },
  ];

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    try {
      await onSend({ mode, includeRecap });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mn-rd-sheet-backdrop" onClick={onCancel} role="presentation">
      <section
        className="mn-rd-exit"
        role="dialog"
        aria-modal="true"
        aria-label="阅读摘要"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mn-rd-exit__head">
          <span className="mn-rd-exit__title">读完这一节</span>
          <button
            type="button"
            className="mn-rd-exit__close"
            onClick={onLeaveWithoutSending}
            aria-label="不发送，直接退出"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="mn-rd-exit__card">
          <div className="mn-rd-exit__card-title">
            阅读摘要 · {bookTitle}
            {chapterTitle ? ` ${chapterTitle}` : ''}
          </div>
          <div className="mn-rd-exit__stats">
            {items.map((item) => (
              <div key={item.label} className="mn-rd-exit__stat">
                <span className="mn-rd-exit__stat-value">{item.value}</span>
                <span className="mn-rd-exit__stat-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {canSendToChat ? (
          <>
            <div className="mn-rd-exit__row">
              <div className="mn-rd-exit__row-text">
                <span className="mn-rd-exit__row-title">附上一句话回顾</span>
                <span className="mn-rd-exit__row-sub">
                  由 AI 生成，发送时调用 1 次。关掉则只发数字。
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={includeRecap}
                aria-label="附上一句话回顾"
                className={`mn-rd-switch${includeRecap ? ' is-on' : ''}`}
                onClick={() => setIncludeRecap((value) => !value)}
              >
                <span className="mn-rd-switch__knob" />
              </button>
            </div>

            {hasExistingSummary && (
              <div className="mn-rd-exit__modefield">
                <span className="mn-rd-exit__row-sub">发送方式</span>
                <div className="mn-rd-seg">
                  <button
                    type="button"
                    className={`mn-rd-seg__item${mode === 'update' ? ' is-active' : ''}`}
                    onClick={() => setMode('update')}
                  >
                    更新上次的卡片
                  </button>
                  <button
                    type="button"
                    className={`mn-rd-seg__item${mode === 'new' ? ' is-active' : ''}`}
                    onClick={() => setMode('new')}
                  >
                    另发一张
                  </button>
                </div>
              </div>
            )}

            <div className="mn-rd-exit__actions">
              <button type="button" className="mn-rd-composer__btn" onClick={onCancel}>
                取消
              </button>
              <button
                type="button"
                className="mn-rd-composer__btn mn-rd-composer__btn--primary"
                onClick={handleSend}
                disabled={sending}
              >
                {sending ? '发送中…' : `发送到「${chatLabel}」`}
              </button>
            </div>

            <button
              type="button"
              className="mn-rd-exit__skip"
              onClick={onLeaveWithoutSending}
            >
              不发送，直接退出
            </button>
          </>
        ) : (
          <div className="mn-rd-exit__actions">
            <button type="button" className="mn-rd-composer__btn" onClick={onCancel}>
              取消
            </button>
            <button
              type="button"
              className="mn-rd-composer__btn mn-rd-composer__btn--primary"
              onClick={onLeaveWithoutSending}
            >
              直接退出
            </button>
          </div>
        )}
      </section>
    </div>
  );
}