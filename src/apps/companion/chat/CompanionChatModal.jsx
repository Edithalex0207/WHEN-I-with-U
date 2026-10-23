import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Send, X } from 'lucide-react';

import {
  CHAT_MAX_INPUT_CHARS,
  clearChatMessages,
  describeChatResetTime,
  getRecentChatMessages,
  purgeStaleChatMessages,
  rerollCompanionChatReply,
  sendCompanionChatMessage,
} from './companionChatService';
import './companionChat.css';

/*
 * 和小伙伴聊天的弹窗（可爱版，样式见 companionChat.css 和视觉参考 v2）。
 *
 * 渲染在 CompanionPage.jsx 的 .cp-root 里，复用 companionPage.css 里已有
 * 的 .cp-overlay.center / .cp-backdrop，自己的样式全部在 companionChat.css
 * （class 前缀 ccm-），颜色走 --cp-* 变量。
 *
 * 数据读写、AI 调用、每日清空、重 roll 都在 companionChatService.js，
 * 这里只管界面状态：
 *   messages   当前显示的消息（含刚发出、还没从库里读回来的 user 消息）
 *   sending    正在等小伙伴回复
 *   rerolling  正在重新生成最后一组回复
 *   errorText  最近一次失败的提示（已有的消息都保留在列表里）
 *
 * 聊天记录每天清空一次：列表最上面的便利贴负责提醒 user；真正的清空
 * 在 service 里做（打开弹窗时，以及发送/重 roll 之前）。
 */
const CompanionChatModal = ({ companion, character, chatId, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const listRef = useRef(null);

  const companionName = companion?.name || '小伙伴';
  const busy = sending || rerolling;

  // 打开弹窗：先清掉昨天及更早的消息，再读今天的。
  useEffect(() => {
    let cancelled = false;
    if (!companion?.id) return undefined;
    purgeStaleChatMessages(companion.id)
      .catch((error) => console.warn('[CompanionChat] 清理过期聊天记录失败:', error))
      .then(() => getRecentChatMessages(companion.id))
      .then((rows) => { if (!cancelled) setMessages(rows); })
      .catch((error) => console.warn('[CompanionChat] 读取聊天记录失败:', error));
    return () => { cancelled = true; };
  }, [companion?.id]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending, rerolling]);

  // 发送/重 roll 之前 service 发现弹窗跨过了零点、清掉了过期消息时，整个列表重读一遍。
  const reloadMessages = async () => {
    const rows = await getRecentChatMessages(companion.id);
    setMessages(rows);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || busy || !companion?.id) return;

    setErrorText('');
    setConfirmClear(false);
    setSending(true);
    setDraft('');

    // 先把 user 这条放进界面，不用等 AI 回来。
    const optimistic = {
      id: `local-${Date.now()}`,
      companionId: companion.id,
      sender: 'user',
      content: text.slice(0, CHAT_MAX_INPUT_CHARS),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { replies, purged } = await sendCompanionChatMessage({ companion, character, chatId, text });
      if (purged > 0) {
        await reloadMessages();
      } else {
        setMessages((prev) => [...prev, ...replies]);
      }
    } catch (error) {
      setErrorText(error?.message || '发送失败，请再试一次。');
    } finally {
      setSending(false);
    }
  };

  const handleReroll = async () => {
    if (busy || !companion?.id) return;

    setErrorText('');
    setConfirmClear(false);
    setRerolling(true);

    try {
      const { removedIds, replies, purged } = await rerollCompanionChatReply({ companion, character, chatId });
      if (purged > 0) {
        await reloadMessages();
      } else {
        const removed = new Set(removedIds);
        setMessages((prev) => [...prev.filter((msg) => !removed.has(msg.id)), ...replies]);
      }
    } catch (error) {
      setErrorText(error?.message || '重新生成失败，请再试一次。');
      // 可能是跨过零点被清空了，或者库里和界面不一致：失败后把列表对齐一次。
      try { await reloadMessages(); } catch (reloadError) { /* 对不齐就保持当前界面 */ }
    } finally {
      setRerolling(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    try {
      await clearChatMessages(companion.id);
      setMessages([]);
      setErrorText('');
    } catch (error) {
      setErrorText('清空失败，请再试一次。');
    } finally {
      setConfirmClear(false);
    }
  };

  const renderAvatar = (withBadge = false) => (
    <span className={`ccm-avatar-wrap${withBadge ? ' has-badge' : ''}`}>
      {companion?.avatarUrl
        ? <img className="ccm-avatar" src={companion.avatarUrl} alt="" />
        : <span className="ccm-avatar ccm-avatar-fallback">{Array.from(companionName)[0]}</span>}
    </span>
  );

  const lastMessage = messages[messages.length - 1];
  const canReroll = Boolean(lastMessage) && lastMessage.sender === 'companion';

  return (
    <div className="cp-overlay center ccm-overlay">
      <div className="cp-backdrop" onClick={onClose} />

      <div className="ccm-stage">
        <header className="ccm-header">
          {renderAvatar(true)}
          <div className="ccm-title">
            <b>{companionName}</b>
            <span>正在和你聊天</span>
          </div>
          <button
            type="button"
            className={`ccm-clear ${confirmClear ? 'is-confirm' : ''}`}
            onClick={handleClear}
            disabled={messages.length === 0 || busy}
          >
            {confirmClear ? '确定清空？' : '清空'}
          </button>
          <button type="button" className="ccm-close" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </header>

        <div className="ccm-list" ref={listRef}>
          <div className="ccm-notice">
            小伙伴的记性只有一天：聊天记录<b>每天{describeChatResetTime()}会清空一次</b>，
            想让它记住的话，记得明天再告诉它哦。
          </div>

          {messages.length === 0 && !sending && (
            <p className="ccm-empty">还没聊过天，和{companionName}说点什么吧。</p>
          )}

          {messages.map((msg, index) => {
            if (msg.sender === 'user') {
              return (
                <div key={msg.id} className="ccm-row is-user">
                  <div className="ccm-bubble">{msg.content}</div>
                </div>
              );
            }
            // 同一组连续的小伙伴气泡：只有最后一个显示头像和爱心贴纸，其余留空位。
            const next = messages[index + 1];
            const isLastOfGroup = !next || next.sender === 'user';
            return (
              <div key={msg.id} className="ccm-row is-companion">
                {isLastOfGroup ? renderAvatar() : <span className="ccm-avatar-spacer" />}
                <div className={`ccm-bubble${isLastOfGroup ? ' has-sticker' : ''}`}>{msg.content}</div>
              </div>
            );
          })}

          {sending && (
            <div className="ccm-row is-companion">
              {renderAvatar()}
              <div className="ccm-bubble ccm-typing">
                <i /><i /><i />
                {companionName}正在想
              </div>
            </div>
          )}

          {(canReroll || rerolling) && !sending && (
            <div className="ccm-reroll-row">
              <button
                type="button"
                className={`ccm-reroll${rerolling ? ' is-spinning' : ''}`}
                onClick={handleReroll}
                disabled={busy}
              >
                <RefreshCw size={14} strokeWidth={2.6} />
                {rerolling ? '重新想想中' : '再说一次'}
              </button>
            </div>
          )}
        </div>

        {errorText && <p className="ccm-error">{errorText}</p>}

        <div className="ccm-composer">
          <textarea
            className="ccm-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`对${companionName}说点什么`}
            maxLength={CHAT_MAX_INPUT_CHARS}
            rows={1}
            disabled={busy}
          />
          <button
            type="button"
            className="ccm-send"
            onClick={handleSend}
            disabled={busy || !draft.trim()}
            aria-label="发送"
          >
            <Send size={16} strokeWidth={2.6} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompanionChatModal;