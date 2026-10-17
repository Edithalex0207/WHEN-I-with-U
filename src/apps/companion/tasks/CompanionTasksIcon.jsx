/*
 * CompanionTasksIcon.jsx —— 每日任务入口的小图标（迷你记事本 + 小爱心），
 * 跟背包/日签等其它 dock 图标统一视觉语言。自带颜色，不跟随 currentColor。
 */

import React from 'react';

const CompanionTasksIcon = ({ size = 30, className = '' }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <rect x="7" y="6" width="19" height="22" rx="4" fill="#FFF9E6" stroke="#D19A0A" strokeWidth="2" />
    <rect x="5" y="4.5" width="3.4" height="5.5" rx="1.7" fill="#7CC4F7" stroke="#3D9BEA" strokeWidth="1.4" />
    <rect x="5" y="13.2" width="3.4" height="5.5" rx="1.7" fill="#7CC4F7" stroke="#3D9BEA" strokeWidth="1.4" />
    <rect x="5" y="21.9" width="3.4" height="5.5" rx="1.7" fill="#7CC4F7" stroke="#3D9BEA" strokeWidth="1.4" />
    <path d="M13 13h9M13 18h6" stroke="#9DB8CD" strokeWidth="1.8" strokeLinecap="round" />
    <path
      d="M24 21.5c-.9-1.6-3.5-1.4-3.5.7 0 1.6 2 2.8 3.5 4 1.5-1.2 3.5-2.4 3.5-4 0-2.1-2.6-2.3-3.5-.7z"
      fill="#FF86A0"
    />
  </svg>
);

export default CompanionTasksIcon;