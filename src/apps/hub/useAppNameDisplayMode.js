// src/apps/hub/useAppNameDisplayMode.js
//
// 读取「应用名称显示模式」设置：只显示英文名、英文+中文结合展示，
// 还是英文+韩文结合展示。通过 Dexie liveQuery 订阅 db.settings 里的
// appNameDisplayMode 字段，这样在设置页保存之后，首页应用区会自动
// 刷新，不需要额外的状态转发。

import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import db from '../../db';

export const APP_NAME_DISPLAY_SETTING_KEY = 'appNameDisplayMode';
export const APP_NAME_DISPLAY_EN = 'en';
export const APP_NAME_DISPLAY_BILINGUAL = 'bilingual';
export const APP_NAME_DISPLAY_KOREAN = 'korean';

// 所有合法的取值，useEffect 里做校验时统一引用这份列表，
// 新增一种显示模式只需要在这里加一行。
const VALID_MODES = [
  APP_NAME_DISPLAY_EN,
  APP_NAME_DISPLAY_BILINGUAL,
  APP_NAME_DISPLAY_KOREAN,
];

export const useAppNameDisplayMode = () => {
  const [mode, setMode] = useState(APP_NAME_DISPLAY_EN);

  useEffect(() => {
    const subscription = liveQuery(() =>
      db.settings.get(APP_NAME_DISPLAY_SETTING_KEY)
    ).subscribe({
      next: (setting) => {
        setMode(
          VALID_MODES.includes(setting?.value)
            ? setting.value
            : APP_NAME_DISPLAY_EN
        );
      },
      error: (error) => {
        console.warn(
          '[AppGrid] 读取应用名称显示模式失败：',
          error
        );
      },
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return mode;
};

export default useAppNameDisplayMode;