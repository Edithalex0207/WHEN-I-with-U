// src/apps/margin-notes/library/ReaderTocSheet.jsx
//
// 阅读页的目录：列出全部章节，点一章跳过去。当前章高亮。

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function ReaderTocSheet({
  chapters,
  currentIndex,
  onPick,
  onClose,
}) {
  const currentRef = useRef(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <div
      className="mn-rd-sheet-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="mn-rd-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="目录"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mn-rd-sheet__head">
          <span className="mn-rd-sheet__title">
            目录 · 共 {chapters.length} 章
          </span>
          <button
            type="button"
            className="mn-rd-sheet__close"
            onClick={onClose}
            aria-label="关闭目录"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="mn-rd-sheet__list">
          {chapters.map((chapter, index) => {
            const active = index === currentIndex;
            return (
              <button
                key={index}
                type="button"
                ref={active ? currentRef : null}
                className={`mn-rd-toc${active ? ' is-active' : ''}`}
                aria-current={active ? 'true' : undefined}
                onClick={() => onPick(index)}
              >
                <span className="mn-rd-toc__no">{index + 1}</span>
                <span className="mn-rd-toc__title">{chapter.title}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}