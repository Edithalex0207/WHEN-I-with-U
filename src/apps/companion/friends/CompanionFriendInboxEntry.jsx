import React from 'react';

import { getInboxPendingCount, getInboxDecidingCount } from './companionFriendInboxService';
import './companionFriendInbox.css';

/*
 * 好友广场左下角的小信箱入口（视觉参考 v2）。
 * 有待处理的信：旗子会摇、信箱轻轻晃、右上角冒数字；没有新信：
 * 旗子放下，信箱变蓝白色，不显示数字。
 */
const CompanionFriendInboxEntry = ({ companion, onOpen }) => {
  const pending = getInboxPendingCount(companion);
  const deciding = getInboxDecidingCount(companion);
  const petName = companion?.name || '小伙伴';

  const hintText = pending > 0
    ? `有 ${pending} 封信在等你拆`
    : deciding > 0
      ? `${petName}正在帮你想怎么回信`
      : '信箱空空的，过一会儿再来看看';

  return (
    <button type="button" className={`cfi-nook ${pending > 0 ? 'has' : ''}`} onClick={onOpen}>
      <i className="cfi-grass" aria-hidden="true" />
      {pending > 0 && <span className="cfi-count-pop">{pending}</span>}
      <svg className="cfi-box" viewBox="0 0 86 86" aria-hidden="true">
        <rect x="26" y="52" width="9" height="30" rx="3" fill="#C99A5B" />
        <path d="M8 52V36c0-10 9-18 20-18h24c11 0 20 8 20 18v16z" className="cfi-box-body" />
        <rect x="22" y="36" width="34" height="5" rx="2.5" fill="#fff" opacity=".85" />
        <g className="cfi-flag">
          <rect x="60" y="14" width="3" height="26" rx="1.5" fill="#B27F44" />
          <path d="M63 14h14l-4 5 4 5H63z" fill="#FFD36B" />
        </g>
      </svg>
      <span className="cfi-nook-text">
        <span className="cfi-bubble-hint">
          <b>{`${petName}的信箱`}</b>
          <span>{hintText}</span>
        </span>
      </span>
    </button>
  );
};

export default CompanionFriendInboxEntry;