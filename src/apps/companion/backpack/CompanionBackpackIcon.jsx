/*
 * CompanionBackpackIcon.jsx —— 背包入口的小图标（可爱风格，跟日记图标
 * 统一视觉语言）。替换 dock 上原来的 lucide ShoppingBasket。自带颜色，
 * 不跟随 currentColor。
 */

import React from 'react';

const CompanionBackpackIcon = ({ size = 30, className = '' }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M8 13c0-4 3.5-7 8-7s8 3 8 7v9c0 3-2.5 5.5-5.5 5.5h-5A5.5 5.5 0 0 1 8 22z"
      fill="#D5F5EA"
      stroke="#25967A"
      strokeWidth="2"
    />
    <path d="M12 6.5a4 4 0 0 1 8 0" fill="none" stroke="#25967A" strokeWidth="2" strokeLinecap="round" />
    <rect x="13.5" y="13.5" width="5" height="4.5" rx="1.5" fill="#fff" stroke="#25967A" strokeWidth="1.6" />
    <path d="M27 9l.7 1.8 1.8.7-1.8.7L27 14l-.7-1.8-1.8-.7 1.8-.7z" fill="#FFD86B" />
  </svg>
);

export default CompanionBackpackIcon;