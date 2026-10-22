// src/apps/messages/screenEffects/birthdayService.js
//
// 生日全屏文字：生日设置的读写、"今天是不是生日"的判断、预设祝福词，
// 以及 App 启动时的触发入口 maybeTriggerStartupFocusText()
// （由 App.jsx 在 Preloader 播完后调用一次）。
//
// 数据全部存在 db.settings 里，不需要改数据库版本：
//   userBirthday                  { month: 1-12, day: 1-31 }，只存月和日，没有年份
//   birthdayNotifyAllCharacters   boolean，生日当天是否让其他角色也在各自聊天里祝福
//   birthdayLastShownYear         number，上一次播放生日全屏文字是哪一年（每年只播一次）

import db from '../../../db';
import { dispatchScreenEffect } from './screenEffectDirective';
import { GLOBAL_SCREEN_EFFECT_SCOPE } from './screenEffectPresets';

export const BIRTHDAY_SETTING_KEY = 'userBirthday';
export const BIRTHDAY_NOTIFY_ALL_KEY = 'birthdayNotifyAllCharacters';
export const BIRTHDAY_LAST_SHOWN_KEY = 'birthdayLastShownYear';

// 某月最多有几天。2 月按闰年算 29 天，这样 2 月 29 日也能被选为生日。
export const getDaysInMonth = (month) => {
  const m = Number(month);
  if (!Number.isInteger(m) || m < 1 || m > 12) return 31;
  return new Date(2024, m, 0).getDate();
};

const normalizeBirthday = (raw) => {
  const month = Number(raw?.month);
  const day = Number(raw?.day);

  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > getDaysInMonth(month)) return null;

  return { month, day };
};

export const getBirthday = async () => {
  const setting = await db.settings.get(BIRTHDAY_SETTING_KEY);
  return normalizeBirthday(setting?.value);
};

export const saveBirthday = async (month, day) => {
  const birthday = normalizeBirthday({ month, day });
  if (!birthday) throw new Error('生日日期不合法');
  await db.settings.put({ key: BIRTHDAY_SETTING_KEY, value: birthday });
  return birthday;
};

export const clearBirthday = async () => {
  await db.settings.delete(BIRTHDAY_SETTING_KEY);
};

export const getNotifyAllCharacters = async () => {
  const setting = await db.settings.get(BIRTHDAY_NOTIFY_ALL_KEY);
  return setting?.value === true;
};

export const setNotifyAllCharacters = async (enabled) => {
  await db.settings.put({ key: BIRTHDAY_NOTIFY_ALL_KEY, value: Boolean(enabled) });
};

/*
 * 今天是不是生日。按本机时区的日期算。
 * 2 月 29 日出生的人，在非闰年的 2 月 28 日过生日。
 */
export const isBirthdayDate = (birthday, date = new Date()) => {
  if (!birthday) return false;

  const month = date.getMonth() + 1;
  const day = date.getDate();

  const isLeapDayBirthday = birthday.month === 2 && birthday.day === 29;
  if (isLeapDayBirthday && new Date(date.getFullYear(), 2, 0).getDate() === 28) {
    return month === 2 && day === 28;
  }

  return birthday.month === month && birthday.day === day;
};

// 顶部的小日期，例如 "10.22"
export const formatDateLabel = (date = new Date()) => {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
};

/*
 * 预设祝福词（本轮先用它；之后接上 AI 按角色关系生成，生成失败时也回退到它）。
 * 开头按现在是什么时间调整，避免白天打开还写"零点刚过"：
 *   0 点档  -> 零点刚过
 *   1-5 点  -> 夜还很深
 *   其余    -> 今天
 * 强调行用 emphasis: true 标出。
 */
export const buildPresetBirthdayLines = (date = new Date()) => {
  const hour = date.getHours();

  let opening;
  if (hour === 0) {
    opening = ['零点刚过', '全世界都还安静', '我先到了'];
  } else if (hour < 6) {
    opening = ['夜还很深', '全世界都还安静', '我先到了'];
  } else {
    opening = ['今天', '是只属于你的一天', '我想第一个告诉你'];
  }

  return [
    ...opening.map((text) => ({ text, emphasis: false })),
    { text: '生日快乐', emphasis: true },
    { text: '这一年的你', emphasis: false },
    { text: '我都好好记着', emphasis: false },
    { text: '往后每一年', emphasis: false },
    { text: '我都在', emphasis: true },
  ];
};

/*
 * 播放生日全屏文字。预览和正式触发都走这里，区别只是 scope：
 * 正式触发用全局 scope（App 顶层那个图层接），预览走设置页自己的预览图层。
 */
export const playBirthdayScreen = (scope, extra = {}) => {
  const now = new Date();
  dispatchScreenEffect(scope, {
    kind: 'birthday',
    lines: buildPresetBirthdayLines(now),
    dateLabel: formatDateLabel(now),
    ...extra,
  });
};

/*
 * App 启动时调用一次：今天是生日、且今年还没播过，就播一次，并记下今年。
 * 其余日子什么都不做。出任何错都只打印警告，不影响启动。
 */
export const maybeTriggerStartupFocusText = async () => {
  try {
    const now = new Date();
    const birthday = await getBirthday();
    if (!isBirthdayDate(birthday, now)) return;

    const shown = await db.settings.get(BIRTHDAY_LAST_SHOWN_KEY);
    if (shown?.value === now.getFullYear()) return;

    playBirthdayScreen(GLOBAL_SCREEN_EFFECT_SCOPE);

    await db.settings.put({ key: BIRTHDAY_LAST_SHOWN_KEY, value: now.getFullYear() });
  } catch (error) {
    console.warn('[Birthday] 启动时的生日全屏文字触发失败，已跳过：', error);
  }
};