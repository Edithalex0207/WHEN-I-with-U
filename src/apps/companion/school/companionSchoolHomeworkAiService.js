/*
 * companionSchoolHomeworkAiService.js —— 「老师的嘱托」里唯一调用 AI 的地方：
 * 让班里的同学现写一篇小作文。
 *
 * 写法照抄同目录下 companionSchoolRecessGuessAiService.js：直接 fetch 聊天补全
 * 接口，用 db.settings.get('apiConfig')，不走 triggerAiResponse，不写
 * db.messages，不带小伙伴的角色人设——写作文的是"班里的同学"，只需要一个
 * 普通文本模型。
 *
 * 【什么时候会调（要让玩家知道）】
 * - 小作文类嘱托第一次被打开时，自动调一次（嘱托生成时不调）。
 * - 玩家点"换一篇"时，每点一次调一次，不限次数；选了分数就锁定，不能再换。
 * 每次调用 = 一次 API 请求，用的是玩家自己配置的接口。弹窗里 AI 现写的那篇
 * 会显示蓝色说明条；固定小作文不显示。
 *
 * 【失败怎么办】
 * writeEssay 不抛错，返回 status：
 *   'ok'        写好了，essay 是 { topicId, title, text, source:'ai' }
 *   'noconfig'  没配置 API（没有发请求）
 *   'failed'    请求失败 / 超时 / 返回的格式不对 / 字数不合适
 * 第一次打开时失败，调用方保留原来的固定小作文（保证一定能批）；点"换一篇"
 * 时失败，调用方保持原文并提示"接口好像有问题，请检查 API 配置"。
 *
 * 输出里不要 emoji：提示词里明说，返回之后还会再过滤一遍。
 */

import db from '../../../db';
import { pickEssayTopic } from './companionSchoolHomeworkService';
import { HOMEWORK_ESSAY_LENGTH, HOMEWORK_AI_TIMEOUT_MS } from './companionSchoolHomeworkData';

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{FE0F}\u{200D}]/gu;

const getApiConfig = async () => {
  const apiSettings = await db.settings.get('apiConfig');
  const apiConfig = apiSettings?.value || {};
  if (!apiConfig.baseUrl || !apiConfig.apiKey) return null;
  return apiConfig;
};

/** 有没有配置 AI 接口。 */
export const hasApiConfig = async () => Boolean(await getApiConfig());

const callChatCompletion = async (apiConfig, systemPrompt, userHint, maxTokens, signal) => {
  const baseUrl = apiConfig.baseUrl.replace(/\/$/, '');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: apiConfig.model || 'gpt-3.5-turbo',
      temperature: 0.9,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userHint },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content || '').trim();
};

const buildPrompt = ({ stage, topic, classmate }) => {
  const isKindergarten = stage === 'kindergarten';
  const who = classmate
    ? `你是班里的小${classmate.species || '朋友'}“${classmate.name}”，性格：${classmate.trait || '活泼可爱'}。`
    : '你是班里的一个小朋友。';
  const levelText = isKindergarten
    ? '你是幼儿园小朋友（3 到 6 岁），写一篇很短的小短文：3 到 4 句话，一共 30 到 60 个字，只用最简单的词和很短的句子。'
    : '你是小学低年级小朋友（6 到 9 岁），写一篇小作文：一小段话，一共 70 到 120 个字，用小朋友的口吻，可以有一点小细节，偶尔有一点点稚气的用词也没关系。';
  const hint = topic.stages?.[isKindergarten ? 'kindergarten' : 'primary']?.hint || '';

  return `${who}
老师布置了一篇作文，题目是《${topic.title}》。${hint}
${levelText}

要求：
1. 用第一人称“我”来写，内容要真实、具体、像小朋友写的，不要像大人。
2. 只写正文，不要写题目，不要写自己的名字，不要写“老师”之类的称呼。
3. 写成一段话，不要分点，不要使用 markdown。
4. 不要使用任何表情符号和颜文字。

严格按下面的 JSON 格式输出，只输出这一个 JSON 对象本身，不要加任何别的文字，不要用 markdown 代码块包裹：
{"text":"正文"}`;
};

/** 清理 AI 返回的正文：去 emoji、去首尾引号、折成一段。 */
const cleanText = (raw) => String(raw || '')
  .replace(EMOJI_RE, '')
  .replace(/\s*\n+\s*/g, ' ')
  .replace(/^[“"'‘]+|[”"'’]+$/g, '')
  .trim();

/**
 * 让 AI 写一篇。任何一步不对都返回 { ok: false }（没配置 API 时多带 noConfig）。
 * @returns {Promise<{ ok: boolean, text?: string, noConfig?: boolean }>}
 */
const generateEssayText = async ({ stage, topic, classmate }) => {
  let timer = null;
  try {
    const apiConfig = await getApiConfig();
    if (!apiConfig) return { ok: false, noConfig: true };

    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), HOMEWORK_AI_TIMEOUT_MS);

    const raw = await callChatCompletion(
      apiConfig,
      buildPrompt({ stage, topic, classmate }),
      '（只输出 JSON 对象，不要别的）',
      500,
      controller.signal,
    );

    let text = '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        text = cleanText(JSON.parse(match[0])?.text);
      } catch {
        text = '';
      }
    }
    if (!text) return { ok: false };

    const range = HOMEWORK_ESSAY_LENGTH[stage === 'kindergarten' ? 'kindergarten' : 'primary'];
    if (text.length < range.min || text.length > range.max) return { ok: false };

    return { ok: true, text };
  } catch (error) {
    console.warn('[homework essay] AI essay failed:', error?.message || error);
    return { ok: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * 让同学现写一篇小作文。永远不抛错。
 *
 * @param {{
 *   stage: string,            // 学段，决定写多长、多简单
 *   classmate?: object,       // 写作文的同学（名册里的一项）
 *   avoidTopicId?: string,    // 不要再写这个题目（换一篇时避开当前这篇）
 *   rng?: function,
 * }} args
 * @returns {Promise<{
 *   status: 'ok' | 'noconfig' | 'failed',
 *   essay?: { topicId: string, title: string, text: string, source: 'ai' },
 * }>}
 */
export const writeEssay = async ({ stage, classmate = null, avoidTopicId = null, rng = Math.random } = {}) => {
  const topic = pickEssayTopic(rng, avoidTopicId);
  const result = await generateEssayText({ stage, topic, classmate });
  if (result.ok) {
    return {
      status: 'ok',
      essay: { topicId: topic.id, title: topic.title, text: result.text, source: 'ai' },
    };
  }
  return { status: result.noConfig ? 'noconfig' : 'failed' };
};