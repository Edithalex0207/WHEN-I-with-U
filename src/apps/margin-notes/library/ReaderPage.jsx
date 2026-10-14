// src/apps/margin-notes/library/ReaderPage.jsx
//
// 阅读页（上下滚动模式）。从藏书页点「进入阅读」进来。
//
// 位置怎么记：第几章 + 本章滚动比例（0-1），不记像素。
// 所以改字号、字体、页边距以后，用比例把滚动位置放回去，还是在同一段文字附近。
// 网页字体是后来才加载完的，加载完会让排版变一下，所以字体加载完成时再按比例放一次。
//
// 进度保存：滚动停下 0.8 秒后写一次；切到后台、关页面、离开阅读页时马上写。
// 阅读计时在 ReadingTimerBadge 里，不在这里，免得每秒触发整页重渲染
// （这里只透过 onMinutesChange 拿「这次阅读了几分钟」这一个数，给退出小结用）。
//
// 选中文字：选区只能落在同一段落里，选完会在上方弹出小工具条
// ——四个颜色点直接划线，「批注」「发到聊天室」都会打开写批注的面板
// （面板里有「同时发到聊天室」开关，两个入口打开的是同一个面板），
// 「复制」把选中文字拷到剪贴板。点一下已经划好的线会打开同一个面板来改/删它。
//
// 请 TA 一起读：选一个范围（这一段/这一章/你划线的地方），调一次 AI，
// 结果只在阅读页展示一次，不写进聊天记录。
//
// 退出阅读：点返回藏书页会先弹一个小结（这次读了几分钟、新增几条批注/留言），
// 问要不要把摘要发到绑定的聊天室；同一本书的摘要卡片只保留一张，默认是
// 更新上次那张，也可以选择另发一张。

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';

import db from '../../../db';

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
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_COLORS,
  READER_THEMES,
  buildHighlightSegments,
  computeLayout,
  isMostlyLatin,
  normalizeReaderSettings,
  splitParagraphs,
  tokenizeBionic,
} from './readerTheme';
import {
  addAnnotation,
  deleteAnnotation,
  getBookAnnotations,
  getChapterAnnotations,
  sendAnnotationToChat,
  updateAnnotation,
} from './readerAnnotationService';
import { generateReaderComment, generateReadingRecap } from './readerAiService';
import { sendReadingSummary } from './readerSummaryService';
import { clearNativeSelection, getParagraphSelection } from './selectionOffset';
import ReadingTimerBadge from './ReadingTimerBadge';
import ReaderSettingsPanel from './ReaderSettingsPanel';
import ReaderTocSheet from './ReaderTocSheet';
import SelectionToolbar from './SelectionToolbar';
import AnnotationComposer from './AnnotationComposer';
import ReaderCommentSheet from './ReaderCommentSheet';
import ReaderExitSummary from './ReaderExitSummary';

import './reader.css';

const SAVE_DELAY_MS = 800;
const TOAST_MS = 1600;

const SCOPE_LABELS = {
  para: '这一段',
  chapter: '这一章',
  highlights: '你划线的地方',
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** 正文段落。单独做成 memo 组件，滚动时进度数字变化不会让整章重新渲染。 */
const ChapterBody = React.memo(function ChapterBody({
  paragraphs,
  bionic,
  latin,
  focus,
  focusIdx,
  onPickPara,
  onEditHighlight,
  annotationsByPara,
  paraRefs,
}) {
  return (
    <>
      {paragraphs.map((text, index) => {
        const dimmed = focus && index !== focusIdx;
        const segments = buildHighlightSegments(
          text,
          annotationsByPara.get(index)
        );

        return (
          <p
            key={index}
            data-para-index={index}
            ref={(node) => {
              paraRefs.current[index] = node;
            }}
            className={`mn-rd-para${focus ? ' is-focusable' : ''}${
              dimmed ? ' is-dim' : ''
            }`}
            onClick={focus ? () => onPickPara(index) : undefined}
          >
            {segments.map((segment, segIndex) => {
              const content =
                bionic && latin
                  ? tokenizeBionic(segment.text).map((token, tokenIndex) => (
                      <React.Fragment key={tokenIndex}>
                        <b>{token.b}</b>
                        {token.t}
                      </React.Fragment>
                    ))
                  : segment.text;

              if (!segment.highlight) {
                return <React.Fragment key={segIndex}>{content}</React.Fragment>;
              }

              return (
                <mark
                  key={segIndex}
                  className="mn-rd-mark"
                  style={{
                    background: HIGHLIGHT_COLORS[segment.highlight.color]?.bg,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditHighlight(segment.highlight.id);
                  }}
                >
                  {content}
                </mark>
              );
            })}
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

  const [chatLabel, setChatLabel] = useState('');
  const [canSendToChat, setCanSendToChat] = useState(false);
  const [character, setCharacter] = useState(null);
  const [chapterAnnotations, setChapterAnnotations] = useState([]);
  const [selection, setSelection] = useState(null); // { paragraphIndex, start, end, text, rect }
  const [composer, setComposer] = useState(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [toast, setToast] = useState('');

  const scrollRef = useRef(null);
  const paraRefs = useRef([]);
  const fractionRef = useRef(0);
  const restoreRef = useRef(0);
  const touchedRef = useRef(false);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const chapterIndexRef = useRef(0);
  const chapterLengthsRef = useRef([]);
  const loadedSettingsRef = useRef(null);
  const percentRef = useRef(0);

  // 这次打开这本书以来的小统计，给退出时的阅读摘要用
  const sessionMinutesRef = useRef(0);
  const sessionChaptersRef = useRef(new Set());
  const sessionNewAnnotationsRef = useRef(0);
  const sessionAnnotationNotesRef = useRef([]);
  const sessionCommentsRef = useRef(0);

  chapterIndexRef.current = chapterIndex;
  percentRef.current = percent;

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

  const annotationsByPara = useMemo(() => {
    const map = new Map();
    for (const item of chapterAnnotations) {
      if (!map.has(item.paragraphIndex)) map.set(item.paragraphIndex, []);
      map.get(item.paragraphIndex).push(item);
    }
    return map;
  }, [chapterAnnotations]);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), TOAST_MS);
  }, []);

  /* ---------- 读取书、正文、设置、绑定的聊天室 ---------- */

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

      if (bookRow.chatId) {
        try {
          const chat = await db.chats.get(bookRow.chatId);
          if (alive && chat) {
            const characterRow = chat.characterId
              ? await db.characters.get(chat.characterId)
              : null;
            const name = characterRow?.name || '未知角色';
            setChatLabel(chat.title || `和${name}的聊天`);
            setCanSendToChat(true);
            setCharacter(characterRow || null);
          }
        } catch (error) {
          console.warn('[阅读器] 读取绑定的聊天室失败：', error);
        }
      }

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
      sessionChaptersRef.current.add(index);
      setChapters(content);
      setChapterIndex(index);
      setPercent(Math.max(0, Math.min(100, Number(bookRow.progress) || 0)));
      setStatus('ready');
    })();

    return () => {
      alive = false;
    };
  }, [bookId]);

  /* ---------- 每章的划线/批注 ---------- */

  const refreshChapterAnnotations = useCallback(() => {
    if (!bookId) return;
    const askedIndex = chapterIndexRef.current;
    getChapterAnnotations(bookId, askedIndex).then((rows) => {
      // 读的时候可能已经换章了，换了就别用这份过时的数据覆盖
      if (chapterIndexRef.current === askedIndex) {
        setChapterAnnotations(rows);
      }
    });
  }, [bookId]);

  useEffect(() => {
    if (status !== 'ready') return;
    let alive = true;
    sessionChaptersRef.current.add(chapterIndex);
    getChapterAnnotations(bookId, chapterIndex).then((rows) => {
      if (alive) setChapterAnnotations(rows);
    });
    return () => {
      alive = false;
    };
  }, [status, bookId, chapterIndex]);

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
      setSelection(null);
      setTocOpen(false);
      setChapterIndex(target);
      scheduleSave();
    },
    [chapters, scheduleSave]
  );

  const paragraphFraction = useCallback(
    (targetChapterIndex, paragraphIndex) => {
      const text = chapters?.[targetChapterIndex]?.text;
      const total = splitParagraphs(text).length;
      if (!total) return 0;
      return clamp01(paragraphIndex / total);
    },
    [chapters]
  );

  /* ---------- 段落聚焦 ---------- */

  const scrollToPara = useCallback((index) => {
    const element = paraRefs.current[index];
    const node = scrollRef.current;
    if (!element || !node) return;

    // 只滚正文容器自己，不用 scrollIntoView（它会把 fixed 的阅读页根节点也一起滚走）
    const nodeRect = node.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const delta =
      elementRect.top - nodeRect.top - (nodeRect.height - elementRect.height) / 2;

    if (typeof node.scrollBy === 'function') {
      node.scrollBy({ top: delta, behavior: 'smooth' });
    } else {
      node.scrollTop += delta;
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

  // 找屏幕上方第一个可见的段落序号（「请 TA 一起读」选"这一段"时用）
  const findTopVisibleParaIndex = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return 0;
    const top = node.getBoundingClientRect().top;
    for (let index = 0; index < paragraphs.length; index += 1) {
      const element = paraRefs.current[index];
      if (element && element.getBoundingClientRect().bottom > top + 24) {
        return index;
      }
    }
    return Math.max(0, paragraphs.length - 1);
  }, [paragraphs]);

  /* ---------- 选中文字 ---------- */

  const handleSelectionChange = useCallback(() => {
    if (composer) return; // 面板开着的时候不管选区

    const sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const anchor =
      range.commonAncestorContainer.nodeType === 1
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    const paraEl = anchor ? anchor.closest('.mn-rd-para') : null;
    if (!paraEl) {
      setSelection(null);
      return;
    }

    const result = getParagraphSelection(paraEl);
    if (!result) {
      setSelection(null);
      return;
    }

    const paragraphIndex = Number(paraEl.dataset.paraIndex);
    const text = (paragraphs[paragraphIndex] || '').slice(result.start, result.end);
    if (!text) {
      setSelection(null);
      return;
    }

    setSelection({
      paragraphIndex,
      start: result.start,
      end: result.end,
      text,
      rect: result.rect,
    });
  }, [composer, paragraphs]);

  useEffect(() => {
    if (status !== 'ready') return undefined;
    document.addEventListener('selectionchange', handleSelectionChange);
    return () =>
      document.removeEventListener('selectionchange', handleSelectionChange);
  }, [status, handleSelectionChange]);

  const dismissSelection = useCallback(() => {
    clearNativeSelection();
    setSelection(null);
  }, []);

  const noteSessionAnnotation = useCallback((text, note) => {
    sessionNewAnnotationsRef.current += 1;
    sessionAnnotationNotesRef.current.push({ text, note: note || '' });
  }, []);

  const handlePickColor = useCallback(
    async (color) => {
      if (!selection) return;
      await addAnnotation({
        bookId,
        chapterIndex,
        chapterTitle: chapter?.title || '',
        paragraphIndex: selection.paragraphIndex,
        start: selection.start,
        end: selection.end,
        text: selection.text,
        color,
      });
      noteSessionAnnotation(selection.text, '');
      dismissSelection();
      refreshChapterAnnotations();
    },
    [
      selection,
      bookId,
      chapterIndex,
      chapter,
      dismissSelection,
      refreshChapterAnnotations,
      noteSessionAnnotation,
    ]
  );

  const openComposerForSelection = useCallback(() => {
    if (!selection) return;
    setComposer({
      mode: 'new',
      chapterIndex,
      chapterTitle: chapter?.title || '',
      paragraphIndex: selection.paragraphIndex,
      start: selection.start,
      end: selection.end,
      quoteText: selection.text,
      color: DEFAULT_HIGHLIGHT_COLOR,
      note: '',
      alreadySent: false,
    });
    setSelection(null);
    clearNativeSelection();
  }, [selection, chapterIndex, chapter]);

  const handleCopy = useCallback(async () => {
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection.text);
      showToast('已复制');
    } catch (error) {
      console.warn('[阅读器] 复制失败：', error);
      showToast('没能复制，请手动选中再试');
    }
    dismissSelection();
  }, [selection, dismissSelection, showToast]);

  const handleEditHighlight = useCallback(
    (annotationId) => {
      const found = chapterAnnotations.find((item) => item.id === annotationId);
      if (!found) return;
      setSelection(null);
      setComposer({
        mode: 'edit',
        annotationId: found.id,
        chapterIndex: found.chapterIndex,
        chapterTitle: found.chapterTitle,
        quoteText: found.text,
        color: found.color,
        note: found.note,
        alreadySent: found.sentToChat,
      });
    },
    [chapterAnnotations]
  );

  const handleEditFromList = useCallback((annotation) => {
    setComposer({
      mode: 'edit',
      annotationId: annotation.id,
      chapterIndex: annotation.chapterIndex,
      chapterTitle: annotation.chapterTitle,
      quoteText: annotation.text,
      color: annotation.color,
      note: annotation.note,
      alreadySent: annotation.sentToChat,
    });
  }, []);

  const handlePickAnnotationFromList = useCallback(
    (annotation) => {
      const fraction = paragraphFraction(annotation.chapterIndex, annotation.paragraphIndex);
      goToChapter(annotation.chapterIndex, fraction);
    },
    [paragraphFraction, goToChapter]
  );

  const closeComposer = useCallback(() => {
    setComposer(null);
  }, []);

  const handleComposerSave = useCallback(
    async ({ color, note, sendToChat }) => {
      if (!composer) return;

      let annotation;
      if (composer.mode === 'new') {
        annotation = await addAnnotation({
          bookId,
          chapterIndex: composer.chapterIndex,
          chapterTitle: composer.chapterTitle,
          paragraphIndex: composer.paragraphIndex,
          start: composer.start,
          end: composer.end,
          text: composer.quoteText,
          color,
          note,
        });
        noteSessionAnnotation(composer.quoteText, note);
      } else {
        await updateAnnotation(composer.annotationId, { color, note });
        annotation = {
          id: composer.annotationId,
          bookId,
          chapterIndex: composer.chapterIndex,
          chapterTitle: composer.chapterTitle,
          text: composer.quoteText,
          color,
          note,
        };
      }

      if (sendToChat && book) {
        const sent = await sendAnnotationToChat({ annotation, book, percent: percentRef.current });
        if (!sent) showToast('没能发到聊天室');
        else showToast('已发到聊天室');
      }

      if (annotation.chapterIndex === chapterIndexRef.current) {
        refreshChapterAnnotations();
      }
      setComposer(null);
    },
    [composer, bookId, book, refreshChapterAnnotations, showToast, noteSessionAnnotation]
  );

  const handleComposerDelete = useCallback(async () => {
    if (!composer?.annotationId) return;
    await deleteAnnotation(composer.annotationId);
    if (composer.chapterIndex === chapterIndexRef.current) {
      refreshChapterAnnotations();
    }
    setComposer(null);
  }, [composer, refreshChapterAnnotations]);

  /* ---------- 请 TA 一起读 ---------- */

  const handleCommentScope = useCallback(
    async (scopeId) => {
      if (!character || !book) return null;

      let excerptText = '';
      if (scopeId === 'para') {
        const index = settings.focus ? focusIdx : findTopVisibleParaIndex();
        excerptText = paragraphs[index] || '';
      } else if (scopeId === 'chapter') {
        excerptText = chapter?.text || '';
      } else if (scopeId === 'highlights') {
        const rows = await getBookAnnotations(bookId);
        if (rows.length === 0) return null;
        excerptText = rows
          .map((item) => `• ${item.text}${item.note ? `（想法：${item.note}）` : ''}`)
          .join('\n');
      }

      if (!excerptText.trim()) return null;

      const text = await generateReaderComment({
        character,
        bookTitle: book.title,
        scopeLabel: SCOPE_LABELS[scopeId] || '这段内容',
        excerptText,
      });

      sessionCommentsRef.current += 1;
      return text;
    },
    [character, book, bookId, chapter, paragraphs, settings.focus, focusIdx, findTopVisibleParaIndex]
  );

  /* ---------- 退出阅读 ---------- */

  const handleRequestExit = useCallback(() => {
    persist();
    setExitOpen(true);
  }, [persist]);

  const handleLeaveWithoutSending = useCallback(() => {
    setExitOpen(false);
    onBack();
  }, [onBack]);

  const handleCancelExit = useCallback(() => {
    setExitOpen(false);
  }, []);

  const buildExitStats = useCallback(
    () => ({
      minutes: sessionMinutesRef.current,
      chaptersRead: sessionChaptersRef.current.size,
      newAnnotations: sessionNewAnnotationsRef.current,
      newComments: sessionCommentsRef.current,
      percent: percentRef.current,
      chapterTitle: chapter?.title || '',
    }),
    [chapter]
  );

  const handleSendSummary = useCallback(
    async ({ mode, includeRecap }) => {
      if (!book) return;

      let recap = '';
      if (includeRecap && character) {
        try {
          recap = await generateReadingRecap({
            character,
            bookTitle: book.title,
            chapterTitle: chapter?.title || '',
            highlightsText: sessionAnnotationNotesRef.current
              .map((item) => `${item.text}${item.note ? `：${item.note}` : ''}`)
              .join('\n'),
          });
        } catch (error) {
          console.warn('[阅读器] 生成一句话回顾失败：', error);
        }
      }

      try {
        await sendReadingSummary({ book, stats: buildExitStats(), recap, mode });
      } catch (error) {
        console.warn('[阅读器] 发送阅读摘要失败：', error);
      }

      setExitOpen(false);
      onBack();
    },
    [book, character, chapter, buildExitStats, onBack]
  );

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

  const backButton = (
    <button
      type="button"
      className="mn-rd-iconbtn mn-rd-iconbtn--back"
      onClick={handleRequestExit}
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
        <button
          type="button"
          className="mn-rd-iconbtn mn-rd-iconbtn--back"
          onClick={onBack}
          aria-label="返回藏书"
        >
          <ArrowLeft size={20} strokeWidth={1.8} />
        </button>
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
      <ReadingTimerBadge
        bookId={bookId}
        onMinutesChange={(minutes) => {
          sessionMinutesRef.current = minutes;
        }}
      />

      <div className="mn-rd-topright">
        <button
          type="button"
          className="mn-rd-iconbtn"
          onClick={() => setTocOpen(true)}
          aria-label="目录与批注"
        >
          <ListIcon />
        </button>
        {character && (
          <button
            type="button"
            className="mn-rd-iconbtn"
            onClick={() => setCommentOpen(true)}
            aria-label={`请 ${character.name} 一起读`}
          >
            <MessageSquare size={18} strokeWidth={1.8} />
          </button>
        )}
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
            onEditHighlight={handleEditHighlight}
            annotationsByPara={annotationsByPara}
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

      {selection && !composer && (
        <SelectionToolbar
          rect={selection.rect}
          onPickColor={handlePickColor}
          onAnnotate={openComposerForSelection}
          onSendToChat={openComposerForSelection}
          onCopy={handleCopy}
        />
      )}

      {toast && (
        <div className="mn-rd-toast" role="status">
          {toast}
        </div>
      )}

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
          bookId={bookId}
          onPickChapter={(index) => goToChapter(index, 0)}
          onPickAnnotation={handlePickAnnotationFromList}
          onEditAnnotation={(annotation) => {
            setTocOpen(false);
            handleEditFromList(annotation);
          }}
          onClose={() => setTocOpen(false)}
        />
      )}

      {composer && (
        <AnnotationComposer
          quoteText={composer.quoteText}
          initialColor={composer.color}
          initialNote={composer.note}
          chatLabel={chatLabel}
          canSendToChat={canSendToChat}
          isEditing={composer.mode === 'edit'}
          alreadySent={composer.alreadySent}
          onCancel={closeComposer}
          onSave={handleComposerSave}
          onDelete={composer.mode === 'edit' ? handleComposerDelete : null}
        />
      )}

      {commentOpen && character && (
        <ReaderCommentSheet
          characterName={character.name}
          canUseHighlights
          onPickScope={handleCommentScope}
          onClose={() => setCommentOpen(false)}
        />
      )}

      {exitOpen && (
        <ReaderExitSummary
          bookTitle={book.title}
          chapterTitle={chapter.title}
          chatLabel={chatLabel}
          canSendToChat={canSendToChat}
          hasExistingSummary={Boolean(book.summaryMessageId)}
          stats={buildExitStats()}
          onCancel={handleCancelExit}
          onLeaveWithoutSending={handleLeaveWithoutSending}
          onSend={handleSendSummary}
        />
      )}
    </div>
  );
}