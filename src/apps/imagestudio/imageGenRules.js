// src/apps/imagestudio/imageGenRules.js
//
// 生图室（Image Studio）的常量、默认配置、配置规整函数和 Anlas 夹紧规则。
// 全部是纯函数 / 纯数据，不碰数据库，方便生图服务（切片B）和设置界面共用。
//
// NovelAI 相关的取值来源（2026-10 查阅）：
//   - 模型 id、采样器、噪声调度：nekoai-js 1.3.0 的类型声明（Model / Sampler / Noise 枚举）。
//   - nai-diffusion-5-full：只在一篇第三方博客的可用请求体里出现，nekoai-js 的
//     枚举里还没有，所以放进下拉，但模型字段本身允许用户自由输入。
//   - 免费额度（Opus 订阅 0 Anlas）：1 张图、无底图、宽x高 <= 1048576、steps <= 28，
//     同样来自第三方博客的实测，不是官方文档原文。
//   - ucPreset 只知道取值是 0-3，各自含义没有查到官方说明，界面上只显示数字。
//   - 常用分辨率预设是常见做法（宽高取 64 的倍数），不是 API 强制的枚举，用户可以随便填。

export const IMAGE_GEN_SETTINGS_KEY = 'imageGenConfig';

export const NOVELAI_DEFAULT_HOST = 'https://image.novelai.net';
export const NOVELAI_ACCOUNT_HOST = 'https://api.novelai.net';
// NovelAI 官网的生图页，页面上能看到当前账户的 Anlas 数量（接口查询失败时的备用入口）。
export const NOVELAI_BALANCE_PAGE = 'https://novelai.net/image';

// 免费额度上限（allowAnlas 关闭时，生成前按这些数字夹紧）。
export const FREE_MAX_PIXELS = 1048576;
export const FREE_MAX_STEPS = 28;
export const FREE_N_SAMPLES = 1;

export const NOVELAI_MODELS = [
  { value: 'nai-diffusion-4-5-full', label: 'V4.5 Full' },
  { value: 'nai-diffusion-4-5-curated', label: 'V4.5 Curated' },
  { value: 'nai-diffusion-4-full', label: 'V4 Full' },
  { value: 'nai-diffusion-4-curated-preview', label: 'V4 Curated Preview' },
  { value: 'nai-diffusion-3', label: 'V3' },
  { value: 'nai-diffusion-furry-3', label: 'Furry V3' },
  { value: 'nai-diffusion-5-full', label: 'V5 Full（资料较少）' },
];

export const NOVELAI_SAMPLERS = [
  { value: 'k_euler_ancestral', label: 'Euler Ancestral' },
  { value: 'k_euler', label: 'Euler' },
  { value: 'k_dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral' },
  { value: 'k_dpmpp_2m', label: 'DPM++ 2M' },
  { value: 'k_dpmpp_sde', label: 'DPM++ SDE' },
  { value: 'k_dpmpp_2m_sde', label: 'DPM++ 2M SDE' },
  { value: 'ddim_v3', label: 'DDIM' },
];

export const NOVELAI_NOISE_SCHEDULES = [
  { value: 'karras', label: 'Karras' },
  { value: 'native', label: 'Native' },
  { value: 'exponential', label: 'Exponential' },
  { value: 'polyexponential', label: 'Polyexponential' },
];

export const NOVELAI_UC_PRESETS = [
  { value: 0, label: '预设 0' },
  { value: 1, label: '预设 1' },
  { value: 2, label: '预设 2' },
  { value: 3, label: '预设 3' },
];

// 常用分辨率快捷按钮。大尺寸那几个超过免费像素上限，用来在界面上直观看到夹紧提示。
export const NOVELAI_SIZE_PRESETS = [
  { label: '竖图', width: 832, height: 1216 },
  { label: '横图', width: 1216, height: 832 },
  { label: '方图', width: 1024, height: 1024 },
  { label: '小竖', width: 512, height: 768 },
  { label: '小横', width: 768, height: 512 },
  { label: '大竖', width: 1024, height: 1536 },
  { label: '大横', width: 1536, height: 1024 },
];

// 第三方（类 OpenAI images/generations）常见尺寸，只作输入框的候选提示。
export const THIRD_PARTY_SIZE_SUGGESTIONS = [
  '1024x1024',
  '1024x1792',
  '1792x1024',
  '512x512',
  '768x768',
];

export const BACKEND_THIRD_PARTY = 'third_party';
export const BACKEND_NOVELAI = 'novelai';

export const AI_IMAGE_MODE_AUTO = 'auto';
export const AI_IMAGE_MODE_CONFIRM = 'confirm';

export const DEFAULT_IMAGE_GEN_CONFIG = {
  backend: BACKEND_THIRD_PARTY,
  // 跨域代理 Worker 地址。留空 = 浏览器直连；填了就把 NovelAI 请求发给它转发。
  corsProxyUrl: '',
  // 聊天里 AI 自己决定生图时：auto = 直接生成；confirm = 先出占位卡片，点了才生成。
  aiImageMode: AI_IMAGE_MODE_AUTO,
  // 聊天里没有单独填用户外貌时，回退使用这一份。
  defaultUserAppearance: '',
  thirdParty: {
    baseUrl: '',
    apiKey: '',
    model: '',
    size: '1024x1024',
    // 用户自己填的"查询剩余积分"网址（各家第三方服务的地址不同，没法替他写死）。
    balanceUrl: '',
  },
  novelai: {
    token: '',
    model: 'nai-diffusion-4-5-full',
    sampler: 'k_euler_ancestral',
    noiseSchedule: 'karras',
    steps: 28,
    scale: 5,
    cfgRescale: 0,
    ucPreset: 0,
    width: 832,
    height: 1216,
    positivePrefix: '',
    negativePrompt: '',
    // false = 生成前把参数夹紧到免费范围；true = 不限制，允许消耗 Anlas。
    allowAnlas: false,
  },
};

const asString = (value, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const asFiniteNumber = (value, fallback) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pickFromList = (value, list, fallback) =>
  list.some((item) => item === value) ? value : fallback;

export const snapTo64 = (value) => {
  const rounded = Math.round(asFiniteNumber(value, 64) / 64) * 64;
  return Math.max(64, rounded);
};

/**
 * 把存储里读出来的原始配置（可能是 null、缺字段、旧版本结构）规整成完整结构。
 * 只在读取和保存时调用，不要在用户输入的每一次按键里调用，否则会打断输入。
 */
export const normalizeImageGenConfig = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const third = source.thirdParty && typeof source.thirdParty === 'object' ? source.thirdParty : {};
  const nai = source.novelai && typeof source.novelai === 'object' ? source.novelai : {};
  const defaults = DEFAULT_IMAGE_GEN_CONFIG;

  return {
    backend: pickFromList(
      source.backend,
      [BACKEND_THIRD_PARTY, BACKEND_NOVELAI],
      defaults.backend
    ),
    corsProxyUrl: asString(source.corsProxyUrl).trim().replace(/\/+$/, ''),
    aiImageMode: pickFromList(
      source.aiImageMode,
      [AI_IMAGE_MODE_AUTO, AI_IMAGE_MODE_CONFIRM],
      defaults.aiImageMode
    ),
    defaultUserAppearance: asString(source.defaultUserAppearance),
    thirdParty: {
      baseUrl: asString(third.baseUrl).trim().replace(/\/+$/, ''),
      apiKey: asString(third.apiKey).trim(),
      model: asString(third.model).trim(),
      size: asString(third.size, defaults.thirdParty.size).trim() || defaults.thirdParty.size,
      balanceUrl: asString(third.balanceUrl).trim(),
    },
    novelai: {
      token: asString(nai.token).trim(),
      model: asString(nai.model, defaults.novelai.model).trim() || defaults.novelai.model,
      sampler: asString(nai.sampler, defaults.novelai.sampler).trim() || defaults.novelai.sampler,
      noiseSchedule:
        asString(nai.noiseSchedule, defaults.novelai.noiseSchedule).trim() ||
        defaults.novelai.noiseSchedule,
      steps: Math.max(1, Math.round(asFiniteNumber(nai.steps, defaults.novelai.steps))),
      scale: Math.max(0, asFiniteNumber(nai.scale, defaults.novelai.scale)),
      cfgRescale: Math.min(
        1,
        Math.max(0, asFiniteNumber(nai.cfgRescale, defaults.novelai.cfgRescale))
      ),
      ucPreset: pickFromList(
        Math.round(asFiniteNumber(nai.ucPreset, defaults.novelai.ucPreset)),
        [0, 1, 2, 3],
        defaults.novelai.ucPreset
      ),
      width: snapTo64(asFiniteNumber(nai.width, defaults.novelai.width)),
      height: snapTo64(asFiniteNumber(nai.height, defaults.novelai.height)),
      positivePrefix: asString(nai.positivePrefix),
      negativePrompt: asString(nai.negativePrompt),
      allowAnlas: nai.allowAnlas === true,
    },
  };
};

/**
 * 生成前的 Anlas 夹紧。不修改用户存下来的数值，只返回"这一次实际要发的"参数
 * 和一份人话说明（给界面显示，也方便日志）。
 * 张数在本应用里恒为 1（FREE_N_SAMPLES），这里不处理 n_samples。
 *
 * allowAnlas 为 true 时原样返回，不做任何限制。
 */
export const clampNovelAiParams = (novelai, allowAnlas) => {
  const steps = Math.max(1, Math.round(asFiniteNumber(novelai?.steps, 28)));
  const width = snapTo64(novelai?.width);
  const height = snapTo64(novelai?.height);

  if (allowAnlas) {
    return { params: { width, height, steps }, adjustments: [] };
  }

  const adjustments = [];
  let nextSteps = steps;
  let nextWidth = width;
  let nextHeight = height;

  if (nextSteps > FREE_MAX_STEPS) {
    adjustments.push(`steps ${steps} 调整为 ${FREE_MAX_STEPS}`);
    nextSteps = FREE_MAX_STEPS;
  }

  if (nextWidth * nextHeight > FREE_MAX_PIXELS) {
    const ratio = Math.sqrt(FREE_MAX_PIXELS / (nextWidth * nextHeight));
    nextWidth = Math.max(64, Math.floor((nextWidth * ratio) / 64) * 64);
    nextHeight = Math.max(64, Math.floor((nextHeight * ratio) / 64) * 64);

    // 极端长宽比下取整到 64 的最小值后仍可能超限，逐步压缩较长的一边。
    while (nextWidth * nextHeight > FREE_MAX_PIXELS && (nextWidth > 64 || nextHeight > 64)) {
      if (nextWidth >= nextHeight) {
        nextWidth -= 64;
      } else {
        nextHeight -= 64;
      }
    }

    adjustments.push(`尺寸 ${width}x${height} 调整为 ${nextWidth}x${nextHeight}`);
  }

  return {
    params: { width: nextWidth, height: nextHeight, steps: nextSteps },
    adjustments,
  };
};

/**
 * 把用户填的网址整理成可以放进 <a href> 的安全地址：
 * 没写协议就补 https://，只接受 http / https，别的（javascript: 之类）一律当作没填。
 */
export const toSafeExternalUrl = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch {
    return '';
  }
};

/**
 * 把若干段提示词用逗号拼起来，自动跳过空段、去掉每段首尾多余的逗号和空白。
 * 切片B拼最终提示词时会用到；放在这里是因为它和画师串服务共用同一套清理规则。
 */
export const joinPromptParts = (parts) =>
  (Array.isArray(parts) ? parts : [])
    .map((part) =>
      String(part || '')
        .replace(/\r?\n+/g, ', ')
        .trim()
        .replace(/^,+\s*/, '')
        .replace(/\s*,+$/, '')
        .trim()
    )
    .filter(Boolean)
    .join(', ');