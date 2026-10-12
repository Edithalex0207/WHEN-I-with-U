import db from '../db';
import {
  fetchAiCompletionWithTools,
  buildHistoryContext,
  parseAiResponseToMessages,
  playMessageSound,
} from './aiService';
import { buildOfflineSystemPrompt } from './offlineSystemPrompt';
import {
  getChatMemoryContext,
  getCharacterEmotionContext,
  scheduleMemoryProcessing,
} from './memoryProvider';
import { markCharacterInteraction } from '../apps/memory/memoryCharacterState';
import { runAiToolOrchestrator } from './aiToolOrchestrator';
import { requestMcpToolApproval } from './mcp/mcpApprovalCoordinator';
import {
  createMcpChatTraceSession,
  getMcpChatTraceSummary,
} from './mcp/mcpChatTraceService';

const offlineListeners = new Set();
const activeOfflineAiRequests = new Set();

export const subscribeOfflineAiEvents = (callback) => {
  offlineListeners.add(callback);
  return () => offlineListeners.delete(callback);
};

const notifyOfflineListeners = (event) => {
  offlineListeners.forEach((cb) => cb(event));
};

const isDocumentVisible = () => (
  typeof document !== 'undefined' &&
  document.visibilityState === 'visible'
);

const getSafeChatMemoryContext = async ({ chatId, userText, recentMessages }) => {
  try {
    return await getChatMemoryContext({ chatId, userText, recentMessages });
  } catch (error) {
    console.warn('[OfflineAI] Memory context skipped safely:', error);
    return '';
  }
};

const getSafeCharacterEmotionContext = async ({ chatId, characterId }) => {
  try {
    return await getCharacterEmotionContext({ chatId, characterId });
  } catch (error) {
    console.warn('[OfflineAI] Emotion context skipped safely:', error);
    return '';
  }
};

const saveOfflineErrorMessage = async ({ chatId, offlineSessionId, character, result }) => {
  const nowIso = new Date().toISOString();

  return db.messages.add({
    chatId,
    characterId: character.id,
    mode: 'offline',
    offlineSessionId,
    sender: 'character',
    type: 'error',
    content: result.message,
    metadata: { errorCode: result.code, errorMessage: result.message },
    versions: [{
      type: 'error',
      content: result.message,
      metadata: { errorCode: result.code, errorMessage: result.message },
      errorCode: result.code,
      errorMessage: result.message,
      timestamp: nowIso,
    }],
    currentVersionIndex: 0,
    isRead: true,
    timestamp: nowIso,
  });
};

export const triggerOfflineAiResponse = async (chatId, offlineSessionId) => {
  if (!chatId || !offlineSessionId || activeOfflineAiRequests.has(offlineSessionId)) {
    return;
  }

  const offlineSession = await db.offlineSessions.get(offlineSessionId);
  if (!offlineSession || offlineSession.status !== 'active') return;

  const chat = await db.chats.get(chatId);
  if (!chat) return;

  const character = await db.characters.get(chat.characterId);
  if (!character) return;

  activeOfflineAiRequests.add(offlineSessionId);
  notifyOfflineListeners({ type: 'AI_TYPING_START', chatId, offlineSessionId });

  try {
    const apiSettings = await db.settings.get('apiConfig');
    const apiConfig = apiSettings?.value || {};

    const systemPrompt = await buildOfflineSystemPrompt({ character, chat, offlineSession });

    const sessionMessages = (await db.messages
      .where('chatId')
      .equals(chatId)
      .sortBy('timestamp'))
      .filter((m) => m.mode === 'offline' && m.offlineSessionId === offlineSessionId);

    const historyContext = buildHistoryContext(
      sessionMessages.filter((m) => m.type !== 'error').slice(-30)
    );

    const latestUserMessage = [...sessionMessages].reverse().find((m) => (
      m.sender === 'user' && m.type !== 'error' &&
      typeof m.content === 'string' && m.content.trim()
    ));

    // 记忆系统按 chatId 统一查询，线上线下共享同一份长期记忆，不需要额外适配。
    const memoryContext = await getSafeChatMemoryContext({
      chatId,
      userText: latestUserMessage?.content || '',
      recentMessages: sessionMessages,
    });

    const characterEmotionContext = await getSafeCharacterEmotionContext({
      chatId,
      characterId: character.id,
    });

    const finalSystemPrompt = `${systemPrompt}${memoryContext}${characterEmotionContext}`;

    const mcpTraceSession = createMcpChatTraceSession({ chatId, characterId: character.id });

      const result = await runAiToolOrchestrator({
      systemPrompt: finalSystemPrompt,
      historyContext,
      apiConfig,
      chatId,
      characterId: character.id,
      source: 'offline',
      requestAiCompletion: (args) =>
        fetchAiCompletionWithTools({ ...args, chatId, characterId: character.id }),
      requestToolApproval: requestMcpToolApproval,
      mcpTraceSession,
    });

    const nowIso = new Date().toISOString();
    let messageIds = [];
    let preview = '';

    if (result.error) {
      const errorMessageId = await saveOfflineErrorMessage({ chatId, offlineSessionId, character, result });
      messageIds = [errorMessageId];
      preview = '请求未成功抵达';

      notifyOfflineListeners({
        type: 'AI_RESPONSE_ERROR',
        chatId, offlineSessionId,
        characterId: character.id,
        characterName: character.name,
        message: result.message,
        errorCode: result.code,
      });
    } else {
      const parsedMessages = await parseAiResponseToMessages(result.content);
      const safeParsedMessages = parsedMessages.length > 0
        ? parsedMessages
        : [{ type: 'text', content: result.content, metadata: {} }];

      const mcpTrace = getMcpChatTraceSummary(mcpTraceSession);

           for (const [index, msgData] of safeParsedMessages.entries()) {
        const metadata = {
          ...(msgData.metadata || {}),
          ...(index === 0 && mcpTrace ? { mcpTrace } : {}),
          ...(index === 0 && result.usedFallbackApi ? { usedFallbackApi: true } : {}),
        };

        const payload = {
          chatId,
          characterId: character.id,
          mode: 'offline',
          offlineSessionId,
          sender: 'character',
          type: msgData.type || 'text',
          content: msgData.content || '',
          metadata,
          versions: [{ type: msgData.type || 'text', content: msgData.content || '', metadata, timestamp: nowIso }],
          currentVersionIndex: 0,
          isRead: false,
          timestamp: nowIso,
        };

        messageIds.push(await db.messages.add(payload));
      }

      preview = safeParsedMessages.find((m) => m.type === 'text')?.content
        || safeParsedMessages[0]?.content
        || '发来了一条消息';
    }

    await db.chats.update(chatId, { updatedAt: nowIso });

    if (!result.error) {
      playMessageSound('receive');

      void markCharacterInteraction({ chatId, characterId: character.id })
        .catch((error) => console.warn('[OfflineAI] Character state settlement skipped safely:', error));

      // chatId 统一处理，线下对话会和线上一样被记忆系统提炼、纳入长期记忆。
      void scheduleMemoryProcessing(chatId);
    }

    notifyOfflineListeners({
      type: 'NEW_MESSAGE',
      chatId, offlineSessionId,
      characterId: character.id,
      characterName: character.name,
      characterAvatar: character.avatar || '',
      preview,
      messageIds,
      timestamp: nowIso,
      isCurrentPageVisible: isDocumentVisible(),
    });
  } catch (err) {
    console.error('[OfflineAI] Background task error:', err);

    notifyOfflineListeners({
      type: 'AI_RESPONSE_ERROR',
      chatId, offlineSessionId,
      message: '这一次回应没有顺利抵达，请稍后再试。',
    });
  } finally {
    activeOfflineAiRequests.delete(offlineSessionId);
    notifyOfflineListeners({ type: 'AI_TYPING_END', chatId, offlineSessionId });
  }
};

// 2026-10 新增：线下模式的"重新生成"。跟 aiService.js 里 rerollAiResponse
// 是同一套思路（只换目标消息本身的 versions，不插新消息行，重roll时的
// 上下文只取这条消息之前的部分），但历史只在这个 offlineSession 自己的
// 消息里取——跟 triggerOfflineAiResponse 用的是同一个 sessionMessages
// 过滤条件，不会混入线上聊天记录或别的线下场次。
export const rerollOfflineAiResponse = async (chatId, offlineSessionId, messageId) => {
  if (!chatId || !offlineSessionId || !messageId) return;
  if (activeOfflineAiRequests.has(offlineSessionId)) return;

  const targetMsg = await db.messages.get(messageId);
  if (!targetMsg || targetMsg.sender !== 'character' || targetMsg.mode !== 'offline') {
    return;
  }

  const offlineSession = await db.offlineSessions.get(offlineSessionId);
  if (!offlineSession) return;

  const chat = await db.chats.get(chatId);
  if (!chat) return;

  const character = await db.characters.get(chat.characterId);
  if (!character) return;

  activeOfflineAiRequests.add(offlineSessionId);
  notifyOfflineListeners({ type: 'AI_TYPING_START', chatId, offlineSessionId });

  try {
    const apiSettings = await db.settings.get('apiConfig');
    const apiConfig = apiSettings?.value || {};

    const systemPrompt = await buildOfflineSystemPrompt({ character, chat, offlineSession });

    const sessionMessages = (await db.messages
      .where('chatId')
      .equals(chatId)
      .sortBy('timestamp'))
      .filter((m) => m.mode === 'offline' && m.offlineSessionId === offlineSessionId);

    const targetIndex = sessionMessages.findIndex((m) => m.id === messageId);

    // 重roll时只用这条消息之前的上下文，不带入原回复本身及之后的内容。
    const historyMessages = targetIndex >= 0
      ? sessionMessages.slice(0, targetIndex)
      : sessionMessages;

    const historyContext = buildHistoryContext(
      historyMessages.filter((m) => m.type !== 'error').slice(-30)
    );

    const latestUserMessage = [...historyMessages].reverse().find((m) => (
      m.sender === 'user' && m.type !== 'error' &&
      typeof m.content === 'string' && m.content.trim()
    ));

    const memoryContext = await getSafeChatMemoryContext({
      chatId,
      userText: latestUserMessage?.content || '',
      recentMessages: historyMessages,
    });

    const characterEmotionContext = await getSafeCharacterEmotionContext({
      chatId,
      characterId: character.id,
    });

    const finalSystemPrompt = `${systemPrompt}${memoryContext}${characterEmotionContext}`;

    const mcpTraceSession = createMcpChatTraceSession({ chatId, characterId: character.id });

    const result = await runAiToolOrchestrator({
      systemPrompt: finalSystemPrompt,
      historyContext,
      apiConfig,
      chatId,
      characterId: character.id,
      source: 'offline',
      requestAiCompletion: (args) =>
        fetchAiCompletionWithTools({ ...args, chatId, characterId: character.id }),
      requestToolApproval: requestMcpToolApproval,
      mcpTraceSession,
    });

    const nowIso = new Date().toISOString();

    const currentVersions = Array.isArray(targetMsg.versions) && targetMsg.versions.length > 0
      ? [...targetMsg.versions]
      : [{
          type: targetMsg.type || 'text',
          content: targetMsg.content || '',
          metadata: targetMsg.metadata || {},
          timestamp: targetMsg.timestamp || nowIso,
        }];

    let newVersion;

    if (result.error) {
      newVersion = {
        type: 'error',
        content: result.message,
        metadata: { errorCode: result.code, errorMessage: result.message },
        errorCode: result.code,
        errorMessage: result.message,
        timestamp: nowIso,
      };
    } else {
      const parsed = await parseAiResponseToMessages(result.content);
      const mcpTrace = getMcpChatTraceSummary(mcpTraceSession);

      // 重roll只替换这一条消息本身：跟在线的 rerollAiResponse 一样，只取
      // 解析结果里的第一条当新版本，不会因为角色这次把回复拆成多条气泡
      // 就意外在聊天记录里插入额外的消息行。
      const firstMessage = parsed[0] || {
        type: 'text',
        content: result.content,
        metadata: {},
      };

      newVersion = {
        type: firstMessage.type || 'text',
        content: firstMessage.content || '',
        metadata: {
          ...(firstMessage.metadata || {}),
          ...(mcpTrace ? { mcpTrace } : {}),
          ...(result.usedFallbackApi ? { usedFallbackApi: true } : {}),
        },
        timestamp: nowIso,
      };
    }

    currentVersions.push(newVersion);

    await db.messages.update(messageId, {
      type: newVersion.type,
      content: newVersion.content,
      metadata: newVersion.metadata || {},
      versions: currentVersions,
      currentVersionIndex: currentVersions.length - 1,
      timestamp: nowIso,
    });

    await db.chats.update(chatId, { updatedAt: nowIso });

    notifyOfflineListeners({
      type: 'NEW_MESSAGE',
      chatId, offlineSessionId,
      characterId: character.id,
      characterName: character.name,
      characterAvatar: character.avatar || '',
      preview: newVersion.type === 'error' ? '重新生成未成功' : (newVersion.content || '已重新生成回复'),
      messageIds: [messageId],
      timestamp: nowIso,
      isReroll: true,
      isCurrentPageVisible: isDocumentVisible(),
    });

    if (result.error) {
      notifyOfflineListeners({
        type: 'AI_RESPONSE_ERROR',
        chatId, offlineSessionId,
        characterId: character.id,
        characterName: character.name,
        message: result.message,
        errorCode: result.code,
        isReroll: true,
      });
    } else {
      playMessageSound('receive');
      void scheduleMemoryProcessing(chatId);
    }
  } catch (err) {
    console.error('[OfflineAI] Reroll error:', err);

    notifyOfflineListeners({
      type: 'AI_RESPONSE_ERROR',
      chatId, offlineSessionId,
      message: '重新生成没有顺利完成，请稍后再试。',
      isReroll: true,
    });
  } finally {
    activeOfflineAiRequests.delete(offlineSessionId);
    notifyOfflineListeners({ type: 'AI_TYPING_END', chatId, offlineSessionId });
  }
};