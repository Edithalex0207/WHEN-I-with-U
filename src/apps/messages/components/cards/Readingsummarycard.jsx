import React from 'react';
import { BookOpen } from 'lucide-react';

// 页边注退出阅读时发来的「阅读摘要」卡片，type: 'reading_summary'。
// 同一本书只保留一张，更新时直接改这条消息的 metadata/timestamp
// （见 readerSummaryService.sendReadingSummary），不会在聊天里越堆越多。
export const ReadingSummaryCard = ({ metadata }) => {
  const bookTitle = metadata?.bookTitle || '';
  const chapterTitle = metadata?.chapterTitle || '';
  const minutes = Math.max(0, Math.round(metadata?.minutes) || 0);
  const chaptersRead = Math.max(0, metadata?.chaptersRead || 0);
  const newAnnotations = Math.max(0, metadata?.newAnnotations || 0);
  const newComments = Math.max(0, metadata?.newComments || 0);
  const percent = Math.max(0, Math.min(100, Math.round(metadata?.percent) || 0));
  const recap = metadata?.recap || '';

  const stats = [
    { value: minutes, label: '分钟' },
    { value: chaptersRead, label: '节' },
    { value: newAnnotations, label: '条批注' },
    { value: newComments, label: '条留言' },
  ];

  return (
    <div className="w-full max-w-[292px] my-2">
      <div
        className="rounded-2xl p-4"
        style={{
          backgroundColor: 'var(--card-bg-soft, #F4F7FA)',
          borderColor: 'var(--card-border, #D6DBE2)',
          borderWidth: '1px',
          borderStyle: 'solid',
          color: 'var(--text-main, #23262B)',
        }}
      >
        <div
          className="flex items-center justify-between text-[11.5px] tracking-wide"
          style={{ color: 'var(--accent-color, #2F4E6F)' }}
        >
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" strokeWidth={1.8} />
            阅读摘要{bookTitle ? ` · 《${bookTitle}》${chapterTitle}` : ''}
          </span>
          <span style={{ color: 'var(--text-muted, #7A7F87)' }}>已更新</span>
        </div>

        <div className="mt-2 flex">
          {stats.map((item) => (
            <div key={item.label} className="flex-1 text-center">
              <span
                className="text-[19px] font-semibold tabular-nums"
                style={{ fontFamily: "'Noto Serif SC', 'Songti SC', serif" }}
              >
                {item.value}
              </span>
              <span
                className="ml-0.5 text-[11px]"
                style={{ color: 'var(--text-muted, #7A7F87)' }}
              >
                {' '}
                {item.label}
              </span>
            </div>
          ))}
          <div className="flex-1 text-center">
            <span
              className="text-[19px] font-semibold tabular-nums"
              style={{ fontFamily: "'Noto Serif SC', 'Songti SC', serif" }}
            >
              {percent}%
            </span>
          </div>
        </div>

        {recap && (
          <div className="mt-2 text-[13px] leading-relaxed">{recap}</div>
        )}
      </div>
    </div>
  );
};

export default ReadingSummaryCard;