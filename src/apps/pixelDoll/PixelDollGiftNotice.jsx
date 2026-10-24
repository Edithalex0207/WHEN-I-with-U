import React from 'react';

// 像素衣橱——送礼/角色回应/角色主动送礼留在聊天记录里的痕迹，跟
// ChallengeCompletionNotice 同一个视觉语言：居中一条小药丸，纯公告，
// 不可点击跳转（具体穿戴情况去"像素衣橱"面板里看）。
const DIRECTION_TEXT = {
  user_to_char: (label) => `给TA的像素小人送了一件礼物「${label}」`,
  char_reply: (label, accepted) => (
    accepted ? `TA穿上了你送的「${label}」` : `TA先收下了「${label}」，这次没穿`
  ),
  char_to_user: (label) => `TA给你的像素小人送了一件礼物「${label}」`,
};

const PixelDollGiftNotice = ({ message }) => {
  const label = message?.metadata?.label || '';
  const direction = message?.metadata?.direction;
  const accepted = Boolean(message?.metadata?.accepted);
  const note = message?.content || '';

  const summary = DIRECTION_TEXT[direction]
    ? DIRECTION_TEXT[direction](label, accepted)
    : `像素衣橱里的一件礼物「${label}」`;

  return (
    <div className="my-2 flex justify-center">
      <div
        className="rounded-full px-3 py-1 text-center text-[11px]"
        style={{
          background: 'var(--control-soft-bg)',
          color: 'var(--text-main)',
          opacity: 0.75,
        }}
      >
        <span>
          {summary}
          {direction !== 'user_to_char' && note ? ` · ${note}` : ''}
        </span>
      </div>
    </div>
  );
};

export default PixelDollGiftNotice;