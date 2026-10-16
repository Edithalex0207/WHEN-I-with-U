/*
 * ClawPlush.jsx —— 娃娃机里所有"娃娃"的统一渲染组件。
 *
 * - prize.url 有值：显示你生的图（加载失败会自动退回内联 SVG，不会出现
 *   破图图标）。
 * - prize.url 为空：显示这里手绘的内联 SVG 小造型，8 款各有各的样子
 *   （布丁猫/蜂蜜小熊/棉花兔/糖霜企鹅/奶油狐狸/星砂独角兽/夜读猫头鹰/
 *   流星仔），所以图还没生出来的时候，游戏里也不会是一堆空框框。
 * - locked：图鉴里没集到的款，用 CSS 滤镜压成浅灰剪影（样式在 claw.css
 *   的 .cw-plush.is-locked）。
 *
 * 每个造型都是"贴纸风"：先画一遍粗白边，再画彩色本体，最后画五官和
 * 细节，所以叠在一起也不会糊成一团。
 */

import React, { useState } from 'react';

const EYE = '#24415A';
const CHEEK = '#FFB0C2';

const Face = ({ y = 38, spread = 8.5, cheekDx = 14, mouth = true }) => (
  <g>
    <circle cx={32 - spread} cy={y} r="2.7" fill={EYE} />
    <circle cx={32 + spread} cy={y} r="2.7" fill={EYE} />
    <circle cx={32 - spread + 0.9} cy={y - 1} r="0.9" fill="#fff" />
    <circle cx={32 + spread + 0.9} cy={y - 1} r="0.9" fill="#fff" />
    <ellipse cx={32 - cheekDx} cy={y + 5} rx="3.6" ry="2.2" fill={CHEEK} opacity="0.85" />
    <ellipse cx={32 + cheekDx} cy={y + 5} rx="3.6" ry="2.2" fill={CHEEK} opacity="0.85" />
    {mouth && (
      <path
        d={`M29 ${y + 4.5}q3 3.2 6 0`}
        stroke={EYE}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    )}
  </g>
);

const Sparkle = ({ x, y, s = 1, fill = '#FFD65A' }) => (
  <path
    d={`M${x} ${y - 3.5 * s}l${1 * s} ${2.5 * s} ${2.5 * s} ${1 * s}-${2.5 * s} ${1 * s}-${1 * s} ${2.5 * s}-${1 * s}-${2.5 * s}-${2.5 * s}-${1 * s} ${2.5 * s}-${1 * s}z`}
    fill={fill}
  />
);

/*
 * sil(f)：本体轮廓，f 有值时（描边那一遍）所有形状都填成 f（白色）；
 * detail：五官和细节，不参与描边。
 */
const SPECIES = {
  'claw-cat': {
    sil: (f) => (
      <>
        <path d="M13 28L15 8L29 19Z" fill={f || '#FFE08A'} />
        <path d="M51 28L49 8L35 19Z" fill={f || '#FFE08A'} />
        <ellipse cx="32" cy="38" rx="21" ry="19" fill={f || '#FFE08A'} />
      </>
    ),
    detail: (
      <>
        <path d="M17 21L18 13L24 18Z" fill="#FFB0C2" />
        <path d="M47 21L46 13L40 18Z" fill="#FFB0C2" />
        <path d="M27 22q5-2.4 10 0" stroke="#D98F2B" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <Face />
        <path
          d="M8 40h6M8 44l5-1.5M56 40h-6M56 44l-5-1.5"
          stroke="#D98F2B"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </>
    ),
  },
  'claw-bear': {
    sil: (f) => (
      <>
        <circle cx="15" cy="19" r="8" fill={f || '#E8B887'} />
        <circle cx="49" cy="19" r="8" fill={f || '#E8B887'} />
        <ellipse cx="32" cy="38" rx="21" ry="19" fill={f || '#E8B887'} />
      </>
    ),
    detail: (
      <>
        <circle cx="15" cy="19" r="4" fill="#F7DCC0" />
        <circle cx="49" cy="19" r="4" fill="#F7DCC0" />
        <Face y={36} mouth={false} />
        <ellipse cx="32" cy="44" rx="9" ry="6.5" fill="#FBE6D0" />
        <ellipse cx="32" cy="41.6" rx="2.6" ry="1.9" fill="#7A4A2B" />
        <path d="M32 43.4v1.6M29.4 46.2q2.6 2 5.2 0" stroke="#7A4A2B" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  'claw-bunny': {
    sil: (f) => (
      <>
        <ellipse cx="23" cy="14" rx="6" ry="13" transform="rotate(-8 23 14)" fill={f || '#FFF1F5'} />
        <ellipse cx="41" cy="14" rx="6" ry="13" transform="rotate(8 41 14)" fill={f || '#FFF1F5'} />
        <ellipse cx="32" cy="40" rx="21" ry="18" fill={f || '#FFF1F5'} />
      </>
    ),
    detail: (
      <>
        <ellipse cx="32" cy="40" rx="21" ry="18" fill="none" stroke="#F3D3DD" strokeWidth="1.2" />
        <ellipse cx="23" cy="14" rx="3" ry="9" transform="rotate(-8 23 14)" fill="#FFC4D6" />
        <ellipse cx="41" cy="14" rx="3" ry="9" transform="rotate(8 41 14)" fill="#FFC4D6" />
        <Face y={40} />
      </>
    ),
  },
  'claw-penguin': {
    sil: (f) => (
      <>
        <ellipse cx="11" cy="42" rx="4" ry="9" transform="rotate(18 11 42)" fill={f || '#8FC8EC'} />
        <ellipse cx="53" cy="42" rx="4" ry="9" transform="rotate(-18 53 42)" fill={f || '#8FC8EC'} />
        <ellipse cx="32" cy="38" rx="20" ry="19" fill={f || '#A9D8F5'} />
      </>
    ),
    detail: (
      <>
        <ellipse cx="32" cy="45" rx="12.5" ry="11" fill="#fff" />
        <Face y={33} mouth={false} />
        <path d="M29.5 37.5L34.5 37.5L32 41.2Z" fill="#FFB84D" strokeLinejoin="round" stroke="#FFB84D" strokeWidth="1" />
        <path
          d="M16 25Q18 11 32 11Q46 11 48 25Q44 20.5 40 24Q36 19.5 32 24Q28 19.5 24 24Q20 20.5 16 25Z"
          fill="#fff"
          stroke="#DCEBF8"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="16.5" r="1.3" fill="#FF86A0" />
        <circle cx="32" cy="14.5" r="1.3" fill="#7FD6BC" />
        <circle cx="40" cy="17" r="1.3" fill="#FFD65A" />
      </>
    ),
  },
  'claw-fox': {
    sil: (f) => (
      <>
        <ellipse cx="52" cy="50" rx="9" ry="5.5" transform="rotate(-35 52 50)" fill={f || '#FFB36B'} />
        <path d="M12 29L13 6L29 19Z" fill={f || '#FFB36B'} />
        <path d="M52 29L51 6L35 19Z" fill={f || '#FFB36B'} />
        <ellipse cx="32" cy="38" rx="21" ry="19" fill={f || '#FFB36B'} />
      </>
    ),
    detail: (
      <>
        <ellipse cx="57.4" cy="46.4" rx="3.2" ry="3.6" transform="rotate(-35 57.4 46.4)" fill="#fff" />
        <path d="M16.5 22L17 12.5L24 18.5Z" fill="#FFE9CF" />
        <path d="M47.5 22L47 12.5L40 18.5Z" fill="#FFE9CF" />
        <path d="M11 41L22 37L20.5 49Z" fill="#FFF5E8" />
        <path d="M53 41L42 37L43.5 49Z" fill="#FFF5E8" />
        <Face y={36} mouth={false} />
        <ellipse cx="32" cy="45" rx="9" ry="6.5" fill="#FFF5E8" />
        <ellipse cx="32" cy="42.2" rx="2.4" ry="1.8" fill="#3E2B2B" />
        <path d="M32 44v1.3M29.6 46.6q2.4 1.9 4.8 0" stroke="#3E2B2B" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  'claw-unicorn': {
    sil: (f) => (
      <>
        <circle cx="12" cy="32" r="5.5" fill={f || '#FFC4D6'} />
        <circle cx="10" cy="41" r="5" fill={f || '#BDEBDD'} />
        <path d="M14 25L16 11L26 19Z" fill={f || '#F1E7FF'} />
        <path d="M50 25L48 11L38 19Z" fill={f || '#F1E7FF'} />
        <path d="M28.5 15L32 1.5L35.5 15Z" fill={f || '#FFD65A'} />
        <ellipse cx="32" cy="39" rx="21" ry="18" fill={f || '#F1E7FF'} />
      </>
    ),
    detail: (
      <>
        <path d="M29.6 11l5.2-1.6M30.5 7.2l3.3-1" stroke="#E8A90F" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M17.5 21.5L18 15L23 19Z" fill="#FFC4D6" />
        <path d="M46.5 21.5L46 15L41 19Z" fill="#FFC4D6" />
        <Face y={39} />
        <Sparkle x={50} y={30} s={1.1} />
      </>
    ),
  },
  'claw-owl': {
    sil: (f) => (
      <>
        <path d="M14 27L12 11L27 20Z" fill={f || '#8E94E8'} />
        <path d="M50 27L52 11L37 20Z" fill={f || '#8E94E8'} />
        <ellipse cx="32" cy="39" rx="21" ry="19" fill={f || '#8E94E8'} />
      </>
    ),
    detail: (
      <>
        <ellipse cx="32" cy="48" rx="12" ry="8.5" fill="#C9CCF7" />
        <path d="M26 47q3 3 6 0q3 3 6 0" stroke="#A9AEEF" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <circle cx="23.5" cy="34" r="7.2" fill="#fff" />
        <circle cx="40.5" cy="34" r="7.2" fill="#fff" />
        <circle cx="24" cy="34.5" r="3.4" fill={EYE} />
        <circle cx="41" cy="34.5" r="3.4" fill={EYE} />
        <circle cx="25.1" cy="33.3" r="1.1" fill="#fff" />
        <circle cx="42.1" cy="33.3" r="1.1" fill="#fff" />
        <path d="M29.8 39.5L34.2 39.5L32 43.5Z" fill="#FFC94D" stroke="#FFC94D" strokeWidth="1" strokeLinejoin="round" />
        <ellipse cx="14.5" cy="42" rx="3.2" ry="2" fill={CHEEK} opacity="0.8" />
        <ellipse cx="49.5" cy="42" rx="3.2" ry="2" fill={CHEEK} opacity="0.8" />
        <path d="M52 6a6 6 0 1 0 5.5 8.5a4.8 4.8 0 1 1-5.5-8.5z" fill="#FFE9A0" />
      </>
    ),
  },
  'claw-star': {
    sil: (f) => (
      <polygon
        points="32,11 39.4,24.9 54.8,27.6 43.9,38.9 46.1,54.4 32,47.5 17.9,54.4 20.1,38.9 9.2,27.6 24.7,24.9"
        fill={f || '#FFD65A'}
        stroke={f ? '#fff' : '#FFD65A'}
        strokeWidth={f ? 10 : 5}
        strokeLinejoin="round"
      />
    ),
    detail: (
      <>
        <Face y={37} spread={6} cheekDx={10.5} />
        <Sparkle x={8} y={12} s={1.1} />
        <Sparkle x={57} y={10} s={0.9} fill="#7FD6BC" />
        <circle cx="6" cy="56" r="1.6" fill="#FF86A0" />
        <circle cx="58" cy="56" r="1.2" fill="#3D9BEA" />
      </>
    ),
  },
};

const FALLBACK = {
  sil: (f) => <ellipse cx="32" cy="38" rx="21" ry="19" fill={f || '#CDE6FA'} />,
  detail: <Face />,
};

export const PlushSvg = ({ id, size = 56 }) => {
  const spec = SPECIES[id] || FALLBACK;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ overflow: 'visible' }}
    >
      <g fill="#fff" stroke="#fff" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
        {spec.sil('#fff')}
      </g>
      <g>{spec.sil()}</g>
      <g>{spec.detail}</g>
    </svg>
  );
};

const ClawPlush = ({ prize, size = 56, locked = false, className = '' }) => {
  const [broken, setBroken] = useState(false);
  const cls = `cw-plush${locked ? ' is-locked' : ''}${className ? ` ${className}` : ''}`;

  if (prize?.url && !broken) {
    return (
      <img
        src={prize.url}
        alt=""
        draggable={false}
        className={cls}
        style={{ width: size, height: size, objectFit: 'contain' }}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <span className={cls} style={{ width: size, height: size }}>
      <PlushSvg id={prize?.id} size={size} />
    </span>
  );
};

export default ClawPlush;