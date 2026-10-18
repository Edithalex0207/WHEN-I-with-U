/*
 * CompanionFriendIcon.jsx —— "好友"入口的小图标（两只小动物 + 简单线条），
 * 跟任务/背包/托管等其它 dock 图标统一视觉语言。自带颜色，不跟随
 * currentColor。样子照抄 friends_preview_v2.html 里 dock 那一块的 SVG。
 */

import React from 'react';

const CompanionFriendIcon = ({ size = 30, className = '' }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="11" cy="13" r="5" fill="#FFF4C9" stroke="#D19A0A" strokeWidth="2" />
    <circle cx="22" cy="13" r="5" fill="#FFEAEF" stroke="#FF86A0" strokeWidth="2" />
    <path
      d="M3.5 27c0-4.4 3.4-7 7.5-7s7.5 2.6 7.5 7M14 27c.4-3.6 3.6-6 8-6s7.6 2.4 7.5 6"
      fill="none"
      stroke="#3D9BEA"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export default CompanionFriendIcon;