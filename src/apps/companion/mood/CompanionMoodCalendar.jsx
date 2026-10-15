/*
 * CompanionMoodCalendar.jsx —— 心情日历（Slice A：只有日历本身 + 用户自己
 * 点格子记录心情；char（角色，也就是小伙伴背后的那个聊天角色）那边的心情
 * 由 AI 在每天晚上自动判断，见 Slice B 的 companionMoodScheduler.js /
 * companionMoodAiService.js，这一片还没做，所以现在每个格子左边的
 * "char 心情"点一直是空的灰点，是正常的）。
 *
 * 【命名澄清】：这里的 charMood 是角色在对话里的情绪判断，跟
 * companion.mood（小伙伴自己的养成数值，满意度那种）完全是两回事，
 * 两者互不读写。
 *
 * 外层弹窗壳沿用项目里其它 companion 弹窗的 .cp-overlay / .cp-backdrop /
 * .cp-panel.bottom 约定（照抄 CompanionSceneModal.jsx 的结构）。
 *
 * Props:
 *   companionId number   — 小伙伴 ID
 *   onClose     function — 关闭整个日历弹窗
 */

import React, { useEffect, useMemo, useState } from 'react';

import { getMonthMoods, setUserMood, getTodayDateStr } from './companionMoodService';
import { CompanionMoodFace, MOOD_DEFS } from './companionMoodIcons';
import './mood.css';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const pad2 = (n) => String(n).padStart(2, '0');
const toDateStr = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

/* 铺满整个日历网格需要的格子：前面补上月的空位，后面补到 7 的整数倍 */
const buildGrid = (year, month) => {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

const CompanionMoodCalendar = ({ companionId, onClose }) => {
  const today = useMemo(() => new Date(), []);
  const todayStr = getTodayDateStr();

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [moods, setMoods] = useState({});
  const [pickerDate, setPickerDate] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getMonthMoods(companionId, year, month).then((data) => {
      if (active) setMoods(data);
    });
    return () => { active = false; };
  }, [companionId, year, month]);

  const cells = useMemo(() => buildGrid(year, month), [year, month]);
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  const goMonth = (delta) => {
    setPickerDate(null);
    setMoods({});
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 1) { nextMonth = 12; nextYear -= 1; }
    if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
    setYear(nextYear);
    setMonth(nextMonth);
  };

  const handlePickMood = async (moodKey) => {
    if (!pickerDate || saving) return;
    setSaving(true);
    try {
      const saved = await setUserMood(companionId, pickerDate, moodKey);
      if (saved) setMoods((prev) => ({ ...prev, [pickerDate]: saved }));
    } finally {
      setSaving(false);
      setPickerDate(null);
    }
  };

  return (
    <div className="cp-overlay">
      <div className="cp-backdrop" onClick={onClose} />

      <div className="cp-panel bottom">
        <i className="cp-handle" />

        <h3 className="cp-panel-title">
          <span>心情日历</span>
        </h3>

        <div className="cp-panel-scroll md-scroll">
          <div className="md-month-nav">
            <button type="button" onClick={() => goMonth(-1)} aria-label="上个月">‹</button>
            <span>{year} 年 {month} 月</span>
            <button
              type="button"
              onClick={() => goMonth(1)}
              disabled={isCurrentMonth}
              aria-label="下个月"
            >
              ›
            </button>
          </div>

          <div className="md-weekdays">
            {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
          </div>

          <div className="md-grid">
            {cells.map((d, i) => {
              if (!d) return <div key={`empty-${i}`} className="md-cell md-cell-empty" />;

              const dateStr = toDateStr(year, month, d);
              const record = moods[dateStr];
              const isFuture = dateStr > todayStr;
              const isToday = dateStr === todayStr;

              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={isFuture}
                  onClick={() => setPickerDate(dateStr)}
                  className={`md-cell ${isToday ? 'is-today' : ''} ${isFuture ? 'is-future' : ''}`}
                >
                  <span className="md-date">{d}</span>
                  <span className="md-dots">
                    {record?.charMood
                      ? <CompanionMoodFace mood={record.charMood} size={14} />
                      : <span className="md-dot-empty" />}
                    {record?.userMood
                      ? <CompanionMoodFace mood={record.userMood} size={14} />
                      : <span className="md-dot-empty" />}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="md-hint">
            左边是 TA（角色）当天的心情（每天晚上自动判断），右边是你的——点格子可以记录/修改你那天的心情。
          </p>

          {pickerDate && (
            <div className="md-picker">
              <p className="md-picker-title">{pickerDate} 的心情</p>
              <div className="md-picker-row">
                {MOOD_DEFS.map((def) => (
                  <button
                    key={def.key}
                    type="button"
                    disabled={saving}
                    onClick={() => handlePickMood(def.key)}
                    className="md-picker-face"
                  >
                    <CompanionMoodFace mood={def.key} size={36} />
                    <span>{def.label}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="cp-close-link" onClick={() => setPickerDate(null)}>
                先不选
              </button>
            </div>
          )}
        </div>

        <button type="button" className="cp-close-link" onClick={onClose}>
          先收起来
        </button>
      </div>
    </div>
  );
};

export default CompanionMoodCalendar;