// src/apps/margin-notes/library/ReaderTocSheet.jsx
//
// 阅读页的目录面板，两页：
//   目录：列出全部章节，点一章跳过去，当前章高亮。
//   批注：列出这本书全部的划线和想法，点一条跳到那一章附近，
//         点铅笔图标直接打开那条批注编辑（不跳转）。

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, X } from 'lucide-react';

import { getBookAnnotations } from './readerAnnotationService';
import { HIGHLIGHT_COLORS } from './readerTheme';

export default function ReaderTocSheet({
  chapters,
  currentIndex,
  bookId,
  onPickChapter,
  onPickAnnotation,
  onEditAnnotation,
  onClose,
}) {
  const [tab, setTab] = useState('toc');
  const [annotations, setAnnotations] = useState(null);
  const currentRef = useRef(null);
  const listRef = useRef(null);

  // 打开时把当前章节滚到列表中间。
  // 不能用 scrollIntoView：它会连同外层所有可滚动的祖先一起滚，
  // 阅读页根节点是 fixed 的，被它滚走以后整页就停在上面回不来了。
  // 这里只滚目录列表自己。
  useEffect(() => {
    const list = listRef.current;
    const item = currentRef.current;
    if (!list || !item) return;

    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    list.scrollTop +=
      itemRect.top - listRect.top - (listRect.height - itemRect.height) / 2;
  }, []);

  useEffect(() => {
    if (tab !== 'notes' || annotations !== null) return;
    let alive = true;
    getBookAnnotations(bookId).then((rows) => {
      if (alive) setAnnotations(rows);
    });
    return () => {
      alive = false;
    };
  }, [tab, bookId, annotations]);

  const grouped = useMemo(() => {
    if (!annotations) return [];
    const byChapter = new Map();
    for (const item of annotations) {
      if (!byChapter.has(item.chapterIndex)) byChapter.set(item.chapterIndex, []);
      byChapter.get(item.chapterIndex).push(item);
    }
    return Array.from(byChapter.entries()).sort((a, b) => a[0] - b[0]);
  }, [annotations]);

  return (
    <div className="mn-rd-sheet-backdrop" onClick={onClose} role="presentation">
      <section
        className="mn-rd-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="目录与批注"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mn-rd-sheet__head">
          <div className="mn-rd-sheet__tabs" role="tablist" aria-label="目录面板分页">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'toc'}
              className={`mn-rd-sheet__tab${tab === 'toc' ? ' is-active' : ''}`}
              onClick={() => setTab('toc')}
            >
              目录 · {chapters.length}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'notes'}
              className={`mn-rd-sheet__tab${tab === 'notes' ? ' is-active' : ''}`}
              onClick={() => setTab('notes')}
            >
              批注{annotations ? ` · ${annotations.length}` : ''}
            </button>
          </div>
          <button
            type="button"
            className="mn-rd-sheet__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        {tab === 'toc' ? (
          <div className="mn-rd-sheet__list" ref={listRef}>
            {chapters.map((chapter, index) => {
              const active = index === currentIndex;
              return (
                <button
                  key={index}
                  type="button"
                  ref={active ? currentRef : null}
                  className={`mn-rd-toc${active ? ' is-active' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onPickChapter(index)}
                >
                  <span className="mn-rd-toc__no">{index + 1}</span>
                  <span className="mn-rd-toc__title">{chapter.title}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mn-rd-sheet__list">
            {annotations === null ? (
              <div className="mn-rd-sheet__empty">正在读取……</div>
            ) : annotations.length === 0 ? (
              <div className="mn-rd-sheet__empty">
                还没有划线或批注，选中正文里的文字试试看。
              </div>
            ) : (
              grouped.map(([chapterIndex, items]) => (
                <div key={chapterIndex} className="mn-rd-notes-group">
                  <div className="mn-rd-notes-group__title">
                    {items[0].chapterTitle || `第 ${chapterIndex + 1} 章`}
                  </div>
                  {items.map((item) => (
                    <div key={item.id} className="mn-rd-note">
                      <button
                        type="button"
                        className="mn-rd-note__main"
                        onClick={() => onPickAnnotation(item)}
                      >
                        <span
                          className="mn-rd-note__quote"
                          style={{ background: HIGHLIGHT_COLORS[item.color]?.bg }}
                        >
                          {item.text}
                        </span>
                        {item.note && (
                          <span className="mn-rd-note__text">{item.note}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="mn-rd-note__edit"
                        aria-label="编辑这条批注"
                        onClick={() => onEditAnnotation(item)}
                      >
                        <Pencil size={14} strokeWidth={1.8} />
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}