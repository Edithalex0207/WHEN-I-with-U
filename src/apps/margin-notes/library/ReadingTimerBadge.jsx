// src/apps/margin-notes/library/ReadingTimerBadge.jsx
//
// 阅读页顶部居中的「本次已读 N 分钟」，同时负责真正的阅读计时。
// 计时规则：只有「页面在前台」并且「最近 60 秒内有过操作（点击、触摸、滚动、按键）」
// 的每一秒才算阅读时间，放着不动或者切到别的应用就不算。
// 累计的秒数每 15 秒、切到后台、离开阅读页时写进 readerDailyReading。
// 计时器自己维护状态，只在「分钟数」变化时才重新渲染，不会拖累整页正文。

import React, { useEffect, useRef, useState } from 'react';

import { addReadingSeconds } from './readingTimeService';

const IDLE_LIMIT_MS = 60 * 1000;
const FLUSH_EVERY_SECONDS = 15;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'];

export default function ReadingTimerBadge({ bookId }) {
  const [minutes, setMinutes] = useState(0);

  const lastActiveRef = useRef(Date.now());
  const pendingRef = useRef(0);
  const sessionRef = useRef(0);

  useEffect(() => {
    lastActiveRef.current = Date.now();
    pendingRef.current = 0;
    sessionRef.current = 0;

    const markActive = () => {
      lastActiveRef.current = Date.now();
    };

    const flush = () => {
      const seconds = pendingRef.current;
      if (seconds > 0) {
        pendingRef.current = 0;
        addReadingSeconds(bookId, seconds);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    ACTIVITY_EVENTS.forEach((name) =>
      window.addEventListener(name, markActive, { passive: true })
    );
    // 滚动不会冒泡，用捕获才能收到阅读区里的滚动
    document.addEventListener('scroll', markActive, {
      capture: true,
      passive: true,
    });
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', flush);

    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActiveRef.current > IDLE_LIMIT_MS) return;

      pendingRef.current += 1;
      sessionRef.current += 1;

      const nextMinutes = Math.floor(sessionRef.current / 60);
      setMinutes((previous) => (previous === nextMinutes ? previous : nextMinutes));

      if (pendingRef.current >= FLUSH_EVERY_SECONDS) flush();
    }, 1000);

    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((name) =>
        window.removeEventListener(name, markActive)
      );
      document.removeEventListener('scroll', markActive, { capture: true });
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [bookId]);

  return (
    <div className="mn-rd-badge" role="status">
      <span className="mn-rd-badge__dot" aria-hidden="true" />
      {minutes < 1 ? '刚翻开这本书' : `本次已读 ${minutes} 分钟`}
    </div>
  );
}