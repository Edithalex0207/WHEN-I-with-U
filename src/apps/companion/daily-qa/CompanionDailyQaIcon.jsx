/*
 * CompanionDailyQaIcon.jsx —— 每日问答入口的小图标（折角卡片 + 问号，
 * 跟日记/日签图标统一视觉语言，复用同一套折角卡片轮廓）。自带颜色，
 * 不跟随 currentColor。
 */

import React from 'react';

const CompanionDailyQaIcon = ({ size = 30, className = '' }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M7 5h13l5 5v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
      fill="#FFEAEF"
      stroke="#FF86A0"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M20 5v5h5" fill="none" stroke="#FF86A0" strokeWidth="2" strokeLinejoin="round" />
    <path
      d="M12.3 14.2a3 3 0 1 1 4 2.8c-1 .4-1.5 1-1.5 2.2"
      fill="none"
      stroke="#FF86A0"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    <circle cx="14.8" cy="23" r="1.3" fill="#FF86A0" />
    <path d="M27 2l.9 2.4 2.4.9-2.4.9L27 8.6l-.9-2.4-2.4-.9 2.4-.9z" fill="#25967A" />
  </svg>
);

export default CompanionDailyQaIcon;