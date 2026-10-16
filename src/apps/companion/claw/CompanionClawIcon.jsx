/*
 * CompanionClawIcon.jsx —— 娃娃机入口的小图标（玻璃箱轮廓 + 里面一只
 * 小娃娃 + 上方抓手），跟日记/每日问答图标统一视觉语言（自带颜色，不
 * 跟随 currentColor，右上角带同款小星星点缀）。
 */

import React from 'react';

const CompanionClawIcon = ({ size = 30, className = '' }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <rect
      x="5"
      y="13"
      width="22"
      height="15"
      rx="3"
      fill="#DCEEFF"
      stroke="#2F86CC"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <circle cx="14.5" cy="22" r="3.6" fill="#FFD3E1" />
    <path d="M12.2 19.6l-1.1-1.8M16.8 19.6l1.1-1.8" stroke="#2F86CC" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    <path d="M16 5v6" stroke="#2F86CC" strokeWidth="2" strokeLinecap="round" />
    <path
      d="M11.5 11c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"
      fill="none"
      stroke="#2F86CC"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path d="M11.5 11l-1.8 3.2M20.5 11l1.8 3.2" stroke="#2F86CC" strokeWidth="2" strokeLinecap="round" />
    <path d="M27 2l.9 2.4 2.4.9-2.4.9L27 8.6l-.9-2.4-2.4-.9 2.4-.9z" fill="#25967A" />
  </svg>
);

export default CompanionClawIcon;