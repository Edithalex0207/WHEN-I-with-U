/*
 * CompanionCustodyIcon.jsx —— "托管"入口的小图标（小屋 + 爱心），
 * 跟任务/背包等其它 dock 图标统一视觉语言。自带颜色，不跟随 currentColor。
 */

import React from 'react';

const CompanionCustodyIcon = ({ size = 30, className = '' }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M16 5 4 13.5V27a2 2 0 0 0 2 2h7v-9h6v9h7a2 2 0 0 0 2-2V13.5L16 5z"
      fill="#FFF4C9"
      stroke="#D19A0A"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M12.3 16.2c-.9-1.6-3.5-1.4-3.5.7 0 1.6 2 2.8 3.5 4 1.5-1.2 3.5-2.4 3.5-4 0-2.1-2.6-2.3-3.5-.7z"
      fill="#FF86A0"
    />
  </svg>
);

export default CompanionCustodyIcon;