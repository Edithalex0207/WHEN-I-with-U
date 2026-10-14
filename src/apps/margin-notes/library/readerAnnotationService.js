// src/apps/margin-notes/library/readerAnnotationService.js
//
// 划线和批注的读写（表 readerAnnotations，见 db.version(88)）。
// 每一条记的是「这本书第几章、第几段、第几个字到第几个字」，加颜色、
// 批注内容（可以是空字符串，表示只划线不写想法）、要不要/有没有发到聊天室。
//
// 位置用段落序号 + 段内字符偏移记，不用全局字符偏移 —— 每段的文字是
// 解析时就定下来的，不会像阅读设置那样跟着字号变。

import db from '../../../db';
import { normalizeHighlightColor } from './readerTheme';

/**
 * 新建一条划线/批注。
 * 返回新记录的 id。
 */
export const addAnnotation = async ({
  bookId,
  chapterIndex,
  chapterTitle,
  paragraphIndex,
  start,
  end,
  text,
  color,
  note = '',
}) => {
  const now = new Date().toISOString();
  const row = {
    bookId,
    chapterIndex: Math.max(0, chapterIndex || 0),
    chapterTitle: chapterTitle || '',
    paragraphIndex: Math.max(0, paragraphIndex || 0),
    start: Math.max(0, start || 0),
    end: Math.max(0, end || 0),
    text: String(text || ''),
    color: normalizeHighlightColor(color),
    note: String(note || ''),
    sentToChat: false,
    messageId: null,
    createdAt: now,
    updatedAt: now,
  };
  const id = await db.readerAnnotations.add(row);
  return { ...row, id };
};

/**
 * 改一条已有的划线/批注（颜色、想法）。
 */
export const updateAnnotation = async (id, patch) => {
  if (!id) return;
  const next = { updatedAt: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(patch, 'color')) {
    next.color = normalizeHighlightColor(patch.color);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'note')) {
    next.note = String(patch.note || '');
  }
  await db.readerAnnotations.update(id, next);
};

export const deleteAnnotation = async (id) => {
  if (!id) return;
  await db.readerAnnotations.delete(id);
};

export const getAnnotation = async (id) => {
  if (!id) return null;
  return (await db.readerAnnotations.get(id)) || null;
};

/**
 * 某一章里的全部划线/批注，按段落、段内起点排好序，方便渲染。
 */
export const getChapterAnnotations = async (bookId, chapterIndex) => {
  if (!bookId) return [];
  try {
    const rows = await db.readerAnnotations
      .where('[bookId+chapterIndex]')
      .equals([bookId, chapterIndex])
      .toArray();
    rows.sort((a, b) => a.paragraphIndex - b.paragraphIndex || a.start - b.start);
    return rows;
  } catch (error) {
    console.warn('[藏书] 读取本章批注失败：', error);
    return [];
  }
};

/**
 * 「本书批注」列表用：这本书全部的划线/批注，按章节、段落顺序排好。
 */
export const getBookAnnotations = async (bookId) => {
  if (!bookId) return [];
  try {
    const rows = await db.readerAnnotations.where('bookId').equals(bookId).toArray();
    rows.sort(
      (a, b) =>
        a.chapterIndex - b.chapterIndex ||
        a.paragraphIndex - b.paragraphIndex ||
        a.start - b.start
    );
    return rows;
  } catch (error) {
    console.warn('[藏书] 读取本书批注失败：', error);
    return [];
  }
};

/**
 * 把一条划线/批注发到它所属的书绑定的聊天室，变成一条
 * type: 'margin_note' 的普通消息（跟和好券同一套做法：真正写进
 * db.messages，聊天记录里能看到，不是一张只有本地状态的假卡片）。
 * 发送成功后把这条记录标成 sentToChat，并记下 messageId。
 */
export const sendAnnotationToChat = async ({ annotation, book, percent }) => {
  if (!annotation || !book?.chatId) return null;

  const chat = await db.chats.get(book.chatId);
  if (!chat) return null;

  const content = (annotation.note || annotation.text || '').slice(0, 60);

  const message = {
    chatId: chat.id,
    characterId: chat.characterId,
    sender: 'user',
    type: 'margin_note',
    content,
    metadata: {
      bookId: annotation.bookId,
      bookTitle: book.title || '',
      chapterIndex: annotation.chapterIndex,
      chapterTitle: annotation.chapterTitle || '',
      text: annotation.text,
      note: annotation.note || '',
      color: annotation.color,
      percent: Math.max(0, Math.min(100, Math.round(percent) || 0)),
    },
    isRead: true,
    timestamp: new Date().toISOString(),
  };

  const messageId = await db.messages.add(message);

  await db.readerAnnotations.update(annotation.id, {
    sentToChat: true,
    messageId,
    updatedAt: new Date().toISOString(),
  });

  return messageId;
};