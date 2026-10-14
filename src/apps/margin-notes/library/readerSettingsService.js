// src/apps/margin-notes/library/readerSettingsService.js
//
// 阅读设置（主题、字体、字号等）的读写。所有书共用一份，
// 存在 db.settings 的 'reader_settings' 这一行里（不需要新表）。

import db from '../../../db';
import {
  DEFAULT_READER_SETTINGS,
  normalizeReaderSettings,
} from './readerTheme.js';

const SETTINGS_KEY = 'reader_settings';

/**
 * 读设置。没存过、读失败都返回默认设置。
 */
export const loadReaderSettings = async () => {
  try {
    const row = await db.settings.get(SETTINGS_KEY);
    return normalizeReaderSettings(row?.value);
  } catch (error) {
    console.warn('[阅读器] 读取阅读设置失败，使用默认设置：', error);
    return { ...DEFAULT_READER_SETTINGS };
  }
};

/**
 * 保存设置。失败只记一条警告，不打断阅读。
 */
export const saveReaderSettings = async (settings) => {
  try {
    await db.settings.put({
      key: SETTINGS_KEY,
      value: normalizeReaderSettings(settings),
    });
  } catch (error) {
    console.warn('[阅读器] 保存阅读设置失败：', error);
  }
};