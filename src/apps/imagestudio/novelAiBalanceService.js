// src/apps/imagestudio/novelAiBalanceService.js
//
// NovelAI 剩余 Anlas 的查询和本地缓存。只在用户点"刷新余额"时才请求，
// 不会打开页面就自动查。缓存放 localStorage（跟通知开关同一种做法），
// 下次打开设置页能先看到上次查到的数字和时间。

import { requestNovelAiBalance } from './imageGenAdapters';
import { getImageGenConfig } from './imageGenConfigService';

const CACHE_KEY = 'imagestudio_anlas_cache';

export const getCachedAnlas = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (raw && Number.isFinite(raw.total) && raw.at) return raw;
  } catch {
    // 读不到就当没有缓存。
  }
  return null;
};

/**
 * 实时查一次并写入缓存。失败会抛 ImageGenError，由界面显示原因。
 * 返回 { fixed, purchased, total, at }。
 */
export const refreshAnlas = async () => {
  const config = await getImageGenConfig();
  const anlas = await requestNovelAiBalance({ config });
  const cached = { ...anlas, at: new Date().toISOString() };

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // 写不进去（隐私模式等）时本次仍然返回结果。
  }

  return cached;
};

export default { getCachedAnlas, refreshAnlas };