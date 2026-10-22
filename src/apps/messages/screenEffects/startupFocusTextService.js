// src/apps/messages/screenEffects/startupFocusTextService.js
//
// 全屏文字（专注文字）在App启动时触发的管道。本轮只打通"每天首次打开
// App时，全屏文字能不能被触发"这一条路，内容先用占位假数据测试——
// 真正的生日祝福 / Almanac画像进化触发逻辑是下一轮的事，到时候只需要
// 替换 getStartupFocusLines() 这一个函数，下面的节流/派发逻辑不用动。
//
// 由 App.jsx 在 Preloader 播完后调用一次 maybeTriggerStartupFocusText()。

import db from '../../../db';
import { dispatchScreenEffect } from './screenEffectDirective';
import { GLOBAL_SCREEN_EFFECT_SCOPE } from './screenEffectPresets';

const LAST_SHOWN_SETTINGS_KEY = 'lastStartupFocusTextDate';

// 本地日期字符串（YYYY-MM-DD），按用户本机时区算"今天"，不用UTC——
// 避免跨时区用户在深夜/凌晨打开App时，"今天"被算错成前一天或后一天。
const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/*
 * 占位测试内容。下一轮接生日祝福/Almanac画像进化时，把这个函数换成
 * 真正按场景生成（或返回 null 表示今天没有要播的内容）的逻辑即可，
 * maybeTriggerStartupFocusText 里的节流/派发逻辑完全不用动。
 */
const getStartupFocusLines = () => ([
  { text: '管道测试', emphasis: false },
  { text: '*全屏文字*', emphasis: true },
  { text: '启动触发已接通', emphasis: false },
]);

/*
 * 每天首次打开App时调用一次。已经放过今天的就直接跳过；没放过的话，
 * 派发一次全屏文字（走 GLOBAL_SCREEN_EFFECT_SCOPE，不绑定任何具体
 * 聊天窗），并记下今天的日期。
 */
export const maybeTriggerStartupFocusText = async () => {
  const todayKey = getLocalDateKey();

  try {
    const setting = await db.settings.get(LAST_SHOWN_SETTINGS_KEY);
    if (setting?.value === todayKey) return;

    const lines = getStartupFocusLines();
    if (!Array.isArray(lines) || lines.length === 0) return;

    dispatchScreenEffect(GLOBAL_SCREEN_EFFECT_SCOPE, { kind: 'focus', lines });

    await db.settings.put({ key: LAST_SHOWN_SETTINGS_KEY, value: todayKey });
  } catch (error) {
    console.warn('[StartupFocusText] 启动全屏文字触发失败，已跳过：', error);
  }
};