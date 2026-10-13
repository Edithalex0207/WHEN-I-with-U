// src/apps/imagestudio/imageGenRunner.js
//
// 一次完整生图的编排：收集素材（外貌、画师串）-> 拼提示词 -> 按 Anlas 规则夹紧参数
// -> 调后端 -> 做缩略图 -> 写进数据库。生图室的生成面板调用 runImageGeneration，
// 之后聊天里的生图（切片D）也走同一个入口，不重复实现。
//
// loadPromptSources / buildGenerationPrompts 单独导出，是为了让生成面板的
// "最终提示词预览"和真正发出去的提示词用同一套逻辑，预览所见即所得。

import { getEnabledArtistTagString } from './artistTagService';
import { getCharacterAppearance, resolveUserAppearance } from './appearanceService';
import { ImageGenError, requestNovelAiImage, requestThirdPartyImage } from './imageGenAdapters';
import { readSizeAndMakeThumbnail } from './imageGenMedia';
import { buildGenerationPrompts, generateSeed, getMissingConfigItems } from './imageGenRequest';
import { BACKEND_NOVELAI, clampNovelAiParams } from './imageGenRules';
import { GENERATION_SOURCE_STUDIO, saveGeneration } from './imageGenerationService';

/**
 * 读出拼提示词需要的几段素材。
 * 角色外貌只在选了角色且勾了"带上"时读；用户外貌只在选了聊天且勾了"带上"时读
 * （聊天里没填会自动回退到全局默认）；画师串只有 NovelAI 后端才用。
 */
export const loadPromptSources = async ({
  config,
  chatId = null,
  characterId = null,
  includeCharacterAppearance = false,
  includeUserAppearance = false,
}) => {
  const [characterAppearance, userAppearance, artistTags] = await Promise.all([
    includeCharacterAppearance && characterId ? getCharacterAppearance(characterId) : '',
    includeUserAppearance && chatId ? resolveUserAppearance(chatId) : '',
    config.backend === BACKEND_NOVELAI ? getEnabledArtistTagString() : '',
  ]);

  return { characterAppearance, userAppearance, artistTags };
};

/**
 * 跑一次生成。成功返回：
 *   { record, blob, remoteUrl, adjustments, saveError }
 * 其中 record 是写进数据库的记录；如果图已经生成出来了但写库失败（比如存储空间满了），
 * record 为 null、saveError 是原因，图（blob）仍然返回，让界面可以先让用户保存到设备，
 * 不会白白浪费这一次生成。
 * 生成本身失败会抛出 ImageGenError。
 */
export const runImageGeneration = async ({
  config,
  sceneText,
  chatId = null,
  characterId = null,
  includeCharacterAppearance = false,
  includeUserAppearance = false,
  // 'studio'（生图室手动生成）或 'chat'（聊天里AI自己触发，见
  // chatImageGenService.js）。只是落到 imageGenerations.source 字段，
  // 不影响生成逻辑本身。
  source = GENERATION_SOURCE_STUDIO,
}) => {
  const missing = getMissingConfigItems(config);
  if (missing.length > 0) {
    throw new ImageGenError(`还缺少：${missing.join('、')}。请先到「设置」页填写。`, {
      kind: 'config',
    });
  }

  const scene = String(sceneText || '').trim();
  if (!scene) {
    throw new ImageGenError('请先写一下想画什么。', { kind: 'input' });
  }

  const sources = await loadPromptSources({
    config,
    chatId,
    characterId,
    includeCharacterAppearance,
    includeUserAppearance,
  });

  const { positive, negative } = buildGenerationPrompts({
    config,
    sceneText: scene,
    ...sources,
  });

  let result;
  let meta;
  let adjustments = [];

  if (config.backend === BACKEND_NOVELAI) {
    const nai = config.novelai;
    const clamped = clampNovelAiParams(nai, nai.allowAnlas);
    const seed = generateSeed();
    adjustments = clamped.adjustments;

    result = await requestNovelAiImage({
      config,
      positive,
      negative,
      params: clamped.params,
      seed,
    });

    meta = {
      backend: BACKEND_NOVELAI,
      source,
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
    result = await requestThirdPartyImage({ config, positive });

    meta = {
      backend: config.backend,
      source,
      model: config.thirdParty.model,
      params: { size: config.thirdParty.size },
    };
  }

  let imageInfo = { width: 0, height: 0, thumbnail: '' };

  if (result.blob) {
    try {
      imageInfo = await readSizeAndMakeThumbnail(result.blob);
    } catch (error) {
      // 缩略图做不出来不影响这张图本身，记录里缩略图留空。
      console.warn('[ImageStudio] 生成缩略图失败：', error);
    }
  }

  try {
    const record = await saveGeneration({
      meta: {
        ...meta,
        chatId,
        characterId,
        scenePrompt: scene,
        prompt: positive,
        negativePrompt: negative,
        thumbnail: imageInfo.thumbnail,
        width: imageInfo.width,
        height: imageInfo.height,
        remoteUrl: result.remoteUrl || '',
      },
      blob: result.blob,
    });

    return { record, blob: result.blob, remoteUrl: result.remoteUrl || '', adjustments, saveError: '' };
  } catch (error) {
    console.warn('[ImageStudio] 保存生成记录失败：', error);

    const isQuota = error?.name === 'QuotaExceededError' || /quota/i.test(String(error?.message));

    return {
      record: null,
      blob: result.blob,
      remoteUrl: result.remoteUrl || '',
      adjustments,
      saveError: isQuota
        ? '存储空间不足，这张图没有存进画廊。请先保存到设备，再清理一些空间。'
        : `这张图没有存进画廊：${error?.message || '未知原因'}。请先保存到设备。`,
    };
  }
};