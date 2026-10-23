/*
 * companionSchoolOpenDayRules.js —— 「家长开放日」的纯规则函数。
 *
 * 只做字符串和判断，不碰 db、不碰网络、不碰 React，所以可以直接用 node 跑测试。
 * 管三件事：
 *   1. 职业：预设清单怎么取、自己写的职业怎么清理和检查（它会被放进 AI 提示词，
 *      所以要防提示词注入：只留汉字、字母、数字，最多 8 个字，再挡掉几个明显
 *      像指令的词）。
 *   2. AI 返回的三段同学反应怎么检查（长度、格式、有没有 emoji、有没有网址）。
 *   3. 写进生活记录的那一句默认文案。
 *
 * 只 import companionSchoolFestivalData。
 */

import {
  OPEN_DAY_PROFESSIONS,
  OPEN_DAY_CUSTOM_MAX_LEN,
  OPEN_DAY_DEFAULT_TEXT,
} from './companionSchoolFestivalData';

/* ---------------- 小工具 ---------------- */

/** 去掉 emoji（AI 偶尔会手滑带出来，全站不用 emoji）。写法跟猜词规则一致。 */
const EMOJI_RE = /[\p{Extended_Pictographic}‍️]/gu;
export const stripEmoji = (text) => String(text || '').replace(EMOJI_RE, '');

/** 学段不认识时退回小学。 */
export const resolveOpenDayStage = (stage) => (stage === 'kindergarten' ? 'kindergarten' : 'primary');

/** 某学段的预设职业清单。 */
export const getOpenDayProfessions = (stage) => OPEN_DAY_PROFESSIONS[resolveOpenDayStage(stage)];

/* ---------------- 自己写的职业 ---------------- */

/** 只留汉字、字母、数字；其余（空格、标点、符号、引号……）一律去掉。 */
const CUSTOM_DISALLOWED_RE = /[^㐀-鿿A-Za-z0-9]/g;

/**
 * 挡掉明显像"对 AI 下指令"的词。真实的职业名里基本不会出现这些。
 * 这一层只是多一道保险，真正的防线是：只当作数据放进提示词、输出只认固定
 * 格式的 JSON、反应文字只显示不执行。
 */
const CUSTOM_BLOCKED_WORDS = ['忽略', '无视', '指令', '提示词', '扮演', '假装', '以上规则', '输出'];

/** 输入框里实时清理：去掉不允许的字符，截到上限。不判断对不对。 */
export const cleanCustomProfessionInput = (raw) => (
  String(raw || '').replace(CUSTOM_DISALLOWED_RE, '').slice(0, OPEN_DAY_CUSTOM_MAX_LEN)
);

/**
 * 检查自己写的职业。
 * @returns {{ ok: boolean, value: string, reason: ''|'empty'|'blocked' }}
 */
export const validateCustomProfession = (raw) => {
  const value = cleanCustomProfessionInput(stripEmoji(raw));
  if (!value) return { ok: false, value: '', reason: 'empty' };
  if (CUSTOM_BLOCKED_WORDS.some((word) => value.includes(word))) {
    return { ok: false, value, reason: 'blocked' };
  }
  return { ok: true, value, reason: '' };
};

/**
 * 综合"点选的"和"自己写的"，得出最终职业。写了字就以自己写的为准。
 * 自己写的恰好和预设里某个一样，按预设算（不吃自填那一档更高的奖励）。
 *
 * @returns {{ valid: boolean, profession: string, isCustom: boolean, hint: string }}
 */
export const resolveProfession = ({ stage, picked = null, custom = '' } = {}) => {
  const presets = getOpenDayProfessions(stage);

  if (String(custom || '').length > 0) {
    const checked = validateCustomProfession(custom);
    if (!checked.ok) {
      return {
        valid: false,
        profession: '',
        isCustom: false,
        hint: checked.reason === 'blocked' ? '这个说法不太像职业，换一个试试' : '',
      };
    }
    return {
      valid: true,
      profession: checked.value,
      isCustom: !presets.includes(checked.value),
      hint: '',
    };
  }

  if (picked && presets.includes(picked)) {
    return { valid: true, profession: picked, isCustom: false, hint: '' };
  }
  return { valid: false, profession: '', isCustom: false, hint: '' };
};

/* ---------------- AI 返回的同学反应 ---------------- */

/** 每段反应的字数：soft 写进提示词，hard 是校验上限，min 是校验下限。 */
export const OPEN_DAY_REACTION_LIMITS = {
  kindergarten: { soft: 30, hard: 45, min: 4 },
  primary: { soft: 40, hard: 60, min: 4 },
};

const QUOTE_EDGE_RE = /^["'“”‘’「」『』]+|["'“”‘’「」『』]+$/g;
const SUSPICIOUS_RE = /https?:|www\.|```|[{}]/i;

const cleanReactionText = (raw) => stripEmoji(String(raw ?? ''))
  .replace(/\s+/g, ' ')
  .replace(QUOTE_EDGE_RE, '')
  .trim();

/**
 * 检查并整理 AI 返回的反应。
 *
 * @param {object|Array} parsed   解析过的 JSON：{ reactions: [{ id, text }, ...] }，
 *                                也接受直接是数组
 * @param {object[]} classmates   这次出场的同学（RECESS_CLASSMATES 里的几位）
 * @param {string} stage          学段
 * @returns {Array<{ id: string, text: string }>|null}
 *   按 classmates 的顺序、每位同学一条；任何一条缺了或不合格，整体返回 null
 */
export const sanitizeReactions = (parsed, classmates, stage) => {
  const list = Array.isArray(parsed?.reactions) ? parsed.reactions : (Array.isArray(parsed) ? parsed : null);
  if (!list || !Array.isArray(classmates) || !classmates.length) return null;

  const limits = OPEN_DAY_REACTION_LIMITS[resolveOpenDayStage(stage)];
  const result = [];
  for (let i = 0; i < classmates.length; i += 1) {
    const mate = classmates[i];
    const item = list.find((x) => x && (x.id === mate.id || x.name === mate.name));
    if (!item) return null;

    const text = cleanReactionText(item.text ?? item.reaction);
    if (text.length < limits.min || text.length > limits.hard) return null;
    if (SUSPICIOUS_RE.test(text)) return null;

    result.push({ id: mate.id, text });
  }
  return result;
};

/* ---------------- 生活记录里的一句话 ---------------- */

export const buildOpenDayResultText = ({ job = '', name = '' } = {}) => (
  OPEN_DAY_DEFAULT_TEXT
    .split('{job}').join(job || '自己的职业')
    .split('{name}').join(name || '小伙伴')
);