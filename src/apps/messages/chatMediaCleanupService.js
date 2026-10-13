// src/apps/messages/chatMediaCleanupService.js
//
// 活跃聊天（db.messages，不是存档室）里的媒体清理，2026-10 新增。
//
// 跟 src/apps/archive/archiveMediaCleanupService.js 是同一个思路
// （只清"本体"——语音的 audioBlob / 照片的 blob，文字记录原样保留），
// 但那个文件只管存档室（archivedMessages），这个文件管的是还在聊天里的
// 活跃消息，所以单独开一个文件，不去改 archiveMediaCleanupService.js。
//
// 三个场景：
// 1. 单张照片：用户在消息操作栏点"清除原图"，只清这一条 photo 消息。
// 2. 一整窗的真实语音：ChatSettingsModal 危险区里"清理本窗语音缓存"，
//    一次性清空这个聊天里所有 realVoice 消息的音频本体。
// 3. 一整窗的真实图片：ChatSettingsModal 危险区里"清理本窗图片缓存"，
//    一次性清空这个聊天里所有 photo 消息的图片本体——跟场景1是同一个
//    清理动作（清 metadata.blob，保留文字+视觉识别描述），只是场景1
//    一次清一条，这里一次清一整个聊天，2026-10 新增。

import db from '../../db';

/**
 * 清除单条照片消息的图片本体，保留文字内容（"发送了一张照片"）和
 * 视觉识别出来的描述（metadata.visionDescription），这样角色还是知道
 * 当时发生过什么，只是图片本身不再占内存/占用 IndexedDB 空间。
 * 不可撤销，调用方自己决定要不要弹确认。
 */
export const clearPhotoMessageMedia = async (messageId) => {
  if (!messageId) return false;

  const message = await db.messages.get(messageId);
  if (!message || message.type !== 'photo') return false;

  const { blob, ...restMetadata } = message.metadata || {};
  if (!(blob instanceof Blob)) return false;

  await db.messages.update(messageId, {
    metadata: {
      ...restMetadata,
      mediaCleared: true,
      mediaClearedAt: new Date().toISOString(),
    },
  });

  return true;
};

const stripAudioFromMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return metadata;
  const { audioBlob, ...rest } = metadata;
  return rest;
};

const stripAudioFromVersions = (versions) => {
  if (!Array.isArray(versions)) return versions;

  return versions.map((version) => ({
    ...version,
    metadata: stripAudioFromMetadata(version?.metadata),
  }));
};

const messageHasAudio = (message) => {
  if (message?.metadata?.audioBlob instanceof Blob) return true;

  if (Array.isArray(message?.versions)) {
    return message.versions.some((version) => (
      version?.metadata?.audioBlob instanceof Blob
    ));
  }

  return false;
};

// 照片的本体字段叫 metadata.blob（不是 audioBlob），跟上面语音那套
// 分开写一份同样形状的 strip/has 辅助函数，不复用语音那两个——字段名
// 不一样，硬共用容易以后改错。photo 消息目前不会产生 versions（它只
// 由用户发送，没有"重roll"这种会产生版本的操作），但防御性地也把
// versions 里的 blob 一并清掉，跟语音那边的写法保持一致。
const stripImageFromMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return metadata;
  const { blob, ...rest } = metadata;
  return rest;
};

const stripImageFromVersions = (versions) => {
  if (!Array.isArray(versions)) return versions;

  return versions.map((version) => ({
    ...version,
    metadata: stripImageFromMetadata(version?.metadata),
  }));
};

const messageHasImage = (message) => {
  if (message?.metadata?.blob instanceof Blob) return true;

  if (Array.isArray(message?.versions)) {
    return message.versions.some((version) => (
      version?.metadata?.blob instanceof Blob
    ));
  }

  return false;
};

/**
 * 清空某个聊天里所有 MiniMax 生成的真实语音（type: 'realVoice'）的音频
 * 本体，保留每条消息的文字转写（content/metadata.transcript），所以
 * 之后翻聊天记录还能看到"当时说了什么"，只是听不到原声了。
 * 只影响活跃消息表（db.messages），不动存档室。不可撤销。
 */
export const clearChatRealVoiceMedia = async (chatId) => {
  if (!chatId) return { clearedCount: 0, scannedCount: 0 };

  const voiceMessages = await db.messages
    .where('chatId')
    .equals(chatId)
    .filter((message) => message.type === 'realVoice')
    .toArray();

  const targets = voiceMessages.filter(messageHasAudio);

  if (targets.length === 0) {
    return { clearedCount: 0, scannedCount: voiceMessages.length };
  }

  await db.transaction('rw', db.messages, async () => {
    for (const message of targets) {
      // eslint-disable-next-line no-await-in-loop
      await db.messages.update(message.id, {
        metadata: {
          ...stripAudioFromMetadata(message.metadata),
          mediaCleared: true,
          mediaClearedAt: new Date().toISOString(),
        },
        versions: stripAudioFromVersions(message.versions),
      });
    }
  });

  return { clearedCount: targets.length, scannedCount: voiceMessages.length };
};

/**
 * 清空某个聊天里所有真实图片（type: 'photo'）消息的图片本体，保留每条
 * 消息的文字内容（"发送了一张照片"）和视觉识别出来的描述
 * （metadata.visionDescription），所以之后翻聊天记录还能看到"当时发过
 * 什么、画面是什么内容"，只是原图不在了。
 * 只影响活跃消息表（db.messages），不动存档室。不可撤销。
 */
export const clearChatRealPhotoMedia = async (chatId) => {
  if (!chatId) return { clearedCount: 0, scannedCount: 0, clearedMessageIds: [] };

  const photoMessages = await db.messages
    .where('chatId')
    .equals(chatId)
    .filter((message) => message.type === 'photo')
    .toArray();

  const targets = photoMessages.filter(messageHasImage);

  if (targets.length === 0) {
    return { clearedCount: 0, scannedCount: photoMessages.length, clearedMessageIds: [] };
  }

  await db.transaction('rw', db.messages, async () => {
    for (const message of targets) {
      // eslint-disable-next-line no-await-in-loop
      await db.messages.update(message.id, {
        metadata: {
          ...stripImageFromMetadata(message.metadata),
          mediaCleared: true,
          mediaClearedAt: new Date().toISOString(),
        },
        versions: stripImageFromVersions(message.versions),
      });
    }
  });

  return {
    clearedCount: targets.length,
    scannedCount: photoMessages.length,
    // 调用方（ChatSettingsModal）拿这份 id 列表去释放 PhotoCard 模块级
    // 缓存的 object URL——跟 ChatRoom.jsx 单张清除时调用
    // releasePhotoObjectUrl(messageId) 是同一个道理，不然清完本体后
    // 旧的 blob object URL 还占着内存不放。
    clearedMessageIds: targets.map((message) => message.id),
  };
};

export default {
  clearPhotoMessageMedia,
  clearChatRealVoiceMedia,
  clearChatRealPhotoMedia,
};