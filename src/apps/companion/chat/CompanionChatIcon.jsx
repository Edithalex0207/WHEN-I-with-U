/*
 * CompanionChatIcon.jsx —— "聊天"入口的小图标（对话气泡 + 爱心），
 * 跟任务/背包/托管等其它 dock 图标统一视觉语言。自带颜色，不跟随 currentColor。
 */

import React from 'react';

const CompanionChatIcon = ({ size = 30, className = '' }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M7 5h18a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H15l-6 5v-5H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z"
      fill="#DCEEFF"
      stroke="#2F86CC"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M13.3 11.2c-.9-1.6-3.5-1.4-3.5.7 0 1.6 2 2.8 3.5 4 1.5-1.2 3.5-2.4 3.5-4 0-2.1-2.6-2.3-3.5-.7z"
      fill="#FF86A0"
    />
    <circle cx="20.5" cy="12.5" r="1.4" fill="#2F86CC" />
    <circle cx="24" cy="12.5" r="1.4" fill="#2F86CC" />
  </svg>
);

export default CompanionChatIcon;