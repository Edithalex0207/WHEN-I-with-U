// src/apps/margin-notes/library/readerSummaryService.js
//
// 退出阅读时的「阅读摘要」卡片。同一本书在聊天室里只保留一张——发新的
// 默认是「更新上次的卡片」（直接改那条消息的内容），而不是每次退出都
// 多一条。书是否已经有过摘要卡片、是哪一条，记在 readerBooks 的
// summaryMessageId 字段上（跟 lastChapterOffset 一样，直接加的新字段，
// 不需要为此升级 db 版本）。

import db from '../../../db';

/**
 * 把这次阅读的统计发到书绑定的聊天室。
 * mode: 'update' 更新上次那张卡片（book.summaryMessageId 指向的那条消息，
 *       如果那条消息已经不在了就退化成新发一条）；'new' 总是新发一条。
 * 发送/更新成功后，把最新的 messageId 记回 readerBooks.summaryMessageId。
 */
export const sendReadingSummary = async ({ book, stats, recap, mode = 'update' }) => {
  if (!book?.chatId) return null;

  const chat = await db.chats.get(book.chatId);
  if (!chat) return null;

  const metadata = {
    bookId: book.id,
    bookTitle: book.title || '',
    chapterTitle: stats.chapterTitle || '',
    minutes: Math.max(0, Math.round(stats.minutes) || 0),
    chaptersRead: Math.max(0, stats.chaptersRead || 0),
    newAnnotations: Math.max(0, stats.newAnnotations || 0),
    newComments: Math.max(0, stats.newComments || 0),
    percent: Math.max(0, Math.min(100, Math.round(stats.percent) || 0)),
    recap: recap || '',
    updatedAt: new Date().toISOString(),
  };

  const content = recap || `阅读摘要 · ${metadata.minutes} 分钟`;

  if (mode === 'update' && book.summaryMessageId) {
    const existing = await db.messages.get(book.summaryMessageId);
    if (existing && existing.type === 'reading_summary') {
      await db.messages.update(existing.id, {
        content,
        metadata,
        timestamp: new Date().toISOString(),
      });
      return existing.id;
    }
  }

  const messageId = await db.messages.add({
    chatId: chat.id,
    characterId: chat.characterId,
    sender: 'user',
    type: 'reading_summary',
    content,
    metadata,
    isRead: true,
    timestamp: new Date().toISOString(),
  });

  await db.readerBooks.update(book.id, { summaryMessageId: messageId });
  return messageId;
};