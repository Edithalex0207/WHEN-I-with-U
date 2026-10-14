// src/apps/margin-notes/library/readerLibraryService.js
//
// 页边注「我的藏书」的存取。一本书拆成两张表存（见 src/db/index.js 的 db.version(86)）：
//   - readerBooks：书的信息，体积小，藏书页列表、统计都只读它。
//   - readerBookFiles：书的正文（解析后的章节文本），体积大，只在打开阅读时按 bookId 读。
//
// readerBooks 记录字段：
//   title / author     书名、作者（作者可能为空字符串）
//   format             'epub' | 'txt'
//   chatId             绑定的聊天室 id，null 表示还没绑（一本书最多绑一个聊天室）
//   toc                [{ index, title }]，章节目录，下标就是章节序号
//   chapterCount       章节数
//   charCount          全书字数（按字符数估算）
//   cover              缩小后的封面 data URL，没有封面图时为空字符串
//   preview            开卷预览：第一章开头的一小段文字（封面翻开时露出来的那页）
//   fileBytes         正文占用字节数（估算），清理文件后为 0
//   hasFile            正文是否还在 readerBookFiles 里
//   progress           阅读进度 0-100（整数），本切片还没有阅读器，固定 0
//   lastChapterIndex   上次读到第几章（从 0 开始），本切片固定 0
//   lastReadAt         最近阅读时间（ISO 字符串），没读过为 ''
//   createdAt / updatedAt   ISO 字符串

import db from '../../../db';

const nowIso = () => new Date().toISOString();

/**
 * 估算一组章节文本占用的字节数。中文按 3 字节、其余按 1 字节粗算，
 * 只用来给界面显示「共 X MB」，不需要精确。
 */
export const estimateChaptersBytes = (chapters) => {
  let bytes = 0;
  for (const chapter of chapters || []) {
    const text = `${chapter?.title || ''}${chapter?.text || ''}`;
    for (let i = 0; i < text.length; i += 1) {
      bytes += text.charCodeAt(i) > 0x7f ? 3 : 1;
    }
  }
  return bytes;
};

/**
 * 保存一本新书。信息和正文在同一个事务里写，要么都成功要么都不留。
 * meta：{ title, author, format, cover, chatId }
 * chapters：[{ title, text }]
 */
export const addBook = async ({ meta, chapters }) => {
  const safeChapters = Array.isArray(chapters) ? chapters : [];
  const timestamp = nowIso();

  const record = {
    title: String(meta?.title || '').trim() || '未命名',
    author: String(meta?.author || '').trim(),
    format: meta?.format === 'epub' ? 'epub' : 'txt',
    chatId: meta?.chatId ?? null,
    toc: safeChapters.map((chapter, index) => ({
      index,
      title: String(chapter?.title || '').trim() || `第 ${index + 1} 部分`,
    })),
    chapterCount: safeChapters.length,
    charCount: safeChapters.reduce(
      (sum, chapter) => sum + String(chapter?.text || '').length,
      0
    ),
    cover: meta?.cover || '',
    preview: String(safeChapters[0]?.text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 70),
    fileBytes: estimateChaptersBytes(safeChapters),
    hasFile: true,
    progress: 0,
    lastChapterIndex: 0,
    lastReadAt: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const id = await db.transaction(
    'rw',
    db.readerBooks,
    db.readerBookFiles,
    async () => {
      const bookId = await db.readerBooks.add(record);
      await db.readerBookFiles.put({
        bookId,
        chapters: safeChapters.map((chapter, index) => ({
          title: record.toc[index].title,
          text: String(chapter?.text || ''),
        })),
      });
      return bookId;
    }
  );

  return { ...record, id };
};

/**
 * 全部藏书，最近添加的在前。
 */
export const getAllBooks = async () => {
  const list = await db.readerBooks.toArray();
  return list.sort((a, b) => {
    const left = a.lastReadAt || a.createdAt || '';
    const right = b.lastReadAt || b.createdAt || '';
    return right.localeCompare(left);
  });
};

export const getBook = async (bookId) => {
  if (!bookId) return null;
  return (await db.readerBooks.get(bookId)) || null;
};

/**
 * 按 bookId 读书的正文章节。正文被清理过（或备份恢复后不在了）返回 null。
 */
export const getBookContent = async (bookId) => {
  if (!bookId) return null;

  try {
    const row = await db.readerBookFiles.get(bookId);
    return row?.chapters || null;
  } catch (error) {
    console.warn('[藏书] 读取正文失败：', error);
    return null;
  }
};

/**
 * 换绑聊天室。chatId 传 null 表示解除绑定。
 */
export const updateBookChat = async (bookId, chatId) => {
  if (!bookId) return;
  await db.readerBooks.update(bookId, {
    chatId: chatId ?? null,
    updatedAt: nowIso(),
  });
};

/**
 * 清理这本书的正文文件，书的信息（以及以后切片会加的批注、留言）保留。
 */
export const clearBookFile = async (bookId) => {
  if (!bookId) return;

  await db.transaction(
    'rw',
    db.readerBooks,
    db.readerBookFiles,
    async () => {
      await db.readerBookFiles.delete(bookId);
      await db.readerBooks.update(bookId, {
        hasFile: false,
        fileBytes: 0,
        updatedAt: nowIso(),
      });
    }
  );
};

/**
 * 彻底删除一本书（信息和正文都删）。
 */
export const deleteBook = async (bookId) => {
  if (!bookId) return;

  await db.transaction(
    'rw',
    db.readerBooks,
    db.readerBookFiles,
    async () => {
      await db.readerBookFiles.delete(bookId);
      await db.readerBooks.delete(bookId);
    }
  );
};

/**
 * 藏书统计：本数和正文总字节数。用 each 逐条遍历，不把整张表读进内存。
 */
export const getLibraryStats = async () => {
  const stats = { count: 0, fileBytes: 0 };

  try {
    await db.readerBooks.each((book) => {
      stats.count += 1;
      stats.fileBytes += Number(book.fileBytes) || 0;
    });
  } catch (error) {
    console.warn('[藏书] 统计失败：', error);
  }

  return stats;
};

/**
 * 把字节数显示成「X.X MB / X KB」。
 */
export const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${value} B`;
};