/*
 * companionMoodIcons.jsx —— 心情日历用到的小脸图标。
 *
 * 五种心情直接复用 companionPage.css 里已经有的配色（butter/mint/sky/
 * accent-soft/heart-soft），没有引入新颜色。CompanionMoodFace 是日历
 * 格子、选择器里都会用到的那张小圆脸；CompanionMoodEntryIcon 是小伙伴
 * 主界面上打开日历的那个圆按钮用的图标（代表 char 和用户各一张，叠在
 * 一起，不画五官，
 * 跟 CompanionDiaryIcon 一样是自带颜色的扁平小图，不跟随 currentColor）。
 */

import React from 'react';

export const MOOD_KEYS = {
  HAPPY: 'happy',
  CALM: 'calm',
  SAD: 'sad',
  SURPRISED: 'surprised',
  ANGRY: 'angry',
};

export const MOOD_DEFS = [
  { key: MOOD_KEYS.HAPPY, label: '开心', bg: '#FFF4C9', fg: '#D19A0A' },
  { key: MOOD_KEYS.CALM, label: '平静', bg: '#D5F5EA', fg: '#25967A' },
  { key: MOOD_KEYS.SAD, label: '难过', bg: '#DCEEFF', fg: '#2F86CC' },
  { key: MOOD_KEYS.SURPRISED, label: '惊讶', bg: '#E1F0FE', fg: '#3D9BEA' },
  { key: MOOD_KEYS.ANGRY, label: '生气', bg: '#FFEAEF', fg: '#FF86A0' },
];

const MOOD_BY_KEY = MOOD_DEFS.reduce((acc, def) => {
  acc[def.key] = def;
  return acc;
}, {});

const FACE_PARTS = {
  [MOOD_KEYS.HAPPY]: (fg) => (
    <>
      <circle cx="14" cy="18" r="2" fill={fg} />
      <circle cx="26" cy="18" r="2" fill={fg} />
      <path d="M13 24c3.5 3 10.5 3 14 0" fill="none" stroke={fg} strokeWidth="2.3" strokeLinecap="round" />
    </>
  ),
  [MOOD_KEYS.CALM]: (fg) => (
    <>
      <path d="M12.5 18.5h3M24.5 18.5h3" stroke={fg} strokeWidth="2.3" strokeLinecap="round" />
      <path d="M14 25c3-1.6 9-1.6 12 0" fill="none" stroke={fg} strokeWidth="2.3" strokeLinecap="round" />
    </>
  ),
  [MOOD_KEYS.SAD]: (fg) => (
    <>
      <circle cx="14" cy="18" r="2" fill={fg} />
      <circle cx="26" cy="18" r="2" fill={fg} />
      <path d="M13 27c3.5-3 10.5-3 14 0" fill="none" stroke={fg} strokeWidth="2.3" strokeLinecap="round" />
      <path d="M27 20c1.5 1 1.5 4 0 5" fill="none" stroke={fg} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  [MOOD_KEYS.SURPRISED]: (fg) => (
    <>
      <circle cx="14" cy="18" r="2.4" fill={fg} />
      <circle cx="26" cy="18" r="2.4" fill={fg} />
      <circle cx="20" cy="26" r="2.6" fill={fg} />
    </>
  ),
  [MOOD_KEYS.ANGRY]: (fg) => (
    <>
      <path d="M11 16l5 2M29 16l-5 2" stroke={fg} strokeWidth="2.3" strokeLinecap="round" />
      <path d="M14 27c3-2.4 9-2.4 12 0" fill="none" stroke={fg} strokeWidth="2.3" strokeLinecap="round" />
    </>
  ),
};

/*
 * 一张心情小圆脸。mood 认不出来（比如这天还没设置）就画一个空的灰脸——
 * 调用方一般会在没数据的时候直接换成一个灰点而不渲染这个组件，这里的
 * 兜底只是以防万一传进来一个意外的值。
 */
export const CompanionMoodFace = ({ mood, size = 32, className = '' }) => {
  const def = MOOD_BY_KEY[mood];
  const bg = def?.bg || '#EDF5FD';
  const fg = def?.fg || '#9DB8CD';
  const drawFace = FACE_PARTS[mood];

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="20" cy="20" r="19" fill={bg} />
      {drawFace ? drawFace(fg) : <circle cx="20" cy="20" r="3" fill={fg} opacity="0.5" />}
    </svg>
  );
};

export default CompanionMoodFace;

export const CompanionMoodEntryIcon = ({ size = 20, className = '' }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <path d="M9 11a4 4 0 1 1 6-3.4A4 4 0 0 1 9 11z" fill="#FFF4C9" stroke="#D19A0A" strokeWidth="1.6" />
    <path d="M15 21a4 4 0 1 0-6-3.4A4 4 0 0 0 15 21z" fill="#DCEEFF" stroke="#2F86CC" strokeWidth="1.6" />
  </svg>
);