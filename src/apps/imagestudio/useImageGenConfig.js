// src/apps/imagestudio/useImageGenConfig.js
//
// 订阅生图配置的 hook：第一次读一次，之后设置页（或任何地方）保存配置时
// 会收到广播并立刻更新。常驻挂载的生成页靠它感知"后端切换了"，
// 所以在设置里把 NovelAI 切到第三方（或反过来）不需要退出生图室再进来。
// 加载完成之前返回 null。

import { useEffect, useState } from 'react';

import { IMAGE_GEN_CONFIG_CHANGED_EVENT, getImageGenConfig } from './imageGenConfigService';

export const useImageGenConfig = () => {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let cancelled = false;

    getImageGenConfig().then((loaded) => {
      if (!cancelled) setConfig((current) => current || loaded);
    });

    const onChanged = (event) => {
      if (event?.detail) setConfig(event.detail);
    };

    window.addEventListener(IMAGE_GEN_CONFIG_CHANGED_EVENT, onChanged);

    return () => {
      cancelled = true;
      window.removeEventListener(IMAGE_GEN_CONFIG_CHANGED_EVENT, onChanged);
    };
  }, []);

  return config;
};

export default useImageGenConfig;