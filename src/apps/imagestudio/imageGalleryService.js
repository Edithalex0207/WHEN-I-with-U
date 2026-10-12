// src/apps/imagestudio/imageGalleryService.js
//
// 画廊用到的数据操作：分页读列表、删除、重 roll、打包 zip。
// 列表只读 imageGenerations（含小缩略图），原图要用时才按 id 单独读，
// 所以翻画廊不会把一大堆原图读进内存。

import db from '../../db';
import { ImageGenError, requestNovelAiImage, requestThirdPartyImage } from './imageGenAdapters';
import { readSizeAndMakeThumbnail } from './imageGenMedia';
import { generateSeed, getMissingConfigItems } from './imageGenRequest';
import { BACKEND_NOVELAI, clampNovelAiParams } from './imageGenRules';
import { getGenerationOriginal, saveGeneration } from './imageGenerationService';

export const GALLERY_PAGE_SIZE = 24;

/**
 * 按时间从新到旧分页读记录。返回 { items, hasMore }。
 */
export const listGenerations = async ({ offset = 0, limit = GALLERY_PAGE_SIZE } = {}) => {
  const rows = await db.imageGenerations
    .orderBy('createdAt')
    .reverse()
    .offset(offset)
    .limit(limit + 1)
    .toArray();

  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
};

/**
 * 删除若干条记录（缩略图记录和原图一起删，同一个事务）。
 */
export const deleteGenerations = async (ids) => {
  const list = (ids || []).filter((id) => id !== null && id !== undefined);
  if (list.length === 0) return 0;

  await db.transaction('rw', db.imageGenerations, db.imageGenerationFiles, async () => {
    await db.imageGenerationFiles.bulkDelete(list);
    await db.imageGenerations.bulkDelete(list);
  });

  return list.length;
};

const extensionOf = (blob) => {
  const type = String(blob?.type || '');
  if (type.includes('jpeg')) return 'jpg';
  if (type.includes('webp')) return 'webp';
  return 'png';
};

const pad = (value) => String(value).padStart(2, '0');

export const buildStudioFileName = (record, blob) => {
  const date = new Date(record.createdAt || Date.now());
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `studio-${stamp}-${record.id}.${extensionOf(blob)}`;
};

/**
 * 读出若干条记录的原图，返回 [{ record, blob, fileName }]；原图不在的记录会被跳过，
 * 数量记在 missing 里。逐张读取，不并行，避免瞬间占满内存。
 */
export const loadOriginals = async (records) => {
  const files = [];
  let missing = 0;

  for (const record of records) {
    const blob = record.hasOriginal ? await getGenerationOriginal(record.id) : null;
    if (blob) {
      files.push({ record, blob, fileName: buildStudioFileName(record, blob) });
    } else {
      missing += 1;
    }
  }

  return { files, missing };
};

/**
 * 把若干条记录的原图打成一个 zip Blob。图片本身已经压缩过，zip 里只存不再压缩，速度快。
 */
export const buildGenerationsZip = async (records) => {
  const { files, missing } = await loadOriginals(records);

  if (files.length === 0) {
    return { blob: null, count: 0, missing };
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  for (const { blob, fileName } of files) {
    // 用 ArrayBuffer 而不是直接塞 Blob，各种环境下 JSZip 都能稳定读取。
    zip.file(fileName, await blob.arrayBuffer());
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return { blob, count: files.length, missing };
};

/**
 * 重 roll：用这条记录保存下来的提示词和参数再生一张，作为新记录保存，旧的保留。
 * NovelAI 换一个新的随机种子；后端、Token、Worker 等用当前设置。
 * 只有记录的后端和当前启用的后端一致才能重 roll。
 * 返回值形状和 runImageGeneration 一致：{ record, blob, remoteUrl, adjustments, saveError }。
 */
export const rerollGeneration = async ({ record, config }) => {
  if (!record) throw new ImageGenError('找不到这条记录。', { kind: 'input' });

  if (record.backend !== config.backend) {
    throw new ImageGenError(
      '这张图是用另一个后端生成的，当前设置里启用的后端不同。请先到「设置」切回同一个后端再重 roll。',
      { kind: 'config' }
    );
  }

  const missing = getMissingConfigItems(config);
  if (missing.length > 0) {
    throw new ImageGenError(`还缺少：${missing.join('、')}。请先到「设置」页填写。`, {
      kind: 'config',
    });
  }

  const savedParams = record.params || {};
  let result;
  let meta;
  let adjustments = [];

  if (record.backend === BACKEND_NOVELAI) {
    const nai = {
      ...config.novelai,
      model: record.model || config.novelai.model,
      sampler: savedParams.sampler || config.novelai.sampler,
      noiseSchedule: savedParams.noiseSchedule || config.novelai.noiseSchedule,
      scale: savedParams.scale ?? config.novelai.scale,
      cfgRescale: savedParams.cfgRescale ?? config.novelai.cfgRescale,
      ucPreset: savedParams.ucPreset ?? config.novelai.ucPreset,
      width: savedParams.width || config.novelai.width,
      height: savedParams.height || config.novelai.height,
      steps: savedParams.steps || config.novelai.steps,
    };

    // 额度开关以当前设置为准：关着的话，哪怕旧记录是开着时生成的，也照样夹到免费范围。
    const clamped = clampNovelAiParams(nai, config.novelai.allowAnlas);
    adjustments = clamped.adjustments;
    const seed = generateSeed();

    result = await requestNovelAiImage({
      config: { ...config, novelai: nai },
      positive: record.prompt,
      negative: record.negativePrompt || '',
      params: clamped.params,
      seed,
    });

    meta = {
      backend: BACKEND_NOVELAI,
      model: nai.model,
      params: {
        ...clamped.params,
        scale: nai.scale,
        sampler: nai.sampler,
        noiseSchedule: nai.noiseSchedule,
        cfgRescale: nai.cfgRescale,
        ucPreset: nai.ucPreset,
        seed,
      },
    };
  } else {
    const thirdParty = {
      ...config.thirdParty,
      model: record.model || config.thirdParty.model,
      size: savedParams.size || config.thirdParty.size,
    };

    result = await requestThirdPartyImage({
      config: { ...config, thirdParty },
      positive: record.prompt,
    });

    meta = {
      backend: record.backend,
      model: thirdParty.model,
      params: { size: thirdParty.size },
    };
  }

  let imageInfo = { width: 0, height: 0, thumbnail: '' };
  if (result.blob) {
    try {
      imageInfo = await readSizeAndMakeThumbnail(result.blob);
    } catch (error) {
      console.warn('[ImageStudio] 生成缩略图失败：', error);
    }
  }

  try {
    const saved = await saveGeneration({
      meta: {
        ...meta,
        source: record.source,
        chatId: record.chatId ?? null,
        characterId: record.characterId ?? null,
        scenePrompt: record.scenePrompt || '',
        prompt: record.prompt,
        negativePrompt: record.negativePrompt || '',
        thumbnail: imageInfo.thumbnail,
        width: imageInfo.width,
        height: imageInfo.height,
        remoteUrl: result.remoteUrl || '',
      },
      blob: result.blob,
    });

    return { record: saved, blob: result.blob, remoteUrl: result.remoteUrl || '', adjustments, saveError: '' };
  } catch (error) {
    console.warn('[ImageStudio] 保存重 roll 记录失败：', error);
    const isQuota = error?.name === 'QuotaExceededError' || /quota/i.test(String(error?.message));

    return {
      record: null,
      blob: result.blob,
      remoteUrl: result.remoteUrl || '',
      adjustments,
      saveError: isQuota
        ? '存储空间不足，这张图没有存进画廊。请先清理一些空间。'
        : `这张图没有存进画廊：${error?.message || '未知原因'}。`,
    };
  }
};