import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Send,
  Sparkles,
  LogOut,
  Image as ImageIcon,
  User,
  CloudSun,
  Smile,
  Quote,
  ChevronDown,
  Pencil,
  Check,
  Package,
} from 'lucide-react';

import db from '../../db';
import MessageList from '../messages/components/MessageList'
import { triggerOfflineAiResponse, rerollOfflineAiResponse, subscribeOfflineAiEvents } from '../../services/offlineAiService';
import { getOfflineSession, completeOfflineSession } from './offlineSessionService';
import { maybeUpdateOfflineSceneStatus } from './offlineSceneStatusService';
import OfflineSceneSettingsSheet from './OfflineSceneSettingsSheet';

// 气泡样式：和线上 ChatRoom.jsx 里的 defaultCss 保持同一套苹果 Message 观感
// （圆角气泡 + 尖角、accent 色发送气泡、柔和灰色接收气泡）。
// 这里独立复制一份而不是从 ChatRoom.jsx 里导入，
// 避免线下聊天室的改动牵连到线上聊天室的渲染逻辑。
// 如果这个聊天窗在线上设置了 customCss，线下也会沿用同一份自定义气泡样式，
// 保证同一个角色在线上线下的聊天气泡观感一致。
const DEFAULT_BUBBLE_CSS = `
  .user-bubble {
    background: var(--accent-color);
    color: var(--accent-foreground);
    border-radius: 1.25rem 1.25rem 0.25rem 1.25rem;
  }

  .ai-bubble {
    background: var(--control-soft-bg);
    color: var(--text-main);
    border: 1px solid var(--card-border);
    border-radius: 1.25rem 1.25rem 1.25rem 0.25rem;
  }

  .chat-font {
    font-size: 0.75rem;
    line-height: 1.5;
  }
`;

const OfflineChatRoom = ({ chatId, offlineSessionId, onBack, readonly = false }) => {
  const [session, setSession] = useState(null);
  const [chat, setChat] = useState(null);
  const [character, setCharacter] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [showSceneSettings, setShowSceneSettings] = useState(false);
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  const [isEditingSignature, setIsEditingSignature] = useState(false);
  const [signatureDraft, setSignatureDraft] = useState('');
  const [quotedMsg, setQuotedMsg] = useState(null);

  const scrollAreaRef = useRef(null);
  const hasScrolledToLatestRef = useRef(false);
  const signatureInputRef = useRef(null);

  const isReadonly = readonly || session?.status === 'completed';

  const loadData = useCallback(async () => {
    const [sessionRecord, chatRecord] = await Promise.all([
      getOfflineSession(offlineSessionId),
      db.chats.get(chatId),
    ]);

    if (!sessionRecord || !chatRecord) return;

    const charRecord = await db.characters.get(chatRecord.characterId);

    setChat(chatRecord);
    if (charRecord) setCharacter(charRecord);

    const allMsgs = await db.messages.where('chatId').equals(chatId).sortBy('timestamp');

    const offlineMsgs = allMsgs.filter((m) => (
      m.mode === 'offline' && m.offlineSessionId === offlineSessionId
    ));

    setMessages(offlineMsgs);
    setSession(sessionRecord);

    // 每 10 条线下消息，静默刷新一次场景状态栏（心情/天气/内心独白）。
    // 不阻塞当前渲染：生成完成后重新拉一次 session 更新状态栏展示。
    if (charRecord && sessionRecord.status !== 'completed') {
      void maybeUpdateOfflineSceneStatus({
        chatId,
        offlineSessionId,
        session: sessionRecord,
        character: charRecord,
        offlineMessages: offlineMsgs,
      }).then((updatedFields) => {
        if (updatedFields) {
          setSession((previous) => (previous ? { ...previous, ...updatedFields } : previous));
        }
      });
    }
  }, [chatId, offlineSessionId]);

  useEffect(() => {
    setIsAiTyping(false);
    void loadData();

    const unsubscribe = subscribeOfflineAiEvents((event) => {
      if (String(event.offlineSessionId) !== String(offlineSessionId)) return;

      if (event.type === 'AI_TYPING_START') {
        setIsAiTyping(true);
        return;
      }

      if (event.type === 'AI_TYPING_END') {
        setIsAiTyping(false);
        return;
      }

      if (event.type === 'NEW_MESSAGE') {
        setIsAiTyping(false);
        void loadData();
      }
    });

    return () => unsubscribe();
  }, [offlineSessionId, loadData]);

  useLayoutEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    scrollArea.scrollTo({
      top: scrollArea.scrollHeight,
      behavior: hasScrolledToLatestRef.current ? 'smooth' : 'auto',
    });

    hasScrolledToLatestRef.current = true;
  }, [messages, isAiTyping]);

  useEffect(() => {
    if (isEditingSignature) {
      signatureInputRef.current?.focus();
    }
  }, [isEditingSignature]);

  const messagesById = new Map(messages.map((m) => [m.id, m]));

  const bubbleCss = useMemo(() => (
    chat?.customCss || DEFAULT_BUBBLE_CSS
  ), [chat?.customCss]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || isReadonly) return;

    const nowIso = new Date().toISOString();
    const userAvatar = chat?.userAvatar || character?.userAvatar || '';
    const userName = chat?.userName || character?.userName || '你';

    const newMsg = {
      chatId,
      characterId: character?.id,
      mode: 'offline',
      offlineSessionId,
      sender: 'user',
      type: 'text',
      content: inputText.trim(),
      metadata: {},
      userAvatar,
      userName,
      quotedMessageId: quotedMsg?.id || null,
      isRead: true,
      timestamp: nowIso,
    };

    const msgId = await db.messages.add(newMsg);
    newMsg.id = msgId;

    setMessages((previous) => [...previous, newMsg]);
    setInputText('');
    setQuotedMsg(null);

    await db.chats.update(chatId, { updatedAt: nowIso });
  };

  const handleRerollMessage = useCallback((messageId) => {
    if (isAiTyping) return;
    void rerollOfflineAiResponse(chatId, offlineSessionId, messageId);
  }, [isAiTyping, chatId, offlineSessionId]);

  const handleSwitchVersion = useCallback(async (msg, direction) => {
    if (!msg.versions || msg.versions.length <= 1) return;

    const currentIndex = msg.currentVersionIndex ?? (msg.versions.length - 1);
    const nextIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;

    if (nextIndex < 0 || nextIndex >= msg.versions.length) return;

    const targetVersion = msg.versions[nextIndex];

    await db.messages.update(msg.id, {
      currentVersionIndex: nextIndex,
      type: targetVersion.type,
      content: targetVersion.content,
      metadata: targetVersion.metadata || {},
    });

    await loadData();
  }, [loadData]);

  const handleDeleteMessage = useCallback(async (messageId) => {
    await db.messages.delete(messageId);

    setMessages((previous) => previous.filter((message) => message.id !== messageId));
  }, []);

  const handleTriggerAi = () => {
    if (!character || isAiTyping || isReadonly) return;
    void triggerOfflineAiResponse(chatId, offlineSessionId);
  };

  const handleEndSession = async () => {
    if (session?.status !== 'completed') {
      await completeOfflineSession(offlineSessionId);
    }
    onBack?.();
  };

  const handleSaveSignature = async () => {
    const trimmed = signatureDraft.trim();
    setIsEditingSignature(false);
    if (!chat?.id || trimmed === (chat?.offlineSignature || '')) return;

    await db.chats.update(chatId, { offlineSignature: trimmed });
    setChat((previous) => (previous ? { ...previous, offlineSignature: trimmed } : previous));
  };

  if (!session || !chat) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-[var(--bg-main)] text-[var(--text-main)]">
        <p className="text-sm">正在进入场景...</p>
      </div>
    );
  }

  const offlineBgImage = chat?.offlineBgImage || '';
  const offlineBgOpacity = chat?.offlineBgOpacity ?? 0.3;
  const offlineIsBgDimmed = chat?.offlineIsBgDimmed ?? true;

   const hasSceneStatus = Boolean(
    session.sceneMood || session.sceneWeather || session.sceneMonologue ||
    (Array.isArray(session.sceneProps) && session.sceneProps.length > 0)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden text-left text-xs animate-fade-in-up"
      style={{ background: 'var(--bg-main)', color: 'var(--text-main)' }}
    >
      <style>{bubbleCss}</style>

      {offlineBgImage && (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${offlineBgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          />
          {offlineIsBgDimmed && (
            <div
              className="absolute inset-0"
              style={{
                background: 'var(--bg-main)',
                opacity: 1 - offlineBgOpacity,
              }}
            />
          )}
        </div>
      )}

      {/* header 完全透明，不做整条底色/模糊，只有按钮、头像、签名、状态胶囊各自带底色 */}
      <header className="z-20 shrink-0 px-4 pb-3 pt-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center rounded-full p-2 opacity-85 shadow-sm transition-transform hover:opacity-100 active:scale-90"
            style={{ background: 'var(--control-soft-bg)', color: 'var(--text-main)' }}
            aria-label="返回"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            {!isReadonly && (
              <button
                type="button"
                onClick={() => setShowSceneSettings(true)}
                className="flex items-center justify-center rounded-full p-2 opacity-85 shadow-sm transition-transform hover:opacity-100 active:scale-90"
                style={{ background: 'var(--control-soft-bg)', color: 'var(--text-main)' }}
                aria-label="场景背景设置"
                title="场景背景设置"
              >
                <ImageIcon className="h-3.5 w-3.5" />
              </button>
            )}

            {!isReadonly ? (
              <button
                type="button"
                onClick={handleEndSession}
                className="flex items-center gap-1 rounded-full px-3 py-2 text-[10px] font-semibold opacity-85 shadow-sm transition-transform hover:opacity-100 active:scale-95"
                style={{ background: 'var(--control-soft-bg)', color: 'var(--text-main)' }}
              >
                <LogOut className="h-3.5 w-3.5" />
                结束
              </button>
            ) : (
              <div className="w-9" />
            )}
          </div>
        </div>

        {/* 沉浸式大头像（只放角色自己的，不叠加 user 头像）+ 可编辑签名 */}
        <div className="mt-1 flex flex-col items-center">
          <div
            className="flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-full border-[3px] shadow-lg transition-transform active:scale-95"
            style={{ background: 'var(--control-soft-bg)', borderColor: 'var(--bg-main)' }}
          >
            {character?.avatar ? (
              <img src={character.avatar} alt={character?.name || '对方'} className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <User className="h-7 w-7 opacity-40" />
            )}
          </div>

          <div className="mt-2 max-w-[80%]">
            {isEditingSignature ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={signatureInputRef}
                  value={signatureDraft}
                  onChange={(event) => setSignatureDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleSaveSignature();
                    }
                  }}
                  onBlur={handleSaveSignature}
                  maxLength={40}
                  placeholder="写一句这个场景的签名…"
                  className="w-40 rounded-full border bg-transparent px-3 py-1 text-center text-[11px] outline-none"
                  style={{ borderColor: 'var(--card-border)', color: 'var(--text-main)' }}
                />
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={handleSaveSignature}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
                  style={{ background: 'var(--accent-color)', color: 'var(--accent-foreground)' }}
                >
                  <Check className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (isReadonly) return;
                  setSignatureDraft(chat?.offlineSignature || '');
                  setIsEditingSignature(true);
                }}
                className="flex items-center gap-1 text-[11px] italic opacity-70 transition-opacity hover:opacity-100"
              >
                <span className="truncate">
                  {chat?.offlineSignature || (isReadonly ? '这次见面的签名还是空的' : '点这里，给这个场景写一句签名…')}
                </span>
                {!isReadonly && <Pencil className="h-2.5 w-2.5 shrink-0 opacity-50" />}
              </button>
            )}
          </div>

          <span className="mt-0.5 text-[10px] font-semibold opacity-60">
            {session.sceneLabel}
            {isReadonly ? ' · 已结束' : ''}
          </span>

          {/* 状态栏按钮常驻显示，不管有没有内容都能点开——避免用户找不到入口 */}
          <button
            type="button"
            onClick={() => setShowStatusPanel((previous) => !previous)}
            className="mt-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium shadow-sm transition-transform active:scale-95"
            style={{ background: 'var(--control-soft-bg)', color: 'var(--text-main)' }}
          >
            <Sparkles className="h-3 w-3" style={{ color: 'var(--accent-color)' }} />
            <span>所思所想</span>
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-300 ${showStatusPanel ? 'rotate-180' : ''}`}
            />
          </button>

          {showStatusPanel && (
            <div
              className="mt-2 w-full max-w-[280px] space-y-1.5 rounded-2xl px-3 py-2 shadow-sm backdrop-blur-md animate-fade-in-up"
              style={{ background: 'var(--control-soft-bg)', border: '1px solid var(--card-border)' }}
            >
              {session.sceneDescription && (
                <div className="truncate text-[10px] opacity-70">
                  {session.sceneDescription}
                </div>
              )}

              {hasSceneStatus ? (
                <>
                  <div className="flex items-center justify-center gap-3 text-[10px]">
                    {session.sceneWeather && (
                      <span className="flex items-center gap-1 opacity-80">
                        <CloudSun className="h-3 w-3" style={{ color: 'var(--accent-color)' }} />
                        {session.sceneWeather}
                      </span>
                    )}

                    {session.sceneMood && (
                      <span className="flex items-center gap-1 opacity-80">
                        <Smile className="h-3 w-3" style={{ color: 'var(--accent-color)' }} />
                        {session.sceneMood}
                      </span>
                    )}
                  </div>

                                    {session.sceneMonologue && (
                    <div className="flex items-start gap-1 text-[10px] italic opacity-60">
                      <Quote className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{session.sceneMonologue}</span>
                    </div>
                  )}

                  {Array.isArray(session.sceneProps) && session.sceneProps.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {session.sceneProps.map((prop, index) => (
                        <span
                          key={`${prop}-${index}`}
                          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] opacity-80"
                          style={{ background: 'var(--card-bg-gradient)' }}
                        >
                          <Package className="h-2.5 w-2.5" style={{ color: 'var(--accent-color)' }} />
                          {prop}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                !session.sceneDescription && (
                  <div className="py-1 text-center text-[10px] opacity-50">
                    还没有更新，再聊几句之后（每 10 条消息）会自动刷新心情 / 天气 / 内心独白
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </header>

      <section
        ref={scrollAreaRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 no-scrollbar"
      >
        <MessageList
          visibleMessages={messages}
          messagesById={messagesById}
          character={character}
          activeUserAvatar={chat?.userAvatar || character?.userAvatar || ''}
          activeUserName={chat?.userName || character?.userName || '你'}
          isAiTyping={isAiTyping}
          mcpTrace={null}
          typingText={`${character?.name || '对方'} 正在回应...`}
          typingStyle="default"
          hasMoreOlderMessages={false}
                   onReroll={handleRerollMessage}
          onDelete={handleDeleteMessage}
          onQuote={setQuotedMsg}
          onSwitchVersion={handleSwitchVersion}
          onResolvedInteraction={loadData}
          onEnterOfflineScene={() => {}}
        />
      </section>

      {!isReadonly && (
               <footer
          className="z-20 shrink-0 px-4 pt-1"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
        >
          {quotedMsg && (
            <div
              className="mb-2 flex items-start justify-between rounded-2xl p-2 px-3 text-[10px] shadow-md"
              style={{
                background: 'var(--control-soft-bg)',
                color: 'var(--text-main)',
              }}
            >
              <div
                className="pr-2"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                }}
              >
                <span className="font-bold">
                  引用 {quotedMsg.sender === 'user'
                    ? (chat?.userName || character?.userName || '你')
                    : character?.name}:
                </span>{' '}
                {quotedMsg.content}
              </div>

              <button
                type="button"
                onClick={() => setQuotedMsg(null)}
                className="shrink-0 p-1 opacity-60 hover:opacity-100"
              >
                &times;
              </button>
            </div>
          )}

          <div
            className="flex items-center gap-2 rounded-full px-3 py-2 shadow-2xl backdrop-blur-2xl"
            style={{ background: 'var(--card-bg-gradient)', color: 'var(--text-main)' }}
          >
            <textarea
              rows={1}
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSendMessage();
                }
              }}
              placeholder={`在这个场景里，对 ${character?.name || '对方'} 说些什么...`}
              className="max-h-40 w-full resize-none bg-transparent text-xs leading-relaxed outline-none"
              style={{ color: 'var(--text-main)', minHeight: '24px' }}
            />

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={handleSendMessage}
                className="rounded-full p-2 transition-transform hover:opacity-90 active:scale-90"
                style={{ background: 'var(--control-soft-bg)', color: 'var(--text-main)' }}
                title="发送"
              >
                <Send className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={handleTriggerAi}
                disabled={isAiTyping}
                className="flex items-center gap-1 rounded-full px-3.5 py-2 text-[10px] font-semibold shadow-sm disabled:opacity-50"
                style={{ background: 'var(--accent-color)', color: 'var(--accent-foreground)' }}
                title="触发回应"
              >
                <Sparkles className="h-3 w-3" />
                <span>回应</span>
              </button>
            </div>
          </div>
        </footer>
      )}

      {showSceneSettings && (
        <OfflineSceneSettingsSheet
          chat={chat}
          onClose={() => setShowSceneSettings(false)}
          onUpdated={(patch) => setChat((previous) => ({ ...previous, ...patch }))}
        />
      )}
    </div>
  );
};

export default OfflineChatRoom;