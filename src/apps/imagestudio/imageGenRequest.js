// src/apps/imagestudio/imageGenRequest.js
//
// 生图请求的"纯函数"部分：最终提示词拼接、两个后端的请求地址和请求体、
// 配置完整性检查、随机种子。全部不碰网络和数据库，方便单独验证。
// 真正发请求的代码在 imageGenAdapters.js。
//
// NovelAI 请求体的结构来自一份可用的 V5 请求示例（2026-10 查阅的第三方博客），
// 不是官方文档原文，几个需要留意的点：
//   - 提示词要同时放在三处：顶层 input、parameters.prompt、
//     parameters.v4_prompt.caption.base_caption。
//   - V4 及以上的模型缺了 v4_prompt / v4_negative_prompt 会返回 500（不是 400）。
//     V3 和 Furry V3 是否接受这两个字段没有资料，所以只对模型名里带
//     nai-diffusion-4 / nai-diffusion-5 的才加。
//   - 负面提示词同样放三处（negative_prompt 和 v4_negative_prompt 的 base_caption），
//     这一点没有成功请求可以对照，是按"和正面一致"推断的，需要用真实 token 验证。

import {
  BACKEND_NOVELAI,
  NOVELAI_ACCOUNT_HOST,
  NOVELAI_DEFAULT_HOST,
  clampNovelAiParams,
  joinPromptParts,
} from './imageGenRules';

/**
 * 拼出最终的正面 / 负面提示词。
 * NovelAI：固定前缀、已启用的画师串、角色外貌、用户外貌、场景，依次用逗号拼。
 * 第三方：没有画师串和固定前缀这些概念，只拼外貌和场景，也没有负面词
 * （OpenAI 的 images/generations 接口不支持负面提示词）。
 */
export const buildGenerationPrompts = ({
  config,
  sceneText,
  characterAppearance = '',
  userAppearance = '',
  artistTags = '',
}) => {
  if (config.backend === BACKEND_NOVELAI) {
    return {
      positive: joinPromptParts([
        config.novelai.positivePrefix,
        artistTags,
        characterAppearance,
        userAppearance,
        sceneText,
      ]),
      negative: String(config.novelai.negativePrompt || '').trim(),
    };
  }

  return {
    positive: joinPromptParts([characterAppearance, userAppearance, sceneText]),
    negative: '',
  };
};

export const generateSeed = () => Math.floor(Math.random() * 4294967295);

export const needsV4Prompt = (model) => /nai-diffusion-(4|5)/.test(String(model || ''));

export const buildNovelAiUrl = (corsProxyUrl) => {
  const host = String(corsProxyUrl || '').trim() || NOVELAI_DEFAULT_HOST;
  return `${host.replace(/\/+$/, '')}/ai/generate-image`;
};

/**
 * @param params 已经按 Anlas 规则夹紧过的 { width, height, steps }
 */
export const buildNovelAiRequestBody = ({ novelai, positive, negative, params, seed }) => {
  const parameters = {
    params_version: 4,
    width: params.width,
    height: params.height,
    scale: novelai.scale,
    sampler: novelai.sampler,
    steps: params.steps,
    seed,
    extra_noise_seed: seed,
    n_samples: 1,
    ucPreset: novelai.ucPreset,
    qualityToggle: false,
    sm: false,
    sm_dyn: false,
    dynamic_thresholding: false,
    controlnet_strength: 1,
    legacy: false,
    add_original_image: false,
    legacy_v3_extend: false,
    cfg_rescale: novelai.cfgRescale,
    noise_schedule: novelai.noiseSchedule,
    uncond_scale: 1,
    negative_prompt: negative,
    prompt: positive,
    reference_image_multiple: [],
    reference_information_extracted_multiple: [],
    reference_strength_multiple: [],
  };

  if (needsV4Prompt(novelai.model)) {
    parameters.v4_prompt = {
      caption: { base_caption: positive, char_captions: [] },
      use_coords: false,
      use_order: false,
    };
    parameters.v4_negative_prompt = {
      caption: { base_caption: negative, char_captions: [] },
      use_coords: false,
      use_order: false,
    };
  }

  return {
    input: positive,
    model: novelai.model,
    action: 'generate',
    parameters,
  };
};

/**
 * 用户可能直接粘贴了完整的 .../images/generations 地址，这里统一还原再拼一次。
 */
export const buildThirdPartyUrl = (baseUrl) => {
  const clean = String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/images\/generations$/, '');
  return `${clean}/images/generations`;
};

export const buildThirdPartyRequestBody = ({ thirdParty, positive, withResponseFormat = true }) => {
  const body = {
    prompt: positive,
    n: 1,
    size: thirdParty.size,
  };

  if (thirdParty.model) body.model = thirdParty.model;
  if (withResponseFormat) body.response_format = 'b64_json';

  return body;
};

/**
 * 配置里还缺什么。返回人话列表，空数组表示可以发请求。
 */
export const getMissingConfigItems = (config) => {
  const missing = [];

  if (config.backend === BACKEND_NOVELAI) {
    if (!config.novelai.token) missing.push('NovelAI 的 API Token');
    if (!config.novelai.model) missing.push('NovelAI 的模型');
  } else {
    if (!config.thirdParty.baseUrl) missing.push('第三方接口地址');
    if (!config.thirdParty.apiKey) missing.push('第三方 API Key');
  }

  return missing;
};

/**
 * 这一次大概会出多大的图，只用来让界面提前按正确比例摆好占位画框。
 * NovelAI 取夹紧之后的宽高；第三方解析 "宽x高"，解析不出来按方图算。
 * 真正的尺寸以生成后读到的图片为准。
 */
export const getPlannedImageSize = (config) => {
  if (config?.backend === BACKEND_NOVELAI) {
    const { params } = clampNovelAiParams(config.novelai, config.novelai.allowAnlas);
    return { width: params.width, height: params.height };
  }

  const match = String(config?.thirdParty?.size || '').match(/(\d+)\s*[x×*]\s*(\d+)/i);
  if (match && Number(match[1]) > 0 && Number(match[2]) > 0) {
    return { width: Number(match[1]), height: Number(match[2]) };
  }

  return { width: 1024, height: 1024 };
};

/**
 * 查询账户信息（含 Anlas）的地址。账户接口在 api.novelai.net，不是出图用的 image.novelai.net。
 * 配了跨域代理就发给代理，路径是 /user/data，需要代理把 /user/ 开头的请求转到 api.novelai.net。
 */
export const buildNovelAiAccountUrl = (corsProxyUrl) => {
  const host = String(corsProxyUrl || '').trim() || NOVELAI_ACCOUNT_HOST;
  return `${host.replace(/\/+$/, '')}/user/data`;
};

/**
 * 从账户信息里取 Anlas：免费赠送的 + 购买的。取不到返回 null。
 * 字段名来自社区客户端的实际用法（subscription.trainingStepsLeft），不是官方文档原文。
 */
export const extractAnlas = (payload) => {
  const steps = payload?.subscription?.trainingStepsLeft ?? payload?.trainingStepsLeft;
  if (!steps || typeof steps !== 'object') return null;

  const fixed = Number(steps.fixedTrainingStepsLeft) || 0;
  const purchased = Number(steps.purchasedTrainingSteps) || 0;

  return { fixed, purchased, total: fixed + purchased };
};