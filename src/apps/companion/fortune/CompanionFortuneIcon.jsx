/*
 * CompanionFortuneIcon.jsx —— 日签入口的小图标（可爱风格，跟日记图标
 * 统一视觉语言）。替换 dock 上原来的线框星星 svg。自带颜色，不跟随
 * currentColor。嘴角是往上的笑脸（之前第一版画反了，已经改过来）。
 */

import React from 'react';

const CompanionFortuneIcon = ({ size = 30, className = '' }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M9 5h11l4 4.5V26a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
      fill="#FFF4C9"
      stroke="#D19A0A"
      strokeWidth="2"
    />
    <path d="M20 5v4.5h4" fill="none" stroke="#D19A0A" strokeWidth="2" strokeLinejoin="round" />
    <path d="M11 22c3 2.4 7 2.4 10 0" fill="none" stroke="#FF86A0" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12.5" cy="14" r="1.3" fill="#FF86A0" />
    <circle cx="19.5" cy="14" r="1.3" fill="#FF86A0" />
    <path d="M27 2l.9 2.4 2.4.9-2.4.9L27 8.6l-.9-2.4-2.4-.9 2.4-.9z" fill="#3D9BEA" />
  </svg>
);

export default CompanionFortuneIcon;