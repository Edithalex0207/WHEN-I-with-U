// src/apps/imagestudio/appearanceService.js
//
// 外貌锁定的读写。三个存放位置（都是已有表上的新增非索引字段，不需要升数据库版本）：
//   - 角色外貌：characters 记录上的 imageAppearance，所有聊天共用。
//   - 用户外貌（单个聊天）：chats 记录上的 userImageAppearance，跟已有的 userPersona 同级。
//   - 用户外貌（全局默认）：生图配置里的 defaultUserAppearance，聊天里没填时回退到它。
//
// 角色和聊天的字段这里直接用 db.characters.update / db.chats.update 写，
// 不经过 CharacterEditor.jsx / ChatSettingsModal.jsx 这两个大文件。
//
// 外貌文本是用户自己写的，写成什么风格由用户决定：用 NovelAI 的话建议写成英文
// 标签（如 "1girl, long black hair, blue eyes"），用第三方接口的话可以写自然语言。

import db from '../../db';
import { getImageGenConfig, patchImageGenConfig } from './imageGenConfigService';

const cleanText = (value) => String(value || '').trim();

export const getCharacterAppearance = async (characterId) => {
  if (!characterId) return '';

  try {
    const character = await db.characters.get(characterId);
    return cleanText(character?.imageAppearance);
  } catch (error) {
    console.warn('[ImageStudio] 读取角色外貌失败：', error);
    return '';
  }
};

export const setCharacterAppearance = async (characterId, text) => {
  if (!characterId) return;
  await db.characters.update(characterId, { imageAppearance: cleanText(text) });
};

export const getChatUserAppearance = async (chatId) => {
  if (!chatId) return '';

  try {
    const chat = await db.chats.get(chatId);
    return cleanText(chat?.userImageAppearance);
  } catch (error) {
    console.warn('[ImageStudio] 读取聊天里的用户外貌失败：', error);
    return '';
  }
};

export const setChatUserAppearance = async (chatId, text) => {
  if (!chatId) return;
  await db.chats.update(chatId, { userImageAppearance: cleanText(text) });
};

export const getDefaultUserAppearance = async () => {
  const config = await getImageGenConfig();
  return cleanText(config.defaultUserAppearance);
};

export const setDefaultUserAppearance = async (text) => {
  await patchImageGenConfig({ defaultUserAppearance: cleanText(text) });
};

/**
 * 某个聊天里实际生效的用户外貌：聊天自己的优先，没填就用全局默认。
 * 切片B拼提示词时直接用这个。
 */
export const resolveUserAppearance = async (chatId) => {
  const own = await getChatUserAppearance(chatId);
  if (own) return own;
  return getDefaultUserAppearance();
};

export default {
  getCharacterAppearance,
  setCharacterAppearance,
  getChatUserAppearance,
  setChatUserAppearance,
  getDefaultUserAppearance,
  setDefaultUserAppearance,
  resolveUserAppearance,
};