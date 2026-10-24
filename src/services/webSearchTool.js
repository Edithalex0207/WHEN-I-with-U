// src/services/webSearchTool.js
//
// 给角色用的内置工具：联网搜索。
// 跟 savedInfoTool.js 同一个思路——不是 MCP 工具，不走 MCP 审批/连接那一套，
// 只在本地读独立的 db.settings.webSearchApiConfig（跟主 API / 备用 API 完全
// 分开的第三份 OpenAI 兼容配置），直接 fetch 那个 endpoint 的
// /chat/completions。跟 savedInfoTool 一样，只会和 MCP 工具一起交给模型
// （见 aiToolOrchestrator.js），没配置这个的用户，请求格式完全不变。
//
// 选它用「OpenAI 兼容 chat/completions」而不是接一个真·MCP 搜索服务器，
// 是因为很多本身自带联网能力的模型（Perplexity sonar 这类）本来就是直接
// 用 chat/completions 问一句话、答案里自带当前信息，不需要工具调用循环，
// 配置起来也比接一个 MCP 服务器轻——用户要是有合适的 MCP 搜索服务器，
// 也完全可以改用那条路（这边不冲突，两边可以同时存在）。
//
// 没有设调用次数上限：用户明确说了"先不设限"，跟戳一戳/换气泡这些
// AI 自主决定的行为保持同一个"不限制、相信模型自己判断"的约定
// （见 bubbleStyleDirective.js 顶部注释里提到的同一套惯例）。

import db from '../db';

export const WEB_SEARCH_TOOL_NAME = 'web_search';

// 回复正文里最多保留多少字当作这次搜索的"摘要"给卡片展示（不影响喂给
// 模型自己转述用的完整文本，只影响卡片上直接看到的那一小段）。
const CARD_SUMMARY_MAX_LENGTH = 220;

// 从搜索结果文本里最多抓几个「来源链接」放进卡片（有的 search 模型会在
// 回答里自带 markdown 链接，没有就不展示来源区块，不是必须项）。
const MAX_SOURCES_IN_CARD = 4;

export const WEB_SEARCH_PROMPT_RULE = `
【可选行为：联网搜索】
你可以使用工具 ${WEB_SEARCH_TOOL_NAME} 查一下现在的、你自己知识范围之外的信息（比如最近的评分、今天的新闻、现在的价格之类）。
自己判断要不要查，不用先问用户同不同意，也不用担心查得太频繁。
查到结果后，用你自己的语气自然地转述给用户，不要生硬地照搬原文，也不要逐条念链接。
查不到或者这次用不上，就不要勉强调用。
`;

/**
 * 生成工具定义。没有配置联网搜索的 API（缺 baseUrl 或 apiKey）时返回
 * null（此时不添加工具，也不加提示词，跟没有这个功能时完全一样）。
 */
export const buildWebSearchToolDefinition = async () => {
  try {
    const setting = await db.settings.get('webSearchApiConfig');
    const config = setting?.value || {};

    if (!config.baseUrl || !config.apiKey) {
      return null;
    }

    return {
      type: 'function',
      function: {
        name: WEB_SEARCH_TOOL_NAME,
        description:
          '联网搜索，获取当下的、实时的信息（新闻、评分、价格、天气之外的其它现状类问题等）。只在确实需要现在的信息时调用。',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '要搜索的内容，用自然语言描述清楚，例如"某电影 烂番茄 新鲜度"。',
            },
          },
          required: ['query'],
        },
      },
    };
  } catch (error) {
    // 读取配置失败不能阻断正常对话。
    console.warn('[WebSearch] 无法生成联网搜索工具：', error);
    return null;
  }
};

const parseQuery = (rawArguments) => {
  if (rawArguments === undefined || rawArguments === null) {
    return '';
  }

  let parsed = rawArguments;

  if (typeof rawArguments === 'string') {
    const text = rawArguments.trim();

    if (!text) {
      return '';
    }

    try {
      parsed = JSON.parse(text);
    } catch {
      // 模型偶尔会直接把查询词当成裸字符串传过来，不是合法 JSON 时
      // 就把原始文本本身当作查询词，而不是直接判定失败。
      return text;
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return '';
  }

  return String(parsed.query ?? '').trim();
};

// 从搜索结果文本里抓 markdown 链接 [标题](URL)，抓不到就返回空数组——
// 卡片据此决定要不要展示"来源"区块，不强求每个 search API 都带链接。
const extractSources = (text) => {
  const pattern = /\[([^\]]{1,80})\]\((https?:\/\/[^\s)]+)\)/g;
  const sources = [];
  let match;

  while ((match = pattern.exec(text)) && sources.length < MAX_SOURCES_IN_CARD) {
    const title = match[1].trim();
    const url = match[2].trim();

    if (url && !sources.some((item) => item.url === url)) {
      sources.push({ title: title || url, url });
    }
  }

  return sources;
};

const buildCardSummary = (text) => {
  const plain = String(text || '')
    .replace(/\[([^\]]{1,80})\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return plain.length > CARD_SUMMARY_MAX_LENGTH
    ? `${plain.slice(0, CARD_SUMMARY_MAX_LENGTH)}…`
    : plain;
};

/**
 * 真正发起一次联网搜索调用，返回：
 * - toolContent：喂回给模型自己组织语言用的工具结果文本（JSON 字符串）；
 * - card：给聊天气泡下面展示的搜索过程卡片数据（kind: 'web_search'），
 *   失败时为 null（不展示卡片，只在气泡里让角色自然带一句"没查到"）。
 */
export const runWebSearchCall = async (rawArguments) => {
  const query = parseQuery(rawArguments);

  if (!query) {
    return {
      toolContent: JSON.stringify({
        isError: true,
        error: 'WEB_SEARCH_EMPTY_QUERY',
        message: '没有给出有效的搜索内容。',
      }),
      card: null,
    };
  }

  try {
    const setting = await db.settings.get('webSearchApiConfig');
    const config = setting?.value || {};

    if (!config.baseUrl || !config.apiKey) {
      return {
        toolContent: JSON.stringify({
          isError: true,
          error: 'WEB_SEARCH_NOT_CONFIGURED',
          message: '联网搜索还没有配置好，这次没法查。',
        }),
        card: null,
      };
    }

    const baseUrl = String(config.baseUrl).replace(/\/+$/, '');

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'sonar',
        messages: [
          {
            role: 'system',
            content:
              '你是一个联网搜索助手。请搜索并给出简洁、准确、尽量是当下最新的信息；如果来源明确，用 markdown 链接的形式列出几个最相关的来源。',
          },
          { role: 'user', content: query },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const resultText = String(data?.choices?.[0]?.message?.content || '').trim();

    if (!resultText) {
      return {
        toolContent: JSON.stringify({
          isError: true,
          error: 'WEB_SEARCH_EMPTY_RESULT',
          message: '搜索没有返回可用的内容。',
        }),
        card: null,
      };
    }

    const sources = extractSources(resultText);

    return {
      toolContent: JSON.stringify({
        found: true,
        query,
        result: resultText,
      }),
      card: {
        kind: 'web_search',
        query,
        summary: buildCardSummary(resultText),
        sources,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.warn('[WebSearch] 搜索失败：', error);

    return {
      toolContent: JSON.stringify({
        isError: true,
        error: 'WEB_SEARCH_FAILED',
        message: `联网搜索失败：${error?.message || '未知错误'}`,
      }),
      card: null,
    };
  }
};

export default {
  WEB_SEARCH_TOOL_NAME,
  WEB_SEARCH_PROMPT_RULE,
  buildWebSearchToolDefinition,
  runWebSearchCall,
};