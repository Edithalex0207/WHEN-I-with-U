// src/apps/margin-notes/library/readerProgressService.js
//
// 阅读进度。位置用「第几章 + 本章滚动到的比例（0-1）」记，而不是像素，
// 这样改了字号、字体、页边距之后重新排版，也能回到同一段文字附近。
//
// 写进 readerBooks 的字段：
//   lastChapterIndex    读到第几章（从 0 开始）
//   lastChapterOffset   本章内的位置比例 0-1（本切片新增的非索引字段，不用升级表）
//   progress            全书进度 0-100 的整数（按每章字数加权）
//   lastReadAt          最近阅读时间（ISO 字符串）

import db from '../../../db';

/**
 * 全书进度百分比（整数 0-100），按每章字数加权。
 * chapterLengths：每章字数数组；chapterIndex：当前章；fraction：本章内的位置比例。
 */
export const computeProgressPercent = (chapterLengths, chapterIndex, fraction) => {
  const lengths = Array.isArray(chapterLengths) ? chapterLengths : [];
  const total = lengths.reduce((sum, value) => sum + Math.max(0, value || 0), 0);
  if (!total) return 0;

  const index = Math.max(0, Math.min(lengths.length - 1, chapterIndex));
  const ratio = Math.max(0, Math.min(1, Number(fraction) || 0));

  let before = 0;
  for (let i = 0; i < index; i += 1) before += Math.max(0, lengths[i] || 0);

  const done = before + Math.max(0, lengths[index] || 0) * ratio;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
};

/**
 * 保存阅读进度。失败只记警告，不打断阅读。
 */
export const saveReadingProgress = async (
  bookId,
  { chapterIndex, fraction, percent }
) => {
  if (!bookId) return;

  try {
    await db.readerBooks.update(bookId, {
      lastChapterIndex: Math.max(0, chapterIndex || 0),
      lastChapterOffset: Math.max(0, Math.min(1, Number(fraction) || 0)),
      progress: Math.max(0, Math.min(100, Math.round(percent) || 0)),
      lastReadAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[阅读器] 保存阅读进度失败：', error);
  }
};