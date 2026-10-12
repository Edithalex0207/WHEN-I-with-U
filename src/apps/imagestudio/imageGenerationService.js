// src/apps/imagestudio/imageGenerationService.js
//
// 生成记录的存取。一次成功的生成拆成两张表存，目的是让"看列表"不用把原图读进内存：
//   - imageGenerations：这次生成的全部信息 + 小缩略图（data URL）。体积小，
//     画廊列表、统计、备份都读它。
//   - imageGenerationFiles：原图 Blob，主键 generationId 与上面一一对应。
//     体积大，只在查看单张或下载时按 id 单独读取；备份会跳过这张表
//     （见 backupService.js 的 BACKUP_EXCLUDED_TABLES）。
//
// 表定义见 src/db/index.js 的 db.version(83)。
//
// 记录字段（imageGenerations）：
//   source          'studio'（生图室）；之后聊天里的生图会用 'chat'
//   backend         'novelai' | 'third_party'
//   model           实际用的模型
//   chatId / characterId   关联的聊天和角色，没关联就是 null
//   scenePrompt     用户在生图室里写的场景部分
//   prompt          实际发出去的完整正面提示词
//   negativePrompt  实际发出去的负面提示词
//   params          { width, height, steps, scale, sampler, noiseSchedule,
//                     cfgRescale, ucPreset, seed } 或第三方的 { size }
//   thumbnail       缩略图 data URL，拿不到图（只有外链）时为空字符串
//   width / height  原图实际尺寸，未知时为 0
//   originalBytes   原图字节数，没有原图时为 0
//   hasOriginal     原图是否存在 imageGenerationFiles 里
//   remoteUrl       只拿到外链（下载失败）时的链接，否则为空字符串
//   createdAt       ISO 时间字符串

import db from '../../db';

export const GENERATION_SOURCE_STUDIO = 'studio';

/**
 * 保存一次成功的生成。blob 为 null 表示只有外链（remoteUrl），不写原图表。
 * 两张表在同一个事务里写，要么都成功要么都不留。
 */
export const saveGeneration = async ({ meta, blob }) => {
  const record = {
    source: GENERATION_SOURCE_STUDIO,
    chatId: null,
    characterId: null,
    scenePrompt: '',
    negativePrompt: '',
    thumbnail: '',
    width: 0,
    height: 0,
    remoteUrl: '',
    ...meta,
    originalBytes: blob ? blob.size : 0,
    hasOriginal: Boolean(blob),
    createdAt: new Date().toISOString(),
  };

  const id = await db.transaction(
    'rw',
    db.imageGenerations,
    db.imageGenerationFiles,
    async () => {
      const generationId = await db.imageGenerations.add(record);

      if (blob) {
        await db.imageGenerationFiles.put({
          generationId,
          blob,
          mime: blob.type || 'image/png',
        });
      }

      return generationId;
    }
  );

  return { ...record, id };
};

/**
 * 按 id 读原图 Blob。没有（外链记录，或备份恢复后原图不在了）返回 null。
 */
export const getGenerationOriginal = async (generationId) => {
  if (!generationId) return null;

  try {
    const row = await db.imageGenerationFiles.get(generationId);
    return row?.blob || null;
  } catch (error) {
    console.warn('[ImageStudio] 读取原图失败：', error);
    return null;
  }
};

/**
 * 统计已保存的生成记录：张数、原图总字节数、缩略图总字节数（按字符串长度估算）。
 * 用 each 逐条遍历，不会把整张表一次性读进内存。
 */
export const getGenerationStats = async () => {
  const stats = { count: 0, originalBytes: 0, thumbnailBytes: 0 };

  try {
    await db.imageGenerations.each((record) => {
      stats.count += 1;
      stats.originalBytes += Number(record.originalBytes) || 0;
      stats.thumbnailBytes += String(record.thumbnail || '').length;
    });
  } catch (error) {
    console.warn('[ImageStudio] 统计生成记录失败：', error);
  }

  return stats;
};

export default {
  saveGeneration,
  getGenerationOriginal,
  getGenerationStats,
};