// src/apps/fiction/fictionWorldBook.js
//
// 互动文游的世界书注入（第 5B 轮，纯函数，不碰数据库）。
//
// 条目来源有两处，结构一样：{ id, keywords[], content, enabled }
//   1. 全局世界书：聊天里那套 rpWorldBooks，存档上只记 worldBookIds
//   2. 本存档专属条目：save.localEntries
//
// 注入规则：
//   - enabled === false 或没有内容的条目直接跳过
//   - 关键词为空 = 常驻，每一轮都带
//   - 有关键词 = 关键词出现在「扫描文本」里才带（纯文本包含，不分大小写）
//   - 常驻条目优先占名额，剩下的名额才给关键词命中的条目
//   - 总条数、总字数都有上限，防止世界书把提示词撑爆；超出的直接不带
//
// 扫描文本由调用方（fictionAiService.js）拼：玩家这一轮的行动 + 当前路径最近几段正文。

export const WORLD_BOOK_MAX_ENTRIES = 15;
export const WORLD_BOOK_MAX_CHARS = 6000;
// 往回看几段正文来匹配关键词
export const WORLD_BOOK_SCAN_SEGMENTS = 3;

const str = (value) => String(value ?? '').trim();

const keywordsOf = (entry) => (
  Array.isArray(entry?.keywords) ? entry.keywords.map(str).filter(Boolean) : []
);

/**
 * 从条目里挑出这一轮要带的。
 *
 * @param entries   [{ id, keywords, content, enabled, origin? }]  顺序即优先级
 * @param scanText  用来匹配关键词的文本
 * @returns { picked, always, byKeyword, skippedByLimit }
 */
export const matchWorldBookEntries = (entries, scanText, {
  maxEntries = WORLD_BOOK_MAX_ENTRIES,
  maxChars = WORLD_BOOK_MAX_CHARS,
} = {}) => {
  const list = Array.isArray(entries) ? entries : [];
  const haystack = str(scanText).toLowerCase();
  const alwaysOn = [];
  const triggered = [];

  list.forEach((entry) => {
    if (!entry || entry.enabled === false || !str(entry.content)) return;

    const keywords = keywordsOf(entry);

    if (keywords.length === 0) {
      alwaysOn.push(entry);
    } else if (haystack && keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      triggered.push(entry);
    }
  });

  const picked = [];
  let chars = 0;
  let skippedByLimit = 0;

  [...alwaysOn, ...triggered].forEach((entry) => {
    const size = str(entry.content).length;

    if (picked.length >= maxEntries || chars + size > maxChars) {
      skippedByLimit += 1;
      return;
    }

    picked.push(entry);
    chars += size;
  });

  return {
    picked,
    always: picked.filter((entry) => keywordsOf(entry).length === 0).length,
    byKeyword: picked.filter((entry) => keywordsOf(entry).length > 0).length,
    skippedByLimit,
    chars,
  };
};

// 把挑出来的条目拼成一段可以放进 system prompt 的文本；没有就返回空串。
export const renderWorldBookBlock = (picked) => {
  const list = Array.isArray(picked) ? picked : [];

  if (list.length === 0) return '';

  return [
    '## 世界书（相关设定，请在剧情中保持一致）',
    list.map((entry) => `- ${str(entry.content)}`).join('\n'),
  ].join('\n');
};

/**
 * 扫描文本 = 玩家这一轮的行动文字 + 当前路径最近几段的正文。
 * 行动文字也要扫：玩家在自由输入里提到的人名/地名，应该能立刻触发对应条目。
 */
export const buildWorldBookScanText = (pathNodes, action) => {
  const nodes = Array.isArray(pathNodes) ? pathNodes : [];
  const recent = nodes.slice(-WORLD_BOOK_SCAN_SEGMENTS).map((node) => str(node.text));

  return [str(action?.text), ...recent].filter(Boolean).join('\n');
};

export default {
  WORLD_BOOK_MAX_ENTRIES,
  WORLD_BOOK_MAX_CHARS,
  WORLD_BOOK_SCAN_SEGMENTS,
  matchWorldBookEntries,
  renderWorldBookBlock,
  buildWorldBookScanText,
};