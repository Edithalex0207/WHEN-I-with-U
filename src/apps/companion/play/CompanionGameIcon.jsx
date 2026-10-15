/*
 * CompanionGameIcon.jsx —— 小游戏入口的小图标（可爱风格，跟日记图标
 * 统一视觉语言）。替换 dock 上原来的线框接住掉落物 svg。自带颜色，
 * 不跟随 currentColor。
 */

import React from 'react';

const CompanionGameIcon = ({ size = 30, className = '' }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M5 16c0-3.5 5-5.5 11-5.5s11 2 11 5.5-2.5 8-5 8c-1.3 0-1.6-1.5-3-1.5h-6c-1.4 0-1.7 1.5-3 1.5-2.5 0-5-4.5-5-8z"
      fill="#DCEEFF"
      stroke="#2F86CC"
      strokeWidth="2"
    />
    <circle cx="11" cy="16" r="2.2" fill="#2F86CC" />
    <circle cx="21" cy="14.3" r="1.2" fill="#2F86CC" />
    <circle cx="23.3" cy="16.6" r="1.2" fill="#2F86CC" />
    <path d="M14 7l-1.4 3.2L16 9z" fill="#FF86A0" />
  </svg>
);

export default CompanionGameIcon;