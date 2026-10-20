/*
 * CompanionProfileIcon.jsx —— 小伙伴页面顶部「档案」圆按钮用的图标。
 *
 * 一张小小的名牌：圆角卡片、一颗小爱心、两条文字线，代表"这只小伙伴的
 * 资料"。跟 CompanionDiaryIcon 一样是自带颜色的扁平小图，不跟随
 * currentColor；颜色全部取自 companionPage.css 里已有的 --cp-* 变量，
 * 没有引入新颜色。
 */

import React from 'react';

const CompanionProfileIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3" y="5" width="18" height="14" rx="4" fill="var(--cp-accent-soft)" stroke="var(--cp-accent)" strokeWidth="1.6" />
    <path
      d="M8.6 14.4s-2.4-1.5-2.4-3.2c0-1 .7-1.7 1.6-1.7.5 0 .9.3 1.1.7.2-.4.6-.7 1.1-.7.9 0 1.6.7 1.6 1.7 0 1.7-3 3.2-3 3.2z"
      fill="var(--cp-heart)"
    />
    <path d="M13.6 10.4h4.2M13.6 13.4h3" fill="none" stroke="var(--cp-accent)" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export default CompanionProfileIcon;