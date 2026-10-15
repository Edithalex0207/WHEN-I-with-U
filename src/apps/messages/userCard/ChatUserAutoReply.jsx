import React from 'react';

/**
 * 用户的"暂时不在线"自动回复：显示在用户一侧（右边）的小气泡，
 * 带一个"自动回复"标记，让人一眼看出这不是用户亲手发的。
 * 颜色全部取自全局主题变量。
 */
export const ChatUserAutoReply = ({ message }) => (
  <div className="flex w-full justify-end px-3 py-1">
    <div
      className="max-w-[78%] rounded-2xl px-3 py-2 text-left"
      style={{
        background: 'var(--control-soft-bg)',
        border: '1px solid var(--card-border)',
        color: 'var(--text-main)',
      }}
    >
      <div className="mb-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        自动回复
      </div>
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {message?.content}
      </div>
    </div>
  </div>
);

export default ChatUserAutoReply;