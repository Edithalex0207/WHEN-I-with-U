// src/apps/imagestudio/promptComposerPresetService.js
//
// AI 拼词页「给AI预设」库的增删改查。每条是一段写给AI的指导词
// （人设/风格要求），比如"你是一位顶级插画师，擅长写 MJ 风格的提示词，
// 偏好干净简洁的构图描述"。用户可以存多条，拼词时选一条用，或者不选，
// 走内置的通用指导词（见 promptComposerAiService.js 的 DEFAULT_PERSONA）。
//
// 表定义见 src/db/index.js 的 db.version(84)：
//   imagePromptPresets: '++id, name, createdAt, updatedAt'
// 记录字段：{ id, name, instruction, createdAt, updatedAt }
//
// 思路跟 artistTagService.js 一样是一张全局共享的小库，但这里不需要
// "enabled" 字段——同一次拼词只会用一条预设，选哪条由拼词页的下拉决定
// （选中的 id 存在 imageGenConfig.promptComposerPresetId，方便下次接着用）。

import db from '../../db';

/**
 * 全部AI预设，按创建时间从早到晚。
 */
export const getAllPromptComposerPresets = async () => {
  try {
    return await db.imagePromptPresets.orderBy('createdAt').toArray();
  } catch (error) {
    console.warn('[ImageStudio] 读取AI预设失败：', error);
    return [];
  }
};

export const getPromptComposerPreset = async (id) => {
  if (!id) return null;

  try {
    return (await db.imagePromptPresets.get(id)) || null;
  } catch (error) {
    console.warn('[ImageStudio] 读取单条AI预设失败：', error);
    return null;
  }
};

export const createPromptComposerPreset = async ({ name, instruction }) => {
  const cleanName = String(name || '').trim();
  const cleanInstruction = String(instruction || '').trim();

  if (!cleanName || !cleanInstruction) return null;

  const nowIso = new Date().toISOString();

  return db.imagePromptPresets.add({
    name: cleanName,
    instruction: cleanInstruction,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
};

/**
 * 只允许改 name / instruction 两个字段，别的字段传进来也忽略。
 */
export const updatePromptComposerPreset = async (id, patch) => {
  if (!id) return;

  const next = { updatedAt: new Date().toISOString() };

  if (typeof patch?.name === 'string') next.name = patch.name.trim();
  if (typeof patch?.instruction === 'string') next.instruction = patch.instruction.trim();

  await db.imagePromptPresets.update(id, next);
};

export const deletePromptComposerPreset = async (id) => {
  if (!id) return;
  await db.imagePromptPresets.delete(id);
};

export default {
  getAllPromptComposerPresets,
  getPromptComposerPreset,
  createPromptComposerPreset,
  updatePromptComposerPreset,
  deletePromptComposerPreset,
};