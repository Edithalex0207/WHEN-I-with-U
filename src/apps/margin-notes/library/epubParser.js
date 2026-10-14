// src/apps/margin-notes/library/epubParser.js
//
// epub 解析的核心逻辑，不直接依赖任何库：
// 传进来的 archive 是个很薄的接口（见下方 parseEpubArchive 的说明），
// 浏览器里由 bookImport.js 用 jszip 包一层，沙箱测试里用普通文件夹包一层。
//
// 产出：{ title, author, chapters: [{ title, text }], cover: { bytes, mime } | null }
// 章节顺序以 OPF 里的 spine 为准；章节标题优先取目录（nav / ncx），
// 取不到就用文件里第一个标题，再取不到就叫「第 N 部分」。
// 本切片只提取文字，章节里的插图、样式一律丢弃。

import {
  decodeEntities,
  findElements,
  htmlToChapter,
  textOf,
} from './xmlLite.js';

/** 路径规范化：解析 ./ 和 ../，去掉开头的 /。 */
const normalizePath = (path) => {
  const parts = [];
  for (const part of String(path || '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
};

const dirOf = (path) => {
  const index = String(path).lastIndexOf('/');
  return index === -1 ? '' : String(path).slice(0, index);
};

const resolveHref = (baseDir, href) => {
  const clean = String(href || '').split('#')[0].split('?')[0];
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch (error) {
    decoded = clean;
  }
  return normalizePath(baseDir ? `${baseDir}/${decoded}` : decoded);
};

/**
 * 读目录，返回 Map：章节文件路径 -> 目录里写的标题（同一个文件多个条目时取第一个）。
 */
const readTocTitles = async (archive, manifest, opfDir) => {
  const titles = new Map();

  const remember = (basePath, href, title) => {
    const clean = String(title || '').replace(/\s+/g, ' ').trim();
    if (!clean || !href) return;
    const path = resolveHref(dirOf(basePath), href);
    if (!titles.has(path)) titles.set(path, clean);
  };

  // EPUB3：nav 文档（manifest 里 properties 含 nav）
  const navItem = manifest.find((item) =>
    String(item.properties || '').split(/\s+/).includes('nav')
  );
  if (navItem) {
    const navPath = resolveHref(opfDir, navItem.href);
    if (await archive.has(navPath)) {
      const navXml = await archive.readText(navPath);
      const tocNav =
        findElements(navXml, 'nav').find((nav) =>
          /toc/i.test(nav.attrs.type || '')
        ) || findElements(navXml, 'nav')[0];
      if (tocNav) {
        for (const anchor of findElements(tocNav.inner, 'a')) {
          remember(navPath, anchor.attrs.href, textOf(anchor.inner));
        }
      }
    }
  }

  // EPUB2：ncx（navLabel 和 content 在文档里按条目成对出现）
  if (!titles.size) {
    const ncxItem = manifest.find(
      (item) => item['media-type'] === 'application/x-dtbncx+xml'
    );
    if (ncxItem) {
      const ncxPath = resolveHref(opfDir, ncxItem.href);
      if (await archive.has(ncxPath)) {
        const ncxXml = await archive.readText(ncxPath);
        const tokenPattern =
          /<\s*(?:[A-Za-z0-9_-]+:)?navLabel[^>]*>([\s\S]*?)<\/\s*(?:[A-Za-z0-9_-]+:)?navLabel\s*>|<\s*(?:[A-Za-z0-9_-]+:)?content\b([^>]*)>/gi;
        let pendingLabel = '';
        let token = tokenPattern.exec(ncxXml);
        while (token) {
          if (token[1] !== undefined) {
            pendingLabel = textOf(token[1]);
          } else if (token[2] !== undefined) {
            const srcMatch = token[2].match(/src\s*=\s*("([^"]*)"|'([^']*)')/i);
            const src = srcMatch ? srcMatch[2] ?? srcMatch[3] : '';
            remember(ncxPath, decodeEntities(src), pendingLabel);
            pendingLabel = '';
          }
          token = tokenPattern.exec(ncxXml);
        }
      }
    }
  }

  return titles;
};

/**
 * 找封面图在压缩包里的路径和类型，找不到返回 null。
 */
const findCoverItem = (manifest, opfXml, opfDir) => {
  // EPUB3：properties 含 cover-image
  let item = manifest.find((entry) =>
    String(entry.properties || '').split(/\s+/).includes('cover-image')
  );

  // EPUB2：<meta name="cover" content="某个 manifest id">
  if (!item) {
    const coverMeta = findElements(opfXml, 'meta').find(
      (meta) => String(meta.attrs.name || '').toLowerCase() === 'cover'
    );
    if (coverMeta?.attrs.content) {
      item = manifest.find((entry) => entry.id === coverMeta.attrs.content);
    }
  }

  if (!item || !/^image\//i.test(item['media-type'] || '')) return null;

  return {
    path: resolveHref(opfDir, item.href),
    mime: item['media-type'],
  };
};

/**
 * 解析一本 epub。
 *
 * archive 需要提供三个异步方法：
 *   has(path) -> boolean            压缩包里有没有这个文件
 *   readText(path) -> string        读文本文件（UTF-8）
 *   readBytes(path) -> Uint8Array   读二进制文件（只用来取封面）
 * path 都是压缩包内部的相对路径，不带开头的斜杠。
 */
export const parseEpubArchive = async (archive) => {
  if (!(await archive.has('META-INF/container.xml'))) {
    throw new Error('这个文件不像是有效的 epub（缺少 container.xml）。');
  }

  const containerXml = await archive.readText('META-INF/container.xml');
  const rootfile = findElements(containerXml, 'rootfile')[0];
  const opfPath = normalizePath(rootfile?.attrs['full-path'] || '');

  if (!opfPath || !(await archive.has(opfPath))) {
    throw new Error('这个 epub 找不到内容清单（OPF），可能已经损坏。');
  }

  const opfXml = await archive.readText(opfPath);
  const opfDir = dirOf(opfPath);

  const manifest = findElements(opfXml, 'item').map((item) => item.attrs);
  const manifestById = new Map(manifest.map((item) => [item.id, item]));

  const title =
    textOf(findElements(opfXml, 'title')[0]?.inner || '') || '';
  const author = findElements(opfXml, 'creator')
    .map((creator) => textOf(creator.inner))
    .filter(Boolean)
    .join('、');

  const spineIds = findElements(opfXml, 'itemref')
    .map((ref) => ref.attrs.idref)
    .filter(Boolean);

  if (!spineIds.length) {
    throw new Error('这个 epub 没有可阅读的章节。');
  }

  const tocTitles = await readTocTitles(archive, manifest, opfDir);

  const chapters = [];
  for (const idref of spineIds) {
    const item = manifestById.get(idref);
    if (!item) continue;

    const mime = String(item['media-type'] || '');
    if (!/xhtml|html/i.test(mime)) continue;

    const path = resolveHref(opfDir, item.href);
    if (!(await archive.has(path))) continue;

    const { title: headingTitle, text } = htmlToChapter(
      await archive.readText(path)
    );
    if (!text.trim()) continue;

    chapters.push({
      title:
        tocTitles.get(path) ||
        headingTitle ||
        `第 ${chapters.length + 1} 部分`,
      text,
    });
  }

  if (!chapters.length) {
    throw new Error('这个 epub 里没有读到文字内容（可能全是图片）。');
  }

  let cover = null;
  const coverItem = findCoverItem(manifest, opfXml, opfDir);
  if (coverItem && (await archive.has(coverItem.path))) {
    try {
      cover = {
        bytes: await archive.readBytes(coverItem.path),
        mime: coverItem.mime,
      };
    } catch (error) {
      cover = null;
    }
  }

  return { title, author, chapters, cover };
};