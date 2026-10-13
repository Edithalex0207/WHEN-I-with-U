// src/apps/messages/chatImageGen/chatImageGenService.js
//
// 聊天里AI自主触发生图的编排：读生图室配置 -> （NovelAI下强制夹到免费
// 额度）-> 调生图室已有的 runImageGeneration -> 把结果写回这条消息的
// metadata。生成本身完全复用 imageGenRunner.js，这里只管"从聊天这头
// 怎么调它、调完/失败了怎么写回消息"。
//
// 对应的占位消息（type: 'image_generated', metadata.status = 'pending'）
// 在 aiService.js 的 parseAiResponseToMessages 里，命中 [GENIMAGE: ...]
// 标签时就已经插入；这里只负责把它从 pending 推进到 done / error。

import db from '../../../db';
import { getImageGenConfig } from '../../imagestudio/imageGenConfigService';
import { getMissingConfigItems } from '../../imagestudio/imageGenRequest';
import { runImageGeneration } from '../../imagestudio/imageGenRunner';
import { ImageGenError } from '../../imagestudio/imageGenAdapters';
import { BACKEND_NOVELAI } from '../../imagestudio/imageGenRules';
import { GENERATION_SOURCE_CHAT } from '../../imagestudio/imageGenerationService';

const notifyChatRoom = (chatId) => {
  window.dispatchEvent(
    new CustomEvent('new-local-message-inserted', { detail: { chatId } }),
  );
};

/**
 * 聊天里AI自己触发的这一条路径，NovelAI 后端强制夹到免费额度，不管
 * 生图室全局设置是否允许花 Anlas——既然没有频率限制，就不该让一次
 * 对话悄悄把真金白银的额度刷掉。第三方接口没有"免费额度"这个概念，
 * 真实花费由用户自己在生图室设置里评估，这里不做限制。
 */
const forceFreeNovelAi = (config) => {
  if (config.backend !== BACKEND_NOVELAI) return config;
  return { ...config, novelai: { ...config.novelai, allowAnlas: false } };
};

const patchMessageMetadata = async (messageId, patch) => {
  const message = await db.messages.get(messageId);
  if (!message) return;

  await db.messages.update(messageId, {
    metadata: { ...(message.metadata || {}), ...patch },
  });
};

/**
 * 跑一次聊天里的真实生图并把结果写回这条消息。
 * messageId 对应的消息必须已经存在（pending 占位消息）。
 */
export const runChatImageGeneration = async ({
  chatId,
  characterId,
  messageId,
  sceneText,
}) => {
  if (!chatId || !messageId) return;

  try {
    const rawConfig = await getImageGenConfig();
    const missing = getMissingConfigItems(rawConfig);

    if (missing.length > 0) {
      await patchMessageMetadata(messageId, {
        status: 'error',
        errorMessage: `还缺少：${missing.join('、')}。请先到「设置 → 生图室」填写。`,
      });
      notifyChatRoom(chatId);
      return;
    }

    const config = forceFreeNovelAi(rawConfig);

    const { record, blob, adjustments, saveError } = await runImageGeneration({
      config,
      sceneText,
      chatId,
      characterId,
      includeCharacterAppearance: true,
      includeUserAppearance: true,
      source: GENERATION_SOURCE_CHAT,
    });

    if (record) {
      await patchMessageMetadata(messageId, {
        status: 'done',
        generationId: record.id,
        thumbnail: record.thumbnail,
        width: record.width,
        height: record.height,
        prompt: record.prompt,
        negativePrompt: record.negativePrompt,
        backend: record.backend,
        adjustments: adjustments || [],
      });
    } else {
      // 图已经生成出来了，只是没能存进画廊（比如存储空间满了）——这次会话
      // 里先直接把 Blob 挂在消息上，让用户至少能看到/能保存，跟
      // photoMessageService.js 遇到同类情况时的做法一样；刷新页面后这张
      // 图就看不到了，原图没有落库。
      await patchMessageMetadata(messageId, {
        status: 'done',
        blob,
        unsaved: true,
        errorMessage: saveError || '',
      });
    }

    notifyChatRoom(chatId);
  } catch (error) {
    console.warn('[ChatImageGen] 聊天内生图失败：', error);

    const message = error instanceof ImageGenError
      ? error.message
      : (error?.message || '生成失败，请重试。');

    await patchMessageMetadata(messageId, { status: 'error', errorMessage: message });
    notifyChatRoom(chatId);
  }
};

/**
 * 失败卡片上的"重试"按钮：把状态退回 pending（界面立刻显示转圈），
 * 再跑一次同样的生成。
 */
export const retryChatImageGeneration = async ({
  chatId,
  characterId,
  messageId,
  sceneText,
}) => {
  await patchMessageMetadata(messageId, { status: 'pending', errorMessage: '' });
  notifyChatRoom(chatId);
  await runChatImageGeneration({ chatId, characterId, messageId, sceneText });
};

export default { runChatImageGeneration, retryChatImageGeneration };