import React from 'react';
import { BookOpen } from 'lucide-react';

// 页边注发过来的「划线 + 想法」卡片。消息本身在 db.messages 里，
// type: 'margin_note'，跟和好券（type: 'coupon'）同一套做法——
// 真正的聊天消息，不是只存在界面上的假卡片。
// metadata: { bookTitle, chapterTitle, text, note, color, percent }
const HIGHLIGHT_BG = {
  yellow: 'rgba(238, 196, 72, 0.5)',
  pink: 'rgba(241, 165, 180, 0.45)',
  blue: 'rgba(142, 197, 240, 0.45)',
  green: 'rgba(168, 216, 160, 0.45)',
};

export const MarginNoteCard = ({ metadata }) => {
  const bookTitle = metadata?.bookTitle || '';
  const chapterTitle = metadata?.chapterTitle || '';
  const text = metadata?.text || '';
  const note = metadata?.note || '';
  const percent = Math.max(0, Math.min(100, Math.round(metadata?.percent) || 0));
  const highlightBg = HIGHLIGHT_BG[metadata?.color] || HIGHLIGHT_BG.yellow;

  return (
    <div className="w-full max-w-[292px] my-2">
      <div
        className="rounded-2xl p-4 pb-3"
        style={{
          backgroundColor: 'var(--card-bg, #ffffff)',
          borderColor: 'var(--card-border, #D6DBE2)',
          borderWidth: '1px',
          borderStyle: 'solid',
          color: 'var(--text-main, #23262B)',
        }}
      >
        <div
          className="flex items-center gap-1.5 text-[11.5px] tracking-wide"
          style={{ color: 'var(--accent-color, #2F4E6F)' }}
        >
          <BookOpen className="h-3.5 w-3.5" strokeWidth={1.8} />
          <span>
            页边注{bookTitle ? ` · 《${bookTitle}》${chapterTitle}` : ''}
          </span>
        </div>

        {text && (
          <div
            className="mt-2.5 mb-2 text-[17px] leading-relaxed"
            style={{ fontFamily: "'Noto Serif SC', 'Songti SC', serif" }}
          >
            <span
              className="rounded px-0.5"
              style={{ background: highlightBg }}
            >
              {text}
            </span>
          </div>
        )}

        {note && (
          <div className="text-[14.5px] leading-relaxed">{note}</div>
        )}

        <div
          className="mt-3 pt-2.5 flex items-center justify-between border-t text-xs"
          style={{
            borderColor: 'var(--card-border, #EEF0EE)',
            color: 'var(--text-muted, #7A7F87)',
          }}
        >
          <span className="tabular-nums">
            {chapterTitle}
            {chapterTitle ? ' · ' : ''}
            {percent}%
          </span>
        </div>
      </div>
    </div>
  );
};

export default MarginNoteCard;