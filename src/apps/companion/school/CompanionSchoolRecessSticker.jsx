/*
 * CompanionSchoolRecessSticker.jsx —— 课间事件里的两种贴图：同学小动物、
 * 石头剪刀布的手势。
 *
 * 都是"贴图位"：数据里（companionSchoolRecessData.js）填了图片地址就显示
 * 图，并自动描一圈白边；没填就显示占位——纯色底加名字第一个字（同学）、
 * 圆角方块加手势名字（手势），不用代码硬画小动物。
 *
 * 样式在 schoolRecess.css（前缀 rc-）。占位底色来自 school.css 的
 * sd-tone-*，所以引用本组件的弹窗需要同时引入 school.css。
 */

import React from 'react';

import { RECESS_HAND_STICKERS, RECESS_HAND_LABELS } from './companionSchoolRecessData';

/**
 * 同学贴图。
 * @param {object} classmate  RECESS_CLASSMATES 里的一项
 * @param {string} mood       normal / happy / sad / wink；对应贴图没填就退回 normal
 * @param {number} size       边长（px）
 */
export const ClassmateSticker = ({ classmate, mood = 'normal', size = 72, className = '' }) => {
  const stickers = classmate?.stickers || {};
  const url = stickers[mood] || stickers.normal || '';
  const name = classmate?.name || '同学';

  if (url) {
    return (
      <span className={`rc-sticker ${className}`} style={{ width: size, height: size }}>
        <img src={url} alt={name} draggable={false} />
      </span>
    );
  }
  return (
    <span
      className={`rc-sticker is-ph sd-tone-${classmate?.tone || 'butter'} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      role="img"
      aria-label={name}
    >
      {name.slice(0, 1)}
    </span>
  );
};

/**
 * 手势贴图。
 * @param {string} hand   rock / scissors / paper
 * @param {number} size   边长（px）
 */
export const HandSticker = ({ hand, size = 64, className = '' }) => {
  const url = RECESS_HAND_STICKERS[hand] || '';
  const label = RECESS_HAND_LABELS[hand] || '';

  if (url) {
    return (
      <span className={`rc-sticker ${className}`} style={{ width: size, height: size }}>
        <img src={url} alt={label} draggable={false} />
      </span>
    );
  }
  return (
    <span
      className={`rc-sticker is-ph is-hand sd-tone-sky ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.3) }}
      role="img"
      aria-label={label}
    >
      {label}
    </span>
  );
};
