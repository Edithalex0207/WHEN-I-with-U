import React, { useState } from 'react';

import CompanionHeartIcon from '../../../companion/CompanionHeartIcon';

/*
 * #4 状态不佳卡片——小伙伴好几项状态同时偏低时，往聊天室发的提醒卡片。
 * 视觉上跟 CompanionOfferCard（"一起养小伙伴"邀请卡）保持同一套语言，
 * 不特意做成警示色（已跟用户确认），语气上更像顺口提一句，不是报警。
 *
 * "知道了"只是本地隐藏这张卡片，不会删除消息本身——跟邀请卡的"先不用"
 * 是一个思路，刷新/重新打开聊天还是能看到。
 */
const CompanionStatusAlertCard = ({ message, onOpen }) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="my-1 w-full max-w-sm select-none">
      <div
        className="relative overflow-hidden rounded-[1.75rem] p-4"
        style={{
          background: 'var(--card-bg-gradient, var(--card-bg))',
          border: '1px solid var(--card-border)',
        }}
      >
        <div
          className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-20"
          style={{ background: 'var(--accent-color)' }}
        />

        <div className="mb-2 flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: 'var(--control-soft-bg)' }}
          >
            <CompanionHeartIcon className="h-4 w-4" style={{ color: 'var(--accent-color)' }} />
          </div>
          <span className="text-xs font-medium" style={{ color: 'var(--text-main)' }}>
            小伙伴提醒
          </span>
        </div>

        <p className="mb-3 text-[13px] leading-relaxed" style={{ color: 'var(--text-main)' }}>
          {message?.content}
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="flex-1 rounded-full py-1.5 text-[11px] font-medium"
            style={{ background: 'var(--accent-color)', color: 'var(--accent-foreground)' }}
          >
            去看看TA
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-full px-3 py-1.5 text-[11px]"
            style={{ background: 'var(--control-soft-bg)', color: 'var(--text-sub)' }}
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompanionStatusAlertCard;