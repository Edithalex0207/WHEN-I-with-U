// src/apps/imagestudio/imageGenConfigService.js
//
// 生图室的配置读写。整份配置存在 db.settings 的一行里（key = imageGenConfig），
// 跟 apiConfig / visionApiConfig 是同一种存法，不新建表、不升数据库版本。
// 结构和默认值见 imageGenRules.js 的 DEFAULT_IMAGE_GEN_CONFIG。

import db from '../../db';
import {
  IMAGE_GEN_SETTINGS_KEY,
  normalizeImageGenConfig,
} from './imageGenRules';

// 配置一旦保存就广播一次，常驻挂载的生成页据此重读配置，
// 这样在设置里切换后端（第三方 / NovelAI）不需要退出生图室再进来。
export const IMAGE_GEN_CONFIG_CHANGED_EVENT = 'imagestudio:config-changed';

const announceImageGenConfigChanged = (config) => {
  try {
    window.dispatchEvent(new CustomEvent(IMAGE_GEN_CONFIG_CHANGED_EVENT, { detail: config }));
  } catch (error) {
    console.warn('[ImageStudio] 广播配置变更失败：', error);
  }
};

/**
 * 读取完整配置。读取失败或还没存过时返回默认值，不会抛错。
 */
export const getImageGenConfig = async () => {
  try {
    const row = await db.settings.get(IMAGE_GEN_SETTINGS_KEY);
    return normalizeImageGenConfig(row?.value);
  } catch (error) {
    console.warn('[ImageStudio] 读取生图配置失败，改用默认值：', error);
    return normalizeImageGenConfig(null);
  }
};

/**
 * 整份覆盖保存，返回规整后的结果。
 * 设置面板自己持有完整配置，用这个。
 */
export const saveImageGenConfig = async (config) => {
  const normalized = normalizeImageGenConfig(config);
  await db.settings.put({ key: IMAGE_GEN_SETTINGS_KEY, value: normalized });
  announceImageGenConfigChanged(normalized);
  return normalized;
};

/**
 * 只改顶层的几个字段：先读最新的，再合并，再保存。
 * 外貌面板只想改 defaultUserAppearance，不应该用旧快照整份覆盖别的字段，用这个。
 */
export const patchImageGenConfig = async (patch) => {
  const current = await getImageGenConfig();
  return saveImageGenConfig({ ...current, ...(patch || {}) });
};

/**
 * 只改 NovelAI 子配置里的几个字段：先读最新的，再合并，再保存。
 * 生成页的"固定前缀 / 负面提示词"折叠区用这个，不会用旧快照覆盖设置页刚存的别的字段。
 */
export const patchNovelAiConfig = async (patch) => {
  const current = await getImageGenConfig();
  return saveImageGenConfig({ ...current, novelai: { ...current.novelai, ...(patch || {}) } });
};

/**
 * 只改第三方子配置里的几个字段（比如图片尺寸），同上。
 */
export const patchThirdPartyConfig = async (patch) => {
  const current = await getImageGenConfig();
  return saveImageGenConfig({ ...current, thirdParty: { ...current.thirdParty, ...(patch || {}) } });
};

export default {
  getImageGenConfig,
  saveImageGenConfig,
  patchImageGenConfig,
  patchNovelAiConfig,
  patchThirdPartyConfig,
};