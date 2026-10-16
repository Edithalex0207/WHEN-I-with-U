/*
 * CompanionSchoolIcon.jsx —— 「上学」入口的小图标（学校小房子 + 旗杆上一面
 * 小旗），照着 school-home-preview2.html 里定稿的 #school 图形画，跟娃娃机/
 * 日记/每日问答图标统一视觉语言（自带颜色，不跟随 currentColor，右上角带
 * 同款小星星点缀）。
 *
 * 小红点（可以办理入学 / 满 20 节可以升班时亮）不在这个图标里画，由调用方
 * 在 dock 按钮里另外叠一个 <b className="cp-badge sh-dot" />（样式见
 * schoolHome.css），这个文件只负责图标本身。
 */

import React from 'react';

const CompanionSchoolIcon = ({ size = 30, className = '' }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    {/* 旗杆 */}
    <path d="M16 2.8v6" stroke="#2F86CC" strokeWidth="2" strokeLinecap="round" />
    {/* 小旗 */}
    <path d="M16.8 3.6h6.2l-1.6 2.2 1.6 2.2h-6.2z" fill="#FF86A0" />
    {/* 屋顶 */}
    <path
      d="M4.5 15L16 8.5 27.5 15"
      fill="#FFD3E1"
      stroke="#2F86CC"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
    {/* 房身 */}
    <rect x="6.5" y="14.5" width="19" height="13" rx="2.5" fill="#DCEEFF" stroke="#2F86CC" strokeWidth="2" strokeLinejoin="round" />
    {/* 门 */}
    <rect x="13" y="19" width="6" height="8.5" rx="3" fill="#fff" stroke="#2F86CC" strokeWidth="1.8" />
    {/* 窗 */}
    <circle cx="10.5" cy="19.5" r="1.6" fill="#2F86CC" />
    <circle cx="21.5" cy="19.5" r="1.6" fill="#2F86CC" />
    {/* 右上角小星星（跟娃娃机图标同款画法） */}
    <path d="M27.3 1.8l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="#25967A" transform="translate(1 0)" />
  </svg>
);

export default CompanionSchoolIcon;