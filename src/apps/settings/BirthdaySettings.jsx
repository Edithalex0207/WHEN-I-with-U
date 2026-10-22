// src/apps/settings/BirthdaySettings.jsx
//
// 设置页里的"我的生日"卡片：选月和日（不需要年份），选好就自动保存；
// 可以打开"生日当天通知所有角色"开关，也可以随时点"预览"看生日全屏文字。
// 自带 GlassCard 外框和保存逻辑，不依赖本页底部的保存按钮。

import React, { useEffect, useState } from 'react';
import { Play, Sparkles } from 'lucide-react';

import GlassCard from '../../components/GlassCard';
import FullscreenEffectLayer from '../messages/screenEffects/FullscreenEffectLayer';
import { SCREEN_EFFECT_EVENT } from '../messages/screenEffects/screenEffectPresets';
import {
  clearBirthday,
  getBirthday,
  getDaysInMonth,
  getNotifyAllCharacters,
  buildPresetBirthdayLines,
  formatDateLabel,
  saveBirthday,
  setNotifyAllCharacters,
} from '../messages/screenEffects/birthdayService';

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

const selectClassName = 'rounded-xl bg-black/5 px-3 py-2 text-sm outline-none dark:bg-white/10';

export const BirthdaySettings = () => {
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [notifyAll, setNotifyAll] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;

    Promise.all([getBirthday(), getNotifyAllCharacters()])
      .then(([birthday, notify]) => {
        if (cancelled) return;
        if (birthday) {
          setMonth(String(birthday.month));
          setDay(String(birthday.day));
        }
        setNotifyAll(notify);
      })
      .catch((error) => {
        console.error('[Birthday] 读取生日设置失败:', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const persist = async (nextMonth, nextDay) => {
    if (!nextMonth || !nextDay) return;

    try {
      await saveBirthday(Number(nextMonth), Number(nextDay));
      setStatus('已保存');
    } catch (error) {
      console.error('[Birthday] 保存生日失败:', error);
      setStatus('保存失败，请再试一次');
    }
  };

  const handleMonthChange = (event) => {
    const nextMonth = event.target.value;
    setMonth(nextMonth);

    // 换月份后，原来选的"日"可能超出这个月的天数（比如 31 号换成 2 月）
    let nextDay = day;
    if (nextMonth && day && Number(day) > getDaysInMonth(nextMonth)) {
      nextDay = String(getDaysInMonth(nextMonth));
      setDay(nextDay);
    }

    void persist(nextMonth, nextDay);
  };

  const handleDayChange = (event) => {
    const nextDay = event.target.value;
    setDay(nextDay);
    void persist(month, nextDay);
  };

  const handleClear = async () => {
    try {
      await clearBirthday();
      setMonth('');
      setDay('');
      setStatus('已清除');
    } catch (error) {
      console.error('[Birthday] 清除生日失败:', error);
      setStatus('清除失败，请再试一次');
    }
  };

  const handleToggleNotify = async () => {
    const next = !notifyAll;
    setNotifyAll(next);

    try {
      await setNotifyAllCharacters(next);
    } catch (error) {
      console.error('[Birthday] 保存通知开关失败:', error);
      setNotifyAll(!next);
    }
  };

  const handlePreview = () => {
    const now = new Date();

    window.dispatchEvent(new CustomEvent(SCREEN_EFFECT_EVENT, {
      detail: {
        kind: 'birthday',
        lines: buildPresetBirthdayLines(now),
        dateLabel: formatDateLabel(now),
        preview: true,
      },
    }));
  };

  const dayCount = month ? getDaysInMonth(month) : 31;
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);

  return (
    <GlassCard className="space-y-4 text-left">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Sparkles className="h-4 w-4" />
        <span>我的生日</span>
      </div>

      <p className="text-[11px] leading-relaxed opacity-60">
        设置后，每年生日当天第一次打开 App 时，会播放一段全屏的生日祝福。只需要月份和日期，不用填年份。
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="birthday-month">生日月份</label>
        <select
          id="birthday-month"
          value={month}
          onChange={handleMonthChange}
          className={selectClassName}
        >
          <option value="">月</option>
          {MONTHS.map((value) => (
            <option key={value} value={value}>{value} 月</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="birthday-day">生日日期</label>
        <select
          id="birthday-day"
          value={day}
          onChange={handleDayChange}
          className={selectClassName}
        >
          <option value="">日</option>
          {days.map((value) => (
            <option key={value} value={value}>{value} 日</option>
          ))}
        </select>

        {(month || day) && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg bg-black/5 px-3 py-2 text-[11px] font-semibold transition-transform active:scale-95 dark:bg-white/10"
          >
            清除
          </button>
        )}

        {status && (
          <span className="text-[11px] opacity-60" role="status">{status}</span>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={notifyAll}
        onClick={handleToggleNotify}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold">生日当天通知所有角色</span>
          <span className="mt-0.5 block text-[10px] leading-snug opacity-55">
            开启后，其他角色也会在各自的聊天里祝福你。
          </span>
        </span>

        <span
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
            notifyAll ? 'bg-emerald-500' : 'bg-black/20 dark:bg-white/25'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
              notifyAll ? 'left-[18px]' : 'left-0.5'
            }`}
          />
        </span>
      </button>

      <button
        type="button"
        onClick={handlePreview}
        className="flex items-center gap-1 rounded-lg bg-black/5 px-3 py-2 text-[11px] font-semibold transition-transform active:scale-95 dark:bg-white/10"
      >
        <Play className="h-3 w-3" />
        预览生日全屏文字
      </button>

      <FullscreenEffectLayer preview />
    </GlassCard>
  );
};

export default BirthdaySettings;