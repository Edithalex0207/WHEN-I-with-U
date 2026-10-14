// src/apps/margin-notes/library/LibraryShelf.jsx
//
// 页边注「我的藏书」页：封面轮播、导入、换绑聊天室、管理（清理文件/删除）。
// 视觉照设计稿 Main.dc.html 做。
//   - 「进入阅读」通过 onOpenReader(bookId) 交给上层打开阅读页；
//   - 阅读时长一栏由 ReadingStatsPanel 读真实记录。

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowLeft, BookOpen, MessageSquare, Plus } from 'lucide-react';

import db from '../../../db';

import { parseBookFile } from './bookImport';
import { hasCjk, pickCoverStyle } from './coverUtils';
import {
  addBook,
  clearBookFile,
  deleteBook,
  formatBytes,
  getAllBooks,
  getLibraryStats,
  updateBookChat,
} from './readerLibraryService';
import {
  ChatPickerSheet,
  describeChat,
  ImportSheet,
  ManageSheet,
} from './LibrarySheets';

import ReadingStatsPanel from './ReadingStatsPanel';

import './readerLibrary.css';

const SERIF_CJK = "'Noto Serif SC', 'Songti SC', serif";
const SERIF_LATIN = "'Literata', 'Noto Serif SC', serif";

/**
 * 书的封面：有封面图就用图，没有就按书名生成（和设计稿三本示例书同一套做法）。
 */
function BookCover({ book }) {
  if (book.cover) {
    return <img className="mn-lib-cover__img" src={book.cover} alt="" />;
  }

  const palette = pickCoverStyle(book.title);
  const cjk = hasCjk(book.title);
  const length = Array.from(book.title).length;
  const vertical = cjk && length <= 8;

  let fontSize = 21;
  if (vertical) fontSize = length <= 4 ? 26 : 22;
  else if (length > 18) fontSize = 16;

  return (
    <span
      className="mn-lib-cover__title"
      style={{
        color: palette.fg,
        writingMode: vertical ? 'vertical-rl' : 'horizontal-tb',
        fontFamily: cjk ? SERIF_CJK : SERIF_LATIN,
        fontStyle: cjk ? 'normal' : 'italic',
        fontSize,
        letterSpacing: vertical ? '0.3em' : '0',
      }}
    >
      {book.title}
    </span>
  );
}

export default function LibraryShelf({ onBack, onOpenReader }) {
  const [books, setBooks] = useState([]);
  const [chats, setChats] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [stats, setStats] = useState({ count: 0, fileBytes: 0 });
  const [loading, setLoading] = useState(true);

  const [sel, setSel] = useState(0);
  const [opening, setOpening] = useState(false);
  const [opened, setOpened] = useState(false);

  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(null);

  const [showManage, setShowManage] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const [toast, setToast] = useState('');

  const fileInputRef = useRef(null);
  const openTimerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const mountedRef = useRef(true);

  const charactersById = useMemo(
    () => Object.fromEntries(characters.map((c) => [c.id, c])),
    [characters]
  );
  const chatsById = useMemo(
    () => Object.fromEntries(chats.map((c) => [c.id, c])),
    [chats]
  );

  const showToast = useCallback((text, duration = 2600) => {
    setToast(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setToast('');
    }, duration);
  }, []);

  const reload = useCallback(async () => {
    const [bookList, chatList, characterList, libraryStats] =
      await Promise.all([
        getAllBooks(),
        db.chats.toArray(),
        db.characters.toArray(),
        getLibraryStats(),
      ]);

    if (!mountedRef.current) return bookList;

    chatList.sort((a, b) =>
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
    );

    setBooks(bookList);
    setChats(chatList);
    setCharacters(characterList);
    setStats(libraryStats);
    return bookList;
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        await reload();
      } catch (error) {
        console.warn('[藏书] 读取书架失败：', error);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();

    return () => {
      mountedRef.current = false;
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [reload]);

  const closeBook = useCallback(() => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    setOpening(false);
    setOpened(false);
  }, []);

  const current = books[Math.min(sel, Math.max(0, books.length - 1))] || null;

  const roomLabel = useMemo(() => {
    if (!current) return '';
    const chat = current.chatId ? chatsById[current.chatId] : null;
    return chat ? describeChat(chat, charactersById).name : '未绑定聊天室';
  }, [current, chatsById, charactersById]);

  /* ------------------------------ 导入 ------------------------------ */

  const handleFileChosen = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const parsed = await parseBookFile(file);
      if (mountedRef.current) setPending(parsed);
    } catch (error) {
      console.warn('[藏书] 导入解析失败：', error);
      showToast(error?.message || '这本书没能读出来。', 4500);
    } finally {
      if (mountedRef.current) setImporting(false);
    }
  };

  const handleConfirmImport = async ({ title, author, chatId }) => {
    if (!pending) return;

    setSaving(true);
    try {
      await addBook({
        meta: {
          title,
          author,
          format: pending.format,
          cover: pending.cover,
          chatId,
        },
        chapters: pending.chapters,
      });
      await reload();
      if (!mountedRef.current) return;
      closeBook();
      setSel(0);
      setPending(null);
      showToast(`《${title}》已放进书架`);
    } catch (error) {
      console.warn('[藏书] 保存失败：', error);
      showToast('保存失败了，可能是本机存储空间不够。', 4500);
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  /* ------------------------------ 管理 ------------------------------ */

  const handlePickChat = async (chatId) => {
    if (!current) return;
    try {
      await updateBookChat(current.id, chatId);
      await reload();
      if (!mountedRef.current) return;
      setShowPicker(false);
      setShowManage(false);
      showToast(chatId ? '已更换聊天室' : '已解除绑定');
    } catch (error) {
      console.warn('[藏书] 换绑失败：', error);
      showToast('没能更换，请再试一次。');
    }
  };

  const handleClearFile = async () => {
    if (!current || !current.hasFile) return;
    const confirmed = window.confirm(
      `清理《${current.title}》的文件后，要再读这本书需要重新导入。书的信息会保留。确定清理吗？`
    );
    if (!confirmed) return;

    try {
      await clearBookFile(current.id);
      await reload();
      if (!mountedRef.current) return;
      closeBook();
      setShowManage(false);
      showToast('文件已清理');
    } catch (error) {
      console.warn('[藏书] 清理失败：', error);
      showToast('没能清理，请再试一次。');
    }
  };

  const handleDelete = async () => {
    if (!current) return;
    const confirmed = window.confirm(
      `确定删除《${current.title}》吗？书和这本书的所有记录都会被删掉，不能恢复。`
    );
    if (!confirmed) return;

    try {
      await deleteBook(current.id);
      await reload();
      if (!mountedRef.current) return;
      closeBook();
      setShowManage(false);
      setSel(0);
      showToast('已删除');
    } catch (error) {
      console.warn('[藏书] 删除失败：', error);
      showToast('没能删除，请再试一次。');
    }
  };

  /* ------------------------------ 渲染数据 ------------------------------ */

  const openBook = () => {
    if (!current || !current.hasFile) return;
    setOpening(true);
    setOpened(false);
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setOpened(true);
    }, 1000);
  };



  // 顶部弥散色：有书时取这本书的封面色，再和主题底色调和（深色主题下自动变暗）；
  // 空书架时直接用主题自己的弥散色，不再是固定的米黄色。
  const tintSource = current ? pickCoverStyle(current.title).tint : 'var(--bg-blob-1)';
  const tint = `color-mix(in srgb, ${tintSource} 70%, var(--bg-main))`;
  const fill = current ? pickCoverStyle(current.title).fill : 'var(--text-muted)';

  const whereLabel = !current
    ? ''
    : !current.hasFile
      ? '文件已清理'
      : current.progress > 0
        ? `读到 ${current.toc?.[current.lastChapterIndex]?.title || '上次的位置'}`
        : `共 ${current.chapterCount} 章`;

  const ctaLabel = !current
    ? ''
    : !current.hasFile
      ? '文件已清理'
      : current.progress > 0
        ? '继续阅读'
        : '开始阅读';

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".epub,.txt,application/epub+zip,text/plain"
      className="mn-lib-file"
      onChange={handleFileChosen}
      tabIndex={-1}
      aria-hidden="true"
    />
  );

  const importButton = (
    <button
      type="button"
      className="mn-lib-import"
      onClick={() => fileInputRef.current?.click()}
      disabled={importing}
    >
      <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
      {importing ? '正在读……' : '导入'}
    </button>
  );

  const footer = (
    <div className="mn-lib-footer">
      本机已存 {stats.count} 本，共 {formatBytes(stats.fileBytes)}
      。清理某本书的文件后，批注与留言仍会保留。
    </div>
  );

  return (
    <div className="mn-lib-root">
      {hiddenInput}

      {/* 顶部弥散色挂在整页根节点上，横向铺满整个视口；内容列在它上面居中 */}
      <div className="mn-lib__tint" style={{ background: tint }} />
      <div className="mn-lib__fade" />

      <div className="mn-lib">
        <button
          type="button"
          className="mn-lib-back"
          onClick={onBack}
          aria-label="返回"
        >
          <ArrowLeft size={20} strokeWidth={1.8} />
        </button>
        <div className="mn-lib-heading">页边注 · 藏书</div>
        {importButton}

        {loading ? (
          <div className="mn-lib-empty">正在翻书架……</div>
        ) : !current ? (
          <div className="mn-lib-empty">
            <BookOpen size={30} strokeWidth={1.4} aria-hidden="true" />
            <div className="mn-lib-empty__title">书架还是空的</div>
            <div className="mn-lib-empty__text">
              点右上角「导入」，选一本 epub 或 txt 放进来。
            </div>
          </div>
        ) : (
          <>
            <div className="mn-lib-stage">
              {books.map((book, index) => {
                const offset = index - sel;
                const distance = Math.abs(offset);
                const isCurrent = distance === 0;
                const cjk = hasCjk(book.title);
                const palette = pickCoverStyle(book.title);
                const percent = Math.max(0, Math.min(100, book.progress || 0));

                return (
                  <button
                    key={book.id}
                    type="button"
                    className="mn-lib-book"
                    aria-label={book.title}
                    onClick={() => {
                      // 书已经翻开放大了：点书本身就进入阅读，和「进入阅读」按钮一样
                      if (isCurrent && opened) {
                        onOpenReader(book.id);
                        return;
                      }
                      closeBook();
                      setSel(index);
                    }}
                    style={{
                      // 点「继续阅读」后书放大一圈（并往下沉一点，占住下面淡出的书名位置）
                      transform: `translateX(${offset * 152}px) translateY(${
                        isCurrent && opening ? 22 : 0
                      }px) perspective(900px) rotateY(${
                        isCurrent ? 0 : -offset * 26
                      }deg) scale(${isCurrent ? (opening ? 1.22 : 1) : 0.72})`,
                      opacity: isCurrent
                        ? 1
                        : distance === 1 && !opening
                          ? 0.92
                          : 0,
                      zIndex: 10 - distance,
                      pointerEvents: isCurrent || distance === 1 ? 'auto' : 'none',
                    }}
                  >
                    <span
                      className="mn-lib-page"
                      style={{
                        fontFamily: cjk ? SERIF_CJK : SERIF_LATIN,
                        fontSize: cjk ? 11.5 : 10.5,
                        opacity: isCurrent ? 1 : 0,
                      }}
                    >
                      {book.preview || book.title}
                    </span>

                    <span
                      className="mn-lib-cover"
                      style={{
                        background: book.cover ? '#FBFAF6' : palette.cover,
                        transform: `perspective(900px) rotateY(${
                          isCurrent && opening ? -158 : 0
                        }deg)`,
                      }}
                    >
                      <span className="mn-lib-cover__spine" />
                      <BookCover book={book} />
                    </span>

                    <span
                      className="mn-lib-glass"
                      style={{
                        transform: `translateY(${isCurrent && opening ? 46 : 0}px)`,
                        opacity: isCurrent && opening ? 0 : 1,
                      }}
                    >
                      <span className="mn-lib-glass__pct">
                        {percent === 0 ? '未开始' : `已读 ${percent}%`}
                      </span>
                      <span className="mn-lib-glass__bar">
                        <span style={{ width: `${percent}%` }} />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mn-lib-caption" style={{ opacity: opening ? 0 : 1 }}>
              <div className="mn-lib-caption__title">{current.title}</div>
              <div className="mn-lib-caption__author">
                {current.author || '佚名'}
              </div>
              <div className="mn-lib-caption__meta">
                <span className="mn-lib-chip">
                  {String(current.format).toUpperCase()}
                </span>
                <span>{whereLabel}</span>
                <button
                  type="button"
                  className="mn-lib-room"
                  onClick={() => setShowPicker(true)}
                  aria-label={`绑定的聊天室：${roomLabel}，点击更换`}
                >
                  <MessageSquare size={12} strokeWidth={1.9} aria-hidden="true" />
                  {roomLabel}
                </button>
              </div>
            </div>

            <div className="mn-lib-actions">
              <button
                type="button"
                className="mn-lib-cta"
                onClick={openBook}
                disabled={!current.hasFile}
                style={{
                  opacity: opening ? 0 : 1,
                  pointerEvents: opening ? 'none' : 'auto',
                }}
              >
                <span className="mn-lib-cta__icon">
                  <BookOpen size={20} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="mn-lib-cta__label">{ctaLabel}</span>
              </button>

              <button
                type="button"
                className="mn-lib-cta mn-lib-cta--enter"
                 onClick={() => onOpenReader(current.id)}
                style={{
                  opacity: opened ? 1 : 0,
                  pointerEvents: opened ? 'auto' : 'none',
                }}
                tabIndex={opened ? 0 : -1}
              >
                <span className="mn-lib-cta__icon">
                  <BookOpen size={20} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="mn-lib-cta__label">进入阅读</span>
              </button>

              <button
                type="button"
                className="mn-lib-textbtn mn-lib-textbtn--close"
                onClick={closeBook}
                style={{
                  opacity: opened ? 1 : 0,
                  pointerEvents: opened ? 'auto' : 'none',
                }}
                tabIndex={opened ? 0 : -1}
              >
                合上这本书
              </button>

              <button
                type="button"
                className="mn-lib-textbtn mn-lib-textbtn--manage"
                onClick={() => setShowManage(true)}
                style={{ opacity: opening ? 0 : 1, pointerEvents: opening ? 'none' : 'auto' }}
              >
                管理这本书
              </button>
            </div>

                        <ReadingStatsPanel bookId={current.id} fill={fill} />
          </>
        )}

        {footer}
      </div>

      {importing && (
        <div className="mn-lib-busy" role="status">
          正在读这本书……
        </div>
      )}

      {pending && (
        <ImportSheet
          parsed={pending}
          chats={chats}
          charactersById={charactersById}
          busy={saving}
          onCancel={() => setPending(null)}
          onConfirm={handleConfirmImport}
        />
      )}

      {showManage && current && !showPicker && (
        <ManageSheet
          book={current}
          roomLabel={roomLabel}
          onClose={() => setShowManage(false)}
          onChangeChat={() => setShowPicker(true)}
          onClearFile={handleClearFile}
          onDelete={handleDelete}
        />
      )}

      {showPicker && current && (
        <ChatPickerSheet
          book={current}
          chats={chats}
          charactersById={charactersById}
          onClose={() => setShowPicker(false)}
          onPick={handlePickChat}
        />
      )}

      {toast && (
        <div className="mn-lib-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}