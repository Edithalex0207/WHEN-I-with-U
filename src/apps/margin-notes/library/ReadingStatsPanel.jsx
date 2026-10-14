// src/apps/margin-notes/library/ReadingStatsPanel.jsx
//
// 藏书页里的「阅读时长」一栏：这本书最近 7 天每天读了多久（柱状条）、
// 今天、连续阅读天数、本书累计。数据来自 readerDailyReading，由阅读页的计时写入。
// 柱状条的颜色 fill 跟着当前这本书的封面色走。

import React, { useEffect, useMemo, useState } from 'react';

import {
  formatDuration,
  getBookReadingStats,
} from './readingTimeService';

import './reader.css';

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
// 柱状条的满格至少对应 20 分钟，这样只读了一两分钟的那天不会顶满整根柱子
const MIN_SCALE_SECONDS = 20 * 60;
const BAR_HEIGHT = 44;

const weekdayOf = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()];
};

const minutesLabel = (seconds) => {
  if (seconds <= 0) return '-';
  if (seconds < 60) return '<1';
  return String(Math.round(seconds / 60));
};

export default function ReadingStatsPanel({ bookId, fill }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    setStats(null);

    getBookReadingStats(bookId).then((next) => {
      if (alive) setStats(next);
    });

    return () => {
      alive = false;
    };
  }, [bookId]);

  const days = stats?.days || [];

  const scale = useMemo(
    () => Math.max(MIN_SCALE_SECONDS, ...days.map((day) => day.seconds)),
    [days]
  );

  const hasAny = Boolean(stats && stats.totalSeconds > 0);

  return (
    <section className="mn-lib-time" aria-label="阅读时长">
      <div className="mn-lib-time__head">
        <span className="mn-lib-time__title">阅读时长</span>
        <span className="mn-lib-time__sub">
          {!stats
            ? ''
            : stats.weekSeconds > 0
              ? `近 7 天 ${formatDuration(stats.weekSeconds)}`
              : '近 7 天没有阅读记录'}
        </span>
      </div>

      <div className="mn-lib-time__days">
        {(days.length ? days : Array.from({ length: 7 }, () => null)).map(
          (day, index) => {
            const isToday = index === 6;
            const seconds = day ? day.seconds : 0;
            const height =
              seconds > 0
                ? Math.max(3, Math.round((seconds / scale) * BAR_HEIGHT))
                : 0;

            return (
              <div
                key={day ? day.date : index}
                className={`mn-lib-day${isToday ? ' is-today' : ''}`}
              >
                <span className="mn-lib-day__label">
                  {isToday ? '今' : day ? weekdayOf(day.date) : ''}
                </span>
                <div className="mn-lib-day__track">
                  <div
                    className="mn-lib-day__fill"
                    style={{ height, background: fill }}
                  />
                </div>
                <span className="mn-lib-day__mins">{minutesLabel(seconds)}</span>
              </div>
            );
          }
        )}
      </div>

      <div className="mn-rd-stats-note">
        {hasAny ? (
          <>
            <span>今天 {formatDuration(stats.todaySeconds)}</span>
            {stats.streak > 0 && (
              <>
                <span className="mn-rd-dot" aria-hidden="true" />
                <span>连续阅读 {stats.streak} 天</span>
              </>
            )}
            <span className="mn-rd-dot" aria-hidden="true" />
            <span>本书共读 {formatDuration(stats.totalSeconds)}</span>
          </>
        ) : (
          <span>开始读书后，每天读了多久会记在这里。</span>
        )}
      </div>
    </section>
  );
}