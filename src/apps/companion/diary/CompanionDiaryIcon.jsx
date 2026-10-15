/*
 * CompanionDiaryIcon.jsx —— 日记入口的小图标（带心形标签和铁圈的蓝色小本子）。
 * 替换 dock 上原来的 lucide BookOpen。自带颜色，不跟随 currentColor。
 */

import React from 'react';

const CompanionDiaryIcon = ({ size = 30, className = '' }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <rect x="7" y="3.5" width="21" height="25" rx="4" fill="#7CC4F7" stroke="#3D9BEA" strokeWidth="2" />
    <rect x="13" y="9" width="12" height="10" rx="2.5" fill="#FFF9E6" />
    <path
      d="M19 17.2l-3.1-3a1.9 1.9 0 0 1 3.1-2.3 1.9 1.9 0 0 1 3.1 2.3z"
      fill="#FF86A0"
    />
    <rect x="3" y="7" width="8" height="3" rx="1.5" fill="#fff" stroke="#3D9BEA" strokeWidth="1.5" />
    <rect x="3" y="12.5" width="8" height="3" rx="1.5" fill="#fff" stroke="#3D9BEA" strokeWidth="1.5" />
    <rect x="3" y="18" width="8" height="3" rx="1.5" fill="#fff" stroke="#3D9BEA" strokeWidth="1.5" />
    <rect x="3" y="23.5" width="8" height="3" rx="1.5" fill="#fff" stroke="#3D9BEA" strokeWidth="1.5" />
    <path
      d="M27 2l.9 2.4 2.4.9-2.4.9L27 8.6l-.9-2.4-2.4-.9 2.4-.9z"
      fill="#FFD86B"
    />
  </svg>
);

export default CompanionDiaryIcon;