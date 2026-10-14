// src/apps/margin-notes/library/LibrarySheets.jsx
//
// 藏书页用到的几个底部弹层：导入确认（改书名作者 + 选聊天室）、换绑聊天室、管理这本书。
// 样式都在 readerLibrary.css 里（mn-lib- 开头）。

import React, { useState } from 'react';
import { Check, MessageSquare, Trash2, X } from 'lucide-react';

import { formatBytes } from './readerLibraryService';

/**
 * 把一个聊天室描述成界面上要显示的文字：角色名 + 聊天室标题。
 */
export const describeChat = (chat, charactersById) => {
  const character = chat ? charactersById[chat.characterId] : null;
  const name = character?.name || '未知角色';
  return {
    name,
    sub: chat?.title || `和${name}的聊天`,
    avatar: character?.avatar || '',
    initial: Array.from(name)[0] || '?',
  };
};

function SheetShell({ title, onClose, children, labelId }) {
  return (
    <div
      className="mn-lib-sheet-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="mn-lib-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mn-lib-sheet__head">
          <span id={labelId} className="mn-lib-sheet__title">
            {title}
          </span>
          <button
            type="button"
            className="mn-lib-sheet__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

/**
 * 聊天室单选列表。selectedId 为 null 表示「暂不绑定」。
 */
export function ChatChoiceList({ chats, charactersById, selectedId, onSelect }) {
  return (
    <div className="mn-lib-choice" role="radiogroup" aria-label="选择聊天室">
      {chats.map((chat) => {
        const info = describeChat(chat, charactersById);
        const active = chat.id === selectedId;
        return (
          <button
            key={chat.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={`mn-lib-choice__item${active ? ' is-active' : ''}`}
            onClick={() => onSelect(chat.id)}
          >
            <span className="mn-lib-choice__avatar">
              {info.avatar ? (
                <img src={info.avatar} alt="" />
              ) : (
                info.initial
              )}
            </span>
            <span className="mn-lib-choice__text">
              <b>{info.name}</b>
              <small>{info.sub}</small>
            </span>
            {active && <Check size={16} strokeWidth={2.2} aria-hidden="true" />}
          </button>
        );
      })}

      <button
        type="button"
        role="radio"
        aria-checked={selectedId === null}
        className={`mn-lib-choice__item${selectedId === null ? ' is-active' : ''}`}
        onClick={() => onSelect(null)}
      >
        <span className="mn-lib-choice__avatar mn-lib-choice__avatar--none">
          <MessageSquare size={15} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="mn-lib-choice__text">
          <b>暂不绑定</b>
          <small>先自己读，之后可以在藏书页再选</small>
        </span>
        {selectedId === null && (
          <Check size={16} strokeWidth={2.2} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/**
 * 导入确认：解析成功之后弹出，确认书名、作者、绑定哪个聊天室。
 * parsed：parseBookFile 的返回值；onConfirm({ title, author, chatId })。
 */
export function ImportSheet({
  parsed,
  chats,
  charactersById,
  busy,
  onCancel,
  onConfirm,
}) {
  const [title, setTitle] = useState(parsed.title || '');
  const [author, setAuthor] = useState(parsed.author || '');
  const [chatId, setChatId] = useState(chats[0]?.id ?? null);

  const charCount = parsed.chapters.reduce(
    (sum, chapter) => sum + chapter.text.length,
    0
  );
  const sizeLabel =
    charCount >= 10000
      ? `约 ${(charCount / 10000).toFixed(1)} 万字`
      : `约 ${charCount} 字`;

  return (
    <SheetShell
      title="放进书架"
      onClose={busy ? () => {} : onCancel}
      labelId="mn-lib-import-title"
    >
      <div className="mn-lib-sheet__body">
        <div className="mn-lib-sheet__meta">
          {parsed.format.toUpperCase()} · 共 {parsed.chapters.length} 章 ·{' '}
          {sizeLabel}
        </div>

        <label className="mn-lib-field">
          <span>书名</span>
          <input
            type="text"
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="mn-lib-field">
          <span>作者</span>
          <input
            type="text"
            value={author}
            maxLength={60}
            placeholder="可以留空"
            onChange={(event) => setAuthor(event.target.value)}
          />
        </label>

        <div className="mn-lib-field">
          <span>绑定聊天室</span>
          <div className="mn-lib-field__hint">
            读书时的批注和留言会发到这个聊天室，一本书只绑一个。
          </div>
        </div>

        <ChatChoiceList
          chats={chats}
          charactersById={charactersById}
          selectedId={chatId}
          onSelect={setChatId}
        />
      </div>

      <div className="mn-lib-sheet__actions">
        <button
          type="button"
          className="mn-lib-btn mn-lib-btn--ghost"
          onClick={onCancel}
          disabled={busy}
        >
          取消
        </button>
        <button
          type="button"
          className="mn-lib-btn mn-lib-btn--solid"
          disabled={busy || !title.trim()}
          onClick={() =>
            onConfirm({ title: title.trim(), author: author.trim(), chatId })
          }
        >
          {busy ? '正在存……' : '放进书架'}
        </button>
      </div>
    </SheetShell>
  );
}

/**
 * 换绑聊天室。
 */
export function ChatPickerSheet({
  book,
  chats,
  charactersById,
  onClose,
  onPick,
}) {
  return (
    <SheetShell
      title={`《${book.title}》绑定的聊天室`}
      onClose={onClose}
      labelId="mn-lib-picker-title"
    >
      <div className="mn-lib-sheet__body">
        <ChatChoiceList
          chats={chats}
          charactersById={charactersById}
          selectedId={book.chatId ?? null}
          onSelect={onPick}
        />
      </div>
    </SheetShell>
  );
}

/**
 * 管理这本书：换聊天室、清理文件、删除。
 */
export function ManageSheet({
  book,
  roomLabel,
  onClose,
  onChangeChat,
  onClearFile,
  onDelete,
}) {
  return (
    <SheetShell
      title={`管理《${book.title}》`}
      onClose={onClose}
      labelId="mn-lib-manage-title"
    >
      <div className="mn-lib-sheet__body">
        <button
          type="button"
          className="mn-lib-row"
          onClick={onChangeChat}
        >
          <MessageSquare size={17} strokeWidth={1.8} aria-hidden="true" />
          <span className="mn-lib-row__text">
            <b>更换聊天室</b>
            <small>现在绑定：{roomLabel}</small>
          </span>
        </button>

        <button
          type="button"
          className="mn-lib-row"
          onClick={onClearFile}
          disabled={!book.hasFile}
        >
          <Trash2 size={17} strokeWidth={1.8} aria-hidden="true" />
          <span className="mn-lib-row__text">
            <b>清理这本书的文件</b>
            <small>
              {book.hasFile
                ? `释放 ${formatBytes(book.fileBytes)}，书的信息和批注留言会保留`
                : '文件已经清理过了'}
            </small>
          </span>
        </button>

        <button
          type="button"
          className="mn-lib-row mn-lib-row--danger"
          onClick={onDelete}
        >
          <X size={17} strokeWidth={1.8} aria-hidden="true" />
          <span className="mn-lib-row__text">
            <b>删除这本书</b>
            <small>书和以后的批注留言都会一起删掉，不能恢复</small>
          </span>
        </button>
      </div>
    </SheetShell>
  );
}