import React, { useState } from 'react';

import CompanionFriendAvatarView from './CompanionFriendAvatarView';

const NOTE_MAX_LENGTH = 40;
const NEAR_LIMIT_AT = 32;

/*
 * 发送好友申请 / 婉拒后重新申请 共用的留言弹窗（视觉预览 v3 确认过）。
 * 选填，不写也能发；没有"帮我想一句"AI 按钮（已跟用户确认不加）。
 *
 * mode: 'send' | 'retry'，只影响标题/按钮文案，流程完全一样。
 */
const CompanionFriendNoteModal = ({ candidate, mode = 'send', busy, onConfirm, onClose }) => {
  const [note, setNote] = useState('');

  if (!candidate) return null;

  const isRetry = mode === 'retry';

  return (
    <div className="cp-overlay center cfn-overlay">
      <div className="cp-backdrop" onClick={onClose} />
      <div className="cfn-modal">
        <div className="cfn-head">
          <CompanionFriendAvatarView avatarId={candidate.avatarId} className="sz-40" />
          <div>
            <p className="cfn-title">{`给${candidate.name}写一句话`}</p>
            <p className="cfn-sub">{isRetry ? '想好要怎么跟TA说了吗' : '帮小伙伴向TA打个招呼吧'}</p>
          </div>
        </div>

        <textarea
          value={note}
          maxLength={NOTE_MAX_LENGTH}
          placeholder={`（选填）比如：${candidate.declaration?.slice(0, 16) || '认识一下吧'}`}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className={`cfn-counter ${note.length > NEAR_LIMIT_AT ? 'near' : ''}`}>{`${note.length} / ${NOTE_MAX_LENGTH}`}</div>

        <div className="cfn-btns">
          <button type="button" className="cfn-btn cancel" disabled={busy} onClick={onClose}>再想想</button>
          <button
            type="button"
            className="cfn-btn ok"
            disabled={busy}
            onClick={() => onConfirm(note)}
          >
            {busy ? '发送中…' : isRetry ? '再次申请' : '发送好友申请'}
          </button>
        </div>
        <p className="cfn-hint">不写也能发送；写得越用心，对方越不容易婉拒哦</p>
      </div>
    </div>
  );
};

export default CompanionFriendNoteModal;