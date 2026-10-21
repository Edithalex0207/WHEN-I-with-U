/*
 * SweetStreetDockIcon.jsx —— 小伙伴页 dock 里「小街」入口的图标（纸杯蛋糕）。
 * 跟其他 dock 图标一样自带颜色、不跟随 currentColor。
 */

import React from 'react';

const SweetStreetDockIcon = ({ size = 30, className = '' }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    {/* 纸杯 */}
    <path
      d="M9 17.5h14l-1.7 8a1.6 1.6 0 0 1-1.6 1.3h-7.4a1.6 1.6 0 0 1-1.6-1.3z"
      fill="#FFC9A8"
    />
    <path d="M12.5 18.5l.8 7M16 18.5v7M19.5 18.5l-.8 7" stroke="#F5A982" strokeWidth="1.2" strokeLinecap="round" />
    {/* 奶油 */}
    <path
      d="M8 17.5c0-2.6 2-4 4-4 0-2.6 2-4.5 4-4.5s4 1.9 4 4.5c2 0 4 1.4 4 4z"
      fill="#FF9DB5"
    />
    <path d="M12 15.2c1.6 1 3 1 4.6 0" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" opacity="0.85" />
    {/* 樱桃 */}
    <circle cx="16" cy="7" r="2.2" fill="#E8386A" />
    <path d="M16 4.8c.5-1.5 1.5-2 2.6-2" stroke="#6FBF8F" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    {/* 星星点缀 */}
    <path d="M26 6l.7 1.6 1.6.7-1.6.7L26 10.6l-.7-1.6-1.6-.7 1.6-.7z" fill="#FFD27A" />
  </svg>
);

export default SweetStreetDockIcon;
