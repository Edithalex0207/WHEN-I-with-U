// src/apps/margin-notes/library/txtParser.js
//
// txt 解析：先猜编码（UTF-8 优先，失败再按 GB18030 读，覆盖常见的中文老 txt），
// 再按章节标题切章。认不出章节标题就整本当一章。
// 产出格式和 epubParser 一致：{ title, author, chapters: [{ title, text }] }

const MAX_HEADING_LENGTH = 40;

// 「第十二章 xxx」「第3回」之类
const CN_CHAPTER = /^第[零〇一二两三四五六七八九十百千万\d]+[章节回卷集部篇]/;
// 单独成行的「序章」「楔子」「番外 xxx」之类
const CN_SPECIAL =
  /^(序章|序言|序|楔子|引子|前言|后记|尾声|终章|番外.{0,20}|附录.{0,20})$/;
// 「Chapter 12」「CHAPTER IV: xxx」
const EN_CHAPTER = /^chapter\s+([0-9]+|[ivxlc]+)\b.{0,40}$/i;

export const isChapterHeading = (line) => {
  const text = String(line || '').trim();
  if (!text || text.length > MAX_HEADING_LENGTH) return false;
  return CN_CHAPTER.test(text) || CN_SPECIAL.test(text) || EN_CHAPTER.test(text);
};

/**
 * 把二进制按合适的编码读成字符串。
 * 先试严格的 UTF-8（带 BOM 也行），不是合法 UTF-8 就按 GB18030 读。
 */
export const decodeTextBytes = (bytes) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(view);
    return text.replace(/^﻿/, '');
  } catch (error) {
    // 不是合法的 UTF-8，往下试 GB18030
  }

  try {
    return new TextDecoder('gb18030').decode(view);
  } catch (error) {
    return new TextDecoder('utf-8').decode(view).replace(/^﻿/, '');
  }
};

/**
 * 去掉每行首尾空白，丢掉空行，用空行分隔段落（和 epub 章节的文本格式一致）。
 */
const normalizeBody = (lines) =>
  lines
    .map((line) => line.replace(/[ \t 　]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');

/**
 * 解析 txt 文本。fallbackTitle 是书名（一般取文件名），整本当一章时也用它做章节标题。
 */
export const parseTxtText = (rawText, fallbackTitle = '未命名') => {
  const lines = String(rawText || '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  const sections = [];
  let current = { title: '', lines: [] };

  for (const line of lines) {
    if (isChapterHeading(line)) {
      sections.push(current);
      current = { title: line.trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);

  // 第一个标题之前的内容（简介、版权页之类）叫「开篇」；正文是空的章节
  // （比如开头的目录页把每个章节标题都列了一遍）直接丢掉。
  const chapters = sections
    .map((section, index) => ({
      title: section.title || (index === 0 ? '开篇' : ''),
      text: normalizeBody(section.lines),
    }))
    .filter((chapter) => chapter.text);

  const hasRealHeadings = sections.filter((section) => section.title).length >= 2;

  if (!hasRealHeadings || chapters.length < 2) {
    const wholeText = normalizeBody(lines);
    if (!wholeText) {
      throw new Error('这个 txt 里没有读到文字内容。');
    }
    return {
      title: fallbackTitle,
      author: '',
      chapters: [{ title: fallbackTitle, text: wholeText }],
    };
  }

  return { title: fallbackTitle, author: '', chapters };
};