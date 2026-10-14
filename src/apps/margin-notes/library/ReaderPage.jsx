// src/apps/margin-notes/library/ReaderPage.jsx
//
// 阅读页（上下滚动模式）。从藏书页点「进入阅读」进来。
//
// 位置怎么记：第几章 + 本章滚动比例（0-1），不记像素。
// 所以改字号、字体、页边距以后，用比例把滚动位置放回去，还是在同一段文字附近。
// 网页字体是后来才加载完的，加载完会让排版变一下，所以字体加载完成时再按比例放一次。
//
// 进度保存：滚动停下 0.8 秒后写一次；切到后台、关页面、离开阅读页时马上写。
// 阅读计时在 ReadingTimerBadge 里，不在这里，免得每秒触发整页重渲染。

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';

import { getBook, getBookContent } from './readerLibraryService';
import {
  loadReaderSettings,
  saveReaderSettings,
} from './readerSettingsService';
import {
  computeProgressPercent,
  saveReadingProgress,
} from './readerProgressService';
import {
  DEFAULT_READER_SETTINGS,
  READER_THEMES,
  computeLayout,
  isMostlyLatin,
  normalizeReaderSettings,
  splitParagraphs,
  tokenizeBionic,
} from './readerTheme';
import ReadingTimerBadge from './ReadingTimerBadge';
import ReaderSettingsPanel from './ReaderSettingsPanel';
import ReaderTocSheet from './ReaderTocSheet';

import './reader.css';

const SAVE_DELAY_MS = 800;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** 正文段落。单独做成 memo 组件，滚动时进度数字变化不会让整章重新渲染。 */
const ChapterBody = React.memo(function ChapterBody({
  paragraphs,
  bionic,
  latin,
  focus,
  focusIdx,
  onPickPara,
  paraRefs,
}) {
  return (
    <>
      {paragraphs.map((text, index) => {
        const dimmed = focus && index !== focusIdx;
        return (
          <p
            key={index}
            ref={(node) => {
              paraRefs.current[index] = node;
            }}
            className={`mn-rd-para${focus ? ' is-focusable' : ''}${
              dimmed ? ' is-dim' : ''
            }`}
            onClick={focus ? () => onPickPara(index) : undefined}
          >
            {bionic && latin
              ? tokenizeBionic(text).map((token, tokenIndex) => (
                  <React.Fragment key={tokenIndex}>
                    <b>{token.b}</b>
                    {token.t}
                  </React.Fragment>
                ))
              : text}
          </p>
        );
      })}
    </>
  );
});

const ListIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);

export default function ReaderPage({ bookId, onBack }) {
  const [status, setStatus] = useState('loading'); // loading | ready | nofile | missing
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState(null);
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_READER_SETTINGS,
  }));
  const [chapterIndex, setChapterIndex] = useState(0);
  const [percent, setPercent] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);

  const scrollRef = useRef(null);
  const paraRefs = useRef([]);
  const fractionRef = useRef(0);
  const restoreRef = useRef(0);
  const touchedRef = useRef(false);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef(null);
  const chapterIndexRef = useRef(0);
  const chapterLengthsRef = useRef([]);
  const loadedSettingsRef = useRef(null);

  chapterIndexRef.current = chapterIndex;

  const chapterLengths = useMemo(
    () => (chapters ? chapters.map((item) => (item.text || '').length) : []),
    [chapters]
  );
  chapterLengthsRef.current = chapterLengths;

  const chapter = chapters ? chapters[chapterIndex] : null;
  const paragraphs = useMemo(
    () => splitParagraphs(chapter?.text),
    [chapter]
  );
  const latin = useMemo(() => isMostlyLatin(chapter?.text), [chapter]);
  const layout = useMemo(() => computeLayout(settings, latin), [settings, latin]);
  const theme = READER_THEMES[settings.theme] || READER_THEMES.paper;

  /* ---------- 读取书、正文、设置 ---------- */

  useEffect(() => {
    let alive = true;
    setStatus('loading');

    (async () => {
      const [bookRow, content, loadedSettings] = await Promise.all([
        getBook(bookId),
        getBookContent(bookId),
        loadReaderSettings(),
      ]);
      if (!alive) return;

      loadedSettingsRef.current = loadedSettings;
      setSettings(loadedSettings);

      if (!bookRow) {
        setStatus('missing');
        return;
      }
      setBook(bookRow);

      if (!Array.isArray(content) || content.length === 0) {
        setStatus('nofile');
        return;
      }

      const index = Math.max(
        0,
        Math.min(content.length - 1, Number(bookRow.lastChapterIndex) || 0)
      );
      restoreRef.current = clamp01(Number(bookRow.lastChapterOffset) || 0);
      touchedRef.current = false;
      dirtyRef.current = false;
      setChapters(content);
      setChapterIndex(index);
      setPercent(Math.max(0, Math.min(100, Number(bookRow.progress) || 0)));
      setStatus('ready');
    })();

    return () => {
      alive = false;
    };
  }, [bookId]);

  /* ---------- 设置变化后保存（所有书共用） ---------- */

  useEffect(() => {
    // 还没读出已存设置、或者就是刚读出来的那份，都不用写回去
    if (!loadedSettingsRef.current || settings === loadedSettingsRef.current) {
      return;
    }
    saveReaderSettings(settings);
  }, [settings]);

  const handleSettingsChange = useCallback((patch) => {
    setSettings((previous) =>
      normalizeReaderSettings({ ...previous, ...patch })
    );
  }, []);

  /* ---------- 保存阅读进度 ---------- */

  const persist = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;

    const index = chapterIndexRef.current;
    const fraction = fractionRef.current;
    saveReadingProgress(bookId, {
      chapterIndex: index,
      fraction,
      percent: computeProgressPercent(chapterLengthsRef.current, index, fraction),
    });
  }, [bookId]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(persist, SAVE_DELAY_MS);
  }, [persist]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', persist);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', persist);
      persist();
    };
  }, [persist]);

  /* ---------- 滚动位置：恢复与保持 ---------- */

  const applyFraction = useCallback((fraction) => {
    const node = scrollRef.current;
    if (!node) return;
    const max = node.scrollHeight - node.clientHeight;
    node.scrollTop = max > 0 ? max * clamp01(fraction) : 0;
  }, []);

  // 进入阅读页、换章：把滚动位置放到 restoreRef 指的比例
  useLayoutEffect(() => {
    if (status !== 'ready') return undefined;

    const fraction = restoreRef.current;
    restoreRef.current = 0;
    touchedRef.current = false;
    fractionRef.current = fraction;
    applyFraction(fraction);
    setPercent(
      computeProgressPercent(chapterLengthsRef.current, chapterIndex, fraction)
    );

    let cancelled = false;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) applyFraction(fractionRef.current);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [status, chapterIndex, applyFraction]);

  // 改了字号、字体、行距、页边距等：用比例放回原来的位置
  const layoutKey = `${settings.font}|${settings.level}|${settings.lh}|${settings.mg}|${settings.spacing}|${settings.bionic}|${settings.align}`;
  useLayoutEffect(() => {
    if (status !== 'ready') return;
    applyFraction(fractionRef.current);
  }, [layoutKey, status, applyFraction]);

  // 网页字体加载完成会改变排版，加载完再放一次
  useEffect(() => {
    if (status !== 'ready' || !document.fonts?.addEventListener) {
      return undefined;
    }
    const handleDone = () => applyFraction(fractionRef.current);
    document.fonts.addEventListener('loadingdone', handleDone);
    return () => document.fonts.removeEventListener('loadingdone', handleDone);
  }, [status, applyFraction]);

  const markTouched = useCallback(() => {
    touchedRef.current = true;
  }, []);

  const handleScroll = useCallback(() => {
    // 还没有人手动操作过，说明是代码在放位置，不当作用户滚动
    if (!touchedRef.current) return;

    const node = scrollRef.current;
    if (!node) return;

    const max = node.scrollHeight - node.clientHeight;
    const fraction = max > 0 ? clamp01(node.scrollTop / max) : 0;
    fractionRef.current = fraction;

    const next = computeProgressPercent(
      chapterLengthsRef.current,
      chapterIndexRef.current,
      fraction
    );
    setPercent((previous) => (previous === next ? previous : next));

    dirtyRef.current = true;
    scheduleSave();
  }, [scheduleSave]);

  /* ---------- 换章 ---------- */

  const goToChapter = useCallback(
    (index, fraction = 0) => {
      if (!chapters) return;
      const target = Math.max(0, Math.min(chapters.length - 1, index));
      restoreRef.current = clamp01(fraction);
      dirtyRef.current = true;
      setFocusIdx(0);
      setTocOpen(false);
      setChapterIndex(target);
      scheduleSave();
    },
    [chapters, scheduleSave]
  );

  /* ---------- 段落聚焦 ---------- */

  const scrollToPara = useCallback((index) => {
    const element = paraRefs.current[index];
    if (element && element.scrollIntoView) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, []);

  const handlePickPara = useCallback(
    (index) => {
      touchedRef.current = true;
      setFocusIdx(index);
      scrollToPara(index);
    },
    [scrollToPara]
  );

  const stepFocus = (delta) => {
    const next = focusIdx + delta;

    if (next < 0) {
      if (chapterIndex > 0) goToChapter(chapterIndex - 1, 0);
      return;
    }
    if (next >= paragraphs.length) {
      if (chapters && chapterIndex < chapters.length - 1) {
        goToChapter(chapterIndex + 1, 0);
      }
      return;
    }
    handlePickPara(next);
  };

  // 刚打开「段落聚焦」时，聚焦在屏幕上方第一段可见的段落
  useEffect(() => {
    if (!settings.focus || status !== 'ready') return;
    const node = scrollRef.current;
    if (!node) return;

    const top = node.getBoundingClientRect().top;
    let pick = 0;
    for (let index = 0; index < paragraphs.length; index += 1) {
      const element = paraRefs.current[index];
      if (element && element.getBoundingClientRect().bottom > top + 24) {
        pick = index;
        break;
      }
    }
    setFocusIdx(pick);
    // 只在开关变化时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.focus, status]);

  /* ---------- 渲染 ---------- */

  const rootStyle = {
    '--rd-bg': theme.bg,
    '--rd-fg': theme.fg,
    '--rd-sub': theme.sub,
    '--rd-panel': theme.panel,
    '--rd-line': theme.line,
    '--rd-chip': theme.chip,
    '--rd-sel': theme.sel,
    '--rd-sel-fg': theme.selFg,
    '--rd-accent': theme.accent,
    '--rd-on-accent': theme.onAccent,
    '--rd-tick': theme.tick,
    '--rd-hl': theme.hl,
    '--rd-glow-a': theme.glowA,
    '--rd-glow-b': theme.glowB,
  };

  const handleBack = () => {
    persist();
    onBack();
  };

  const backButton = (
    <button
      type="button"
      className="mn-rd-iconbtn mn-rd-iconbtn--back"
      onClick={handleBack}
      aria-label="返回藏书"
    >
      <ArrowLeft size={20} strokeWidth={1.8} />
    </button>
  );

  if (status !== 'ready') {
    const message =
      status === 'loading'
        ? '正在翻开这本书...'
        : status === 'nofile'
          ? '这本书的正文已经被清理，或备份恢复后没有带回来。回到藏书页重新导入一次就能继续读。'
          : '找不到这本书了，它可能已经被删除。';

    return (
      <div className="mn-rd-root" style={rootStyle}>
        {backButton}
        <div className="mn-rd-empty">{message}</div>
      </div>
    );
  }

  const total = chapters.length;
  const isFirst = chapterIndex === 0;
  const isLast = chapterIndex === total - 1;
  const nextChapter = isLast ? null : chapters[chapterIndex + 1];

  const contentStyle = {
    fontFamily: layout.fontStack,
    fontSize: `${layout.sizePx}px`,
    lineHeight: layout.lineHeight,
    textAlign: layout.textAlign,
    letterSpacing: layout.letterSpacing,
    wordSpacing: layout.wordSpacing,
    '--rd-indent': layout.indent,
    '--rd-para-gap': `${layout.paraGap}px`,
    '--rd-head-gap': `${layout.headGap}px`,
    '--rd-title-size': `${layout.titleSize}px`,
  };

  return (
    <div className="mn-rd-root" style={rootStyle}>
      <div className="mn-rd-glow mn-rd-glow--a" aria-hidden="true" />
      <div className="mn-rd-glow mn-rd-glow--b" aria-hidden="true" />

      {backButton}
      <ReadingTimerBadge bookId={bookId} />

      <div className="mn-rd-topright">
        <button
          type="button"
          className="mn-rd-iconbtn"
          onClick={() => setTocOpen(true)}
          aria-label="目录"
        >
          <ListIcon />
        </button>
        <button
          type="button"
          className={`mn-rd-iconbtn mn-rd-iconbtn--text${
            panelOpen ? ' is-active' : ''
          }`}
          onClick={() => setPanelOpen((open) => !open)}
          aria-label="阅读设置"
          aria-expanded={panelOpen}
        >
          Aa
        </button>
      </div>

      <div
        ref={scrollRef}
        className="mn-rd-scroll"
        style={{ left: layout.marginX, right: layout.marginX }}
        tabIndex={0}
        onScroll={handleScroll}
        onTouchStart={markTouched}
        onWheel={markTouched}
        onPointerDown={markTouched}
        onKeyDown={markTouched}
      >
        <div className="mn-rd-content" style={contentStyle}>
          <header className="mn-rd-head">
            <div className="mn-rd-kicker">
              {book.title} · 第 {chapterIndex + 1} / {total} 章
            </div>
            <h1 className="mn-rd-title">{chapter.title}</h1>
            <div className="mn-rd-rule" />
          </header>

          <ChapterBody
            paragraphs={paragraphs}
            bionic={settings.bionic}
            latin={latin}
            focus={settings.focus}
            focusIdx={focusIdx}
            onPickPara={handlePickPara}
            paraRefs={paraRefs}
          />

          <footer className="mn-rd-end">
            <div className="mn-rd-end__rule" />
            <div className="mn-rd-end__text">
              {isLast ? '全书完' : `第 ${chapterIndex + 1} 章完`}
            </div>
            <div className="mn-rd-end__actions">
              <button
                type="button"
                className="mn-rd-end__btn"
                disabled={isFirst}
                onClick={() => goToChapter(chapterIndex - 1, 0)}
              >
                上一章
              </button>
              <button
                type="button"
                className="mn-rd-end__btn is-primary"
                disabled={isLast}
                onClick={() => goToChapter(chapterIndex + 1, 0)}
              >
                下一章
              </button>
            </div>
            {nextChapter && (
              <div className="mn-rd-end__next">
                下一章 · {nextChapter.title}
              </div>
            )}
          </footer>
        </div>
      </div>

      <button
        type="button"
        className="mn-rd-status"
        onClick={() => setTocOpen(true)}
        aria-label="打开目录"
      >
        <span className="mn-rd-status__title">{chapter.title}</span>
        <span className="mn-rd-status__dot" aria-hidden="true" />
        <span>{percent}%</span>
      </button>

      {settings.focus && !panelOpen && (
        <div className="mn-rd-focusnav">
          <button
            type="button"
            className="mn-rd-iconbtn"
            onClick={() => stepFocus(-1)}
            aria-label="上一段"
          >
            <ChevronUp size={20} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="mn-rd-iconbtn"
            onClick={() => stepFocus(1)}
            aria-label="下一段"
          >
            <ChevronDown size={20} strokeWidth={1.8} />
          </button>
        </div>
      )}

      <div className="mn-rd-bar" aria-hidden="true">
        <div className="mn-rd-bar__fill" style={{ width: `${percent}%` }} />
      </div>

      {panelOpen && (
        <ReaderSettingsPanel
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {tocOpen && (
        <ReaderTocSheet
          chapters={chapters}
          currentIndex={chapterIndex}
          onPick={(index) => goToChapter(index, 0)}
          onClose={() => setTocOpen(false)}
        />
      )}
    </div>
  );
}