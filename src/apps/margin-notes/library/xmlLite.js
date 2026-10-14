// src/apps/margin-notes/library/xmlLite.js
//
// 解析 epub 用的几个小工具。故意不用 DOMParser：
//   1. epub 里的章节是 XHTML，严格按 XML 解析时遇到 &nbsp; 这类实体会整篇报错；
//   2. 不依赖浏览器 DOM，这样同一份代码在沙箱里也能直接跑测试。
// 只处理 epub 里会用到的那一小部分（容器、OPF、目录、章节正文），不是通用解析器。

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  middot: '·',
  copy: '©',
  times: '×',
};

/**
 * 解码实体：&amp; 这类命名实体（常见的几个）和 &#123; / &#x1F; 数字实体。
 */
export const decodeEntities = (text) =>
  String(text || '').replace(
    /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g,
    (whole, body) => {
      if (body[0] === '#') {
        const code =
          body[1] === 'x' || body[1] === 'X'
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
          try {
            return String.fromCodePoint(code);
          } catch (error) {
            return '';
          }
        }
        return '';
      }
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)
        ? NAMED_ENTITIES[body]
        : whole;
    }
  );

/**
 * 去掉标签名里的命名空间前缀：dc:title -> title。
 */
const stripPrefix = (name) => String(name || '').replace(/^[A-Za-z0-9_-]+:/, '');

/**
 * 解析一个起始标签字符串里的属性，属性名统一去掉命名空间前缀并转小写。
 * 例：'<item id="a" href="b.xhtml" media-type="x"/>' -> { id, href, 'media-type' }
 */
export const parseAttributes = (tagText) => {
  const attrs = {};
  const body = String(tagText || '').replace(/^<\s*[^\s/>]+/, '');
  const pattern = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match = pattern.exec(body);
  while (match) {
    const name = stripPrefix(match[1]).toLowerCase();
    const value = match[3] !== undefined ? match[3] : match[4];
    attrs[name] = decodeEntities(value);
    match = pattern.exec(body);
  }
  return attrs;
};

/**
 * 找出所有叫 tagName 的标签（忽略命名空间前缀和大小写），
 * 返回 [{ attrs, inner, raw }]；自闭合标签的 inner 为空字符串。
 */
export const findElements = (xml, tagName) => {
  const results = [];
  const source = String(xml || '');
  const name = String(tagName).toLowerCase();
  const openPattern = /<\s*([A-Za-z0-9_:-]+)([^>]*)>/g;
  let match = openPattern.exec(source);

  while (match) {
    const fullName = match[1];
    if (stripPrefix(fullName).toLowerCase() === name) {
      const startTag = match[0];
      const selfClosing = /\/\s*>$/.test(startTag);
      let inner = '';
      let raw = startTag;

      if (!selfClosing) {
        const closePattern = new RegExp(
          `</\\s*${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*>`,
          'ig'
        );
        closePattern.lastIndex = openPattern.lastIndex;
        const closeMatch = closePattern.exec(source);
        if (closeMatch) {
          inner = source.slice(openPattern.lastIndex, closeMatch.index);
          raw = source.slice(match.index, closePattern.lastIndex);
        }
      }

      results.push({ attrs: parseAttributes(startTag), inner, raw });
    }
    match = openPattern.exec(source);
  }

  return results;
};

/**
 * 把一段标签内部内容变成纯文本（去掉里面所有标签、解码实体、压缩空白）。
 */
export const textOf = (inner) =>
  decodeEntities(String(inner || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 把 XHTML 章节转成纯文本，段落之间用空行分隔。
 * 返回 { title, text }：title 是文件里第一个 h1-h3 的文字（没有则为空字符串），
 * text 里如果第一段就是这个标题，会去掉，避免和章节标题重复。
 */
export const htmlToChapter = (html) => {
  let source = String(html || '');

  const bodyMatch = source.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) source = bodyMatch[1];

  source = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<rt[\s\S]*?<\/rt>/gi, '')
    .replace(/<rp[\s\S]*?<\/rp>/gi, '');

  let heading = '';
  const headingMatch = source.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (headingMatch) heading = textOf(headingMatch[1]);

  const withBreaks = source
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article|pre)\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '');

  const paragraphs = decodeEntities(withBreaks)
    .split(/\n\s*\n/)
    .map((part) =>
      part
        .split('\n')
        .map((line) => line.replace(/[ \t 　]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
    )
    .filter(Boolean);

  if (heading && paragraphs.length && paragraphs[0] === heading) {
    paragraphs.shift();
  }

  return { title: heading, text: paragraphs.join('\n\n') };
};