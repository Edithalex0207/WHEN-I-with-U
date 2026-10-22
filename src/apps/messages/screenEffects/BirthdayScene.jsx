// src/apps/messages/screenEffects/BirthdayScene.jsx
//
// 生日全屏文字的"星夜"画面：深蓝夜空、闪烁的星星、偶尔划过的流星、
// 上下两条慢慢画出来的星座连线，中间是歌词式排版的祝福词，
// 底部是 Happy Birthday。配色固定，不跟随 App 主题。
//
// 只负责画面本身；什么时候播、播多久、淡出和点击关闭，
// 都由 FullscreenEffectLayer 管（它在外面套 .sfx-root）。

import React, { useMemo } from 'react';

import { buildBirthdayLayout } from './birthdayLayout';
import './birthdayScene.css';

const round = (value, digits = 1) => Number(value.toFixed(digits));

const ALIGN_TO_FLEX = { start: 'flex-start', center: 'center', end: 'flex-end' };
const ALIGN_TO_TEXT = { start: 'left', center: 'center', end: 'right' };

// 固定种子的伪随机，星星每次出现在同一批位置，重新渲染也不会跳。
const buildStars = () => {
  let seed = 5;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  return Array.from({ length: 30 }, () => {
    const duration = 2.4 + rnd() * 3;
    return {
      top: round(rnd() * 96),
      left: round(rnd() * 98),
      size: round(1 + rnd() * 1.6),
      duration: round(duration),
      delay: round(-rnd() * duration, 2),
    };
  });
};

const CONSTELLATION_A = {
  path: 'M44 150 L116 98 L190 160 L266 104 L346 176',
  points: [[44, 150], [116, 98], [190, 160], [266, 104], [346, 176]],
};

const CONSTELLATION_B = {
  path: 'M40 700 L110 752 L192 694 L276 748 L350 680',
  points: [[40, 700], [110, 752], [192, 694], [276, 748], [350, 680]],
};

const BirthdayScene = ({ lines, dateLabel = '' }) => {
  const layout = useMemo(() => buildBirthdayLayout(lines), [lines]);
  const stars = useMemo(buildStars, []);

  return (
    <div className="bday-scene">
      <div className="bday-stars" aria-hidden="true">
        {stars.map((star, index) => (
          <span
            key={index}
            className="bday-star"
            style={{
              top: `${star.top}%`,
              left: `${star.left}%`,
              width: star.size,
              height: star.size,
              animation: `bday-twinkle ${star.duration}s ease-in-out ${star.delay}s infinite`,
            }}
          />
        ))}
      </div>

      <span className="bday-meteor bday-meteor--a" aria-hidden="true" />
      <span className="bday-meteor bday-meteor--b" aria-hidden="true" />

      <svg
        className="bday-constellation"
        viewBox="0 0 390 844"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <path className="bday-path bday-path--a" d={CONSTELLATION_A.path} pathLength="1" />
        <g className="bday-dots bday-dots--a">
          {CONSTELLATION_A.points.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" />
          ))}
        </g>

        <path className="bday-path bday-path--b" d={CONSTELLATION_B.path} pathLength="1" />
        <g className="bday-dots bday-dots--b">
          {CONSTELLATION_B.points.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" />
          ))}
        </g>
      </svg>

      {dateLabel && <div className="bday-date">{dateLabel}</div>}

      <div className="bday-lines">
        {layout.map((line, index) => (
          <div
            key={index}
            className={`bday-line${line.emphasis ? ' bday-line--em' : ''}`}
            style={{
              alignSelf: ALIGN_TO_FLEX[line.align] || 'center',
              textAlign: ALIGN_TO_TEXT[line.align] || 'center',
              // 窄屏上按视口宽度收缩，避免大字号折行溢出
              fontSize: `min(${line.size}px, ${round(line.size / 4.5)}vw)`,
              '--bday-enter': line.enter,
              '--bday-delay': `${line.delay}s`,
            }}
          >
            {line.text}
          </div>
        ))}
      </div>

      <div className="bday-caption" aria-hidden="true">
        <span className="bday-caption-line" />
        <span className="bday-caption-text">Happy Birthday</span>
      </div>
    </div>
  );
};

export default BirthdayScene;