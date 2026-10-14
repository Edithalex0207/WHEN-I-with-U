// src/apps/margin-notes/library/SelectionToolbar.jsx
//
// 选中文字后浮在选区上方的小工具条：四个颜色圆点点一下就直接划线，
// 「批注」「发到聊天室」都是打开写批注的面板，「复制」把选中的文字拷到剪贴板。
// 位置由父组件算好（selection 的 rect），这里只管摆放和交互。

import React from 'react';

import { HIGHLIGHT_COLOR_IDS, HIGHLIGHT_COLORS } from './readerTheme';

export default function SelectionToolbar({
  rect,
  onPickColor,
  onAnnotate,
  onSendToChat,
  onCopy,
}) {
  if (!rect) return null;

  const left = Math.min(
    Math.max(rect.left + rect.width / 2, 92),
    window.innerWidth - 92
  );
  const top = Math.max(rect.top - 54, 8);

  return (
    <div
      className="mn-rd-seltoolbar"
      style={{ left, top }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="mn-rd-seltoolbar__colors">
        {HIGHLIGHT_COLOR_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-label={`${HIGHLIGHT_COLORS[id].label}高亮`}
            className="mn-rd-seltoolbar__dot"
            style={{ background: HIGHLIGHT_COLORS[id].dot }}
            onClick={() => onPickColor(id)}
          />
        ))}
      </div>

      <span className="mn-rd-seltoolbar__sep" />

      <button type="button" className="mn-rd-seltoolbar__btn" onClick={onAnnotate}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
        </svg>
        批注
      </button>

      <button
        type="button"
        className="mn-rd-seltoolbar__btn mn-rd-seltoolbar__btn--primary"
        onClick={onSendToChat}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V15h-.5A2.5 2.5 0 0 1 5 12.5z" />
        </svg>
        发到聊天室
      </button>

      <span className="mn-rd-seltoolbar__sep" />

      <button
        type="button"
        aria-label="复制"
        className="mn-rd-seltoolbar__icon"
        onClick={onCopy}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V6a2 2 0 0 1 2-2h9" />
        </svg>
      </button>

      <span className="mn-rd-seltoolbar__arrow" />
    </div>
  );
}