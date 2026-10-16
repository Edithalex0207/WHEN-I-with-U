// src/apps/hub/AppTitle.jsx
//
// 统一的应用名称展示组件：根据「应用名称显示模式」设置，决定标题只显示
// 英文，还是把中文名称一起拼接展示（"Snapshots 快照" 这种组合形式），
// 或者把韩文名称一起拼接展示（"Snapshots 스냅샷" 这种组合形式）。

import React from 'react';
import {
  APP_NAME_DISPLAY_BILINGUAL,
  APP_NAME_DISPLAY_KOREAN,
} from './useAppNameDisplayMode';

export const AppTitle = ({ en, zh, ko, mode, className = 'text-sm font-bold' }) => {
  // 中文 / 韩文走同一条拼接规则，只是取的字段和触发的模式不同，
  // 这里统一算出"这次要不要拼、拼什么"，避免下面 JSX 里堆两套重复判断。
  const secondary =
    mode === APP_NAME_DISPLAY_BILINGUAL
      ? zh
      : mode === APP_NAME_DISPLAY_KOREAN
        ? ko
        : null;

  return (
    <h4 className={className}>
      {en}
      {secondary && (
        <span className="ml-1.5 font-normal opacity-50">{secondary}</span>
      )}
    </h4>
  );
};

export default AppTitle;