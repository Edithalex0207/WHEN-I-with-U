/*
 * companionSchoolRecessGuessAiService.js —— 「猜词」玩法唯一调用 AI 的地方。
 *
 * 写法照抄同目录下 companionSchoolQuizAiService.js：直接 fetch 聊天补全
 * 接口，用 db.settings.get('apiConfig')，不走 triggerAiResponse，不写
 * db.messages。但这里不带角色人设（buildChatSystemPrompt）——出题的是
 * "班里的同学"，只需要一个普通文本模型。
 *
 * 【失败怎么办（已确认：用固定词库兜底）】
 * 没配置 API、请求超时、返回的格式不对、答案在最近出过的词里、线索把答案
 * 泄露了……任何一种情况，prepareGuessPuzzle 都会退回
 * companionSchoolRecessGuessRules.js 里的兜底词库，所以它永远能返回一道
 * 可玩的题，不会让玩家看到"AI 失败"。
 *
 * 【防重复】
 * 最近出过的词存在 db.settings 的一行里（RECENT_KEY，最多 RECENT_MAX 个），
 * 出题时放进提示词让 AI 避开；AI 还是出了一个撞车的词，就当失败走兜底。
 * 兜底词库同样会避开这些词。词在题目生成时就记下，中途放弃的也算出过。
 *
 * 输出里不要 emoji：提示词里明说，返回之后还会再过滤一遍。
 */

import db from '../../../db';
import { getSchoolRecord } from './companionSchoolService';
import {
  normalizeGuess,
  sanitizePuzzle,
  pickFallbackPuzzle,
} from './companionSchoolRecessGuessRules';

const RECENT_KEY = 'companionSchoolRecessGuessRecent';
const RECENT_MAX = 12;
const AI_TIMEOUT_MS = 10000;

const getApiConfig = async () => {
  const apiSettings = await db.settings.get('apiConfig');
  const apiConfig = apiSettings?.value || {};
  if (!apiConfig.baseUrl || !apiConfig.apiKey) return null;
  return apiConfig;
};

/** 有没有配置 AI 接口（给调试和以后的提示用）。 */
export const hasApiConfig = async () => Boolean(await getApiConfig());

/* ---------------- 最近出过的词 ---------------- */

const readRecentWords = async () => {
  try {
    const row = await db.settings.get(RECENT_KEY);
    const list = Array.isArray(row?.value) ? row.value : [];
    return list.filter((w) => typeof w === 'string' && w).slice(0, RECENT_MAX);
  } catch {
    return [];
  }
};

const rememberWord = async (word, recentWords) => {
  try {
    const next = [word, ...recentWords.filter((w) => normalizeGuess(w) !== normalizeGuess(word))]
      .slice(0, RECENT_MAX);
    await db.settings.put({ key: RECENT_KEY, value: next });
  } catch {
    // 记不下来不影响玩，最多下次可能重复
  }
};

/* ---------------- AI 调用 ---------------- */

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

const buildPrompt = ({ stage, recentWords }) => {
  const stageText = stage === 'kindergarten'
    ? '幼儿园小朋友（3 到 6 岁）。词要选他们每天都能见到的东西，比如水果、小动物、食物、玩具、天气、身体、家里的东西；线索用最简单、最短的话。'
    : '小学低年级小朋友（6 到 9 岁）。词要选他们熟悉的东西，比如水果、动物、文具、天气、食物、交通工具、植物、学校里的东西；线索用小朋友能听懂的话。';
  const avoidText = recentWords.length
    ? `\n最近已经出过这些词，这次一定不要再出：${recentWords.join('、')}。`
    : '';

  return `你是课间猜词游戏的出题人。班里的一个小朋友想好了一个词，要让另一个小朋友猜，线索一条一条放出来。
猜的人是${stageText}
请你先想好一个词（答案），再根据答案写 3 条线索，由模糊到清楚：第 1 条只说大概的类别或特点，很多东西都能对上；第 2 条更具体一些；第 3 条非常清楚，认真想就能猜到。${avoidText}

要求：
1. 答案是一个常见的词，不超过 6 个字，不要用英文、专有名词、人名。
2. aliases 是同一个东西的其他常见说法（比如答案是"西瓜"，可以写"大西瓜"），可以是空数组，最多 4 个。
3. 每条线索一句话，不超过 36 个字，口吻像小朋友之间说话。
4. 任何一条线索里都不能直接出现答案或 aliases 里的词。
5. 不要使用任何表情符号和颜文字。

严格按下面的 JSON 格式输出，只输出这一个 JSON 对象本身，不要加任何别的文字，不要用 markdown 代码块包裹：
{"answer":"西瓜","aliases":["大西瓜"],"clues":["第1条","第2条","第3条"]}`;
};

/*
 * 让 AI 出一道题。任何一步不对都返回 null（调用方走兜底词库）。
 * @returns {{answer, aliases, clues}|null}
 */
export const generateGuessPuzzle = async ({ stage, recentWords = [] } = {}) => {
  let timer = null;
  try {
    const apiConfig = await getApiConfig();
    if (!apiConfig) return null;

    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    const raw = await callChatCompletion(
      apiConfig,
      buildPrompt({ stage, recentWords }),
      '（只输出 JSON 对象，不要别的）',
      400,
      controller.signal,
    );

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;

    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }

    const puzzle = sanitizePuzzle(parsed);
    if (!puzzle) return null;

    // 撞了最近出过的词，当失败处理，交给兜底词库
    const recent = new Set(recentWords.map(normalizeGuess));
    if (recent.has(normalizeGuess(puzzle.answer))) return null;

    return puzzle;
  } catch (error) {
    console.warn('[recess guess] AI puzzle failed, using fallback:', error?.message || error);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * 玩法组件调这一个：永远返回一道可玩的题。
 *
 * @param {{ companionId?: number|string, rng?: function }} args
 * @returns {Promise<{
 *   puzzle: { answer: string, aliases: string[], clues: string[] },
 *   source: 'ai' | 'fallback',
 * }>}
 */
export const prepareGuessPuzzle = async ({ companionId = null, rng = Math.random } = {}) => {
  let stage = 'primary';
  if (companionId != null) {
    try {
      const record = await getSchoolRecord(companionId);
      if (record?.stage) stage = record.stage;
    } catch {
      // 读不到学段就按小学出
    }
  }

  const recentWords = await readRecentWords();

  const aiPuzzle = await generateGuessPuzzle({ stage, recentWords });
  const puzzle = aiPuzzle || pickFallbackPuzzle({ stage, recentWords, rng });
  const source = aiPuzzle ? 'ai' : 'fallback';

  await rememberWord(puzzle.answer, recentWords);
  return { puzzle, source };
};