/*
 * companionProfileService.js —— 小伙伴的「物种」和「性格」。
 *
 * 两个都是自由文本，直接存在 companions 表这条记录的两个新字段上
 * （companion.species / companion.personality），都不是索引字段，
 * 所以不用升 db 版本，没设置过的小伙伴这两个字段就是 undefined，
 * 当成空字符串处理。
 *
 * 【现在只管"存"】
 * 这两个字段是给以后「跟小伙伴直接聊天接 AI」做准备的，目前没有任何
 * 地方读它们：收藏卡、日记、每日问答等已有内容的文字都不受影响。
 * buildCompanionProfilePromptLine 是留给以后拼提示词用的小函数，现在
 * 没有被任何文件调用。
 *
 * 【profileTipSeen】
 * 设置弹窗第一次打开时会弹一个提示（说明这两项只影响之后的对话），
 * 看过之后记在 companion.profileTipSeen，之后不再自动弹，弹窗里
 * 的那行说明文字一直都在。
 */

import db from '../../../db';

export const PROFILE_LIMITS = {
  species: 20,
  personality: 120,
};

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

/** 读出当前的物种/性格（没设置过返回空字符串） */
export const getCompanionProfile = (companion) => ({
  species: companion?.species || '',
  personality: companion?.personality || '',
});

/**
 * 保存物种和性格。两项都允许留空（留空 = 清除设置）。
 * @returns {Promise<object>} 更新后的 companion 记录
 */
export const updateCompanionProfile = async (companionId, { species, personality } = {}) => {
  const companion = await db.companions.get(companionId);
  if (!companion) throw new Error('小伙伴不存在');

  await db.companions.update(companionId, {
    species: clean(species, PROFILE_LIMITS.species),
    personality: clean(personality, PROFILE_LIMITS.personality),
    updatedAt: Date.now(),
  });
  return db.companions.get(companionId);
};

/** 记下"已经看过设置提示"，之后打开设置弹窗不再自动弹提示 */
export const markCompanionProfileTipSeen = async (companionId) => {
  await db.companions.update(companionId, { profileTipSeen: true });
  return db.companions.get(companionId);
};

/**
 * 留给以后拼 AI 提示词用：把物种/性格整理成一行话，两项都没设置返回空
 * 字符串。目前没有被任何文件调用。
 */
export const buildCompanionProfilePromptLine = (companion) => {
  const { species, personality } = getCompanionProfile(companion);
  const parts = [];
  if (species) parts.push(`物种：${species}`);
  if (personality) parts.push(`性格：${personality}`);
  return parts.join('；');
};