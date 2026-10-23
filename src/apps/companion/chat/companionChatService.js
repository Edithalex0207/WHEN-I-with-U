/*
 * companionChatService.js —— "user 和小伙伴聊天"的数据层 + 发送/重 roll 流程。
 *
 * 数据：新表 db.companionMessages（db.version(100)），一条消息一行：
 *   id, companionId, sender: 'user' | 'companion', content, timestamp(ms)
 * 索引 [companionId+timestamp]，读最近 N 条不用扫全表。
 *
 * 这是小伙伴自己的聊天记录，跟 db.messages（角色聊天）完全分开：
 *   - 不写 db.messages，不走 triggerAiResponse；
 *   - 不进记忆系统（scheduleMemoryProcessing 不会被调用），角色的正式
 *     聊天也读不到这里的内容；
 *   - 暂时不发放心心，不改小伙伴的数值。
 *
 * 每日清空（已跟用户确认，并在弹窗里用便利贴提醒）：
 *   聊天记录只保留"今天"的。"今天"从每天的 CHAT_RESET_HOUR 点开始算，
 *   更早的消息在"打开弹窗"和"发送/重 roll 之前"被惰性清掉——不加后台
 *   调度器，也不额外存"上次清空时间"，直接按消息自己的时间戳判断。
 *   想改成凌晨 4 点才算新的一天，只改 CHAT_RESET_HOUR 这一个常量。
 *
 * 依赖方向：本文件 import companionChatAiService.js（纯 AI），反过来不行。
 */

import db from '../../../db';
import { generateCompanionChatReply } from './companionChatAiService';

// ---- 常量：全部写成常量方便以后调 ----
export const CHAT_HISTORY_WINDOW = 20; // 每次请求带给模型的最近消息条数
export const CHAT_DISPLAY_LIMIT = 80; // 弹窗里最多显示最近多少条
export const CHAT_MAX_INPUT_CHARS = 200; // 单条输入上限
export const CHAT_MAX_STORED = 400; // 单只小伙伴最多保留多少条，超出删最旧的
export const CHAT_RESET_HOUR = 0; // 每天几点开始算新的一天（0 = 零点）

// 弹窗里便利贴用的文字："零点" / "4点"
export const describeChatResetTime = () => (CHAT_RESET_HOUR === 0 ? '零点' : `${CHAT_RESET_HOUR}点`);

// 当前"聊天日"的起点（毫秒）：今天的 CHAT_RESET_HOUR 点；还没到这个点就算昨天的。
export const getChatDayStart = (now = Date.now()) => {
  const start = new Date(now);
  start.setHours(CHAT_RESET_HOUR, 0, 0, 0);
  if (start.getTime() > now) {
    start.setDate(start.getDate() - 1);
  }
  return start.getTime();
};

/*
 * 清掉早于"今天起点"的消息，返回删掉了多少条。
 * 弹窗打开时、以及每次发送/重 roll 之前都会调一次（后者处理"弹窗一直开着
 * 跨过了零点"的情况）。
 */
export const purgeStaleChatMessages = async (companionId, now = Date.now()) => {
  if (!companionId) return 0;
  const dayStart = getChatDayStart(now);
  return db.companionMessages
    .where('[companionId+timestamp]')
    .between([companionId, 0], [companionId, dayStart], true, false)
    .delete();
};

export const getRecentChatMessages = async (companionId, limit = CHAT_DISPLAY_LIMIT) => {
  if (!companionId) return [];
  const rows = await db.companionMessages
    .where('[companionId+timestamp]')
    .between([companionId, 0], [companionId, Infinity])
    .reverse()
    .limit(limit)
    .toArray();
  return rows.reverse();
};

const addChatMessage = async (companionId, sender, content, timestamp) => {
  const id = await db.companionMessages.add({
    companionId,
    sender,
    content,
    timestamp,
  });
  return { id, companionId, sender, content, timestamp };
};

// 超出上限时删掉最旧的，防止单只小伙伴的聊天记录无限增长。
const trimChatMessages = async (companionId) => {
  const total = await db.companionMessages.where('companionId').equals(companionId).count();
  if (total <= CHAT_MAX_STORED) return;
  const overflow = total - CHAT_MAX_STORED;
  const oldest = await db.companionMessages
    .where('[companionId+timestamp]')
    .between([companionId, 0], [companionId, Infinity])
    .limit(overflow)
    .primaryKeys();
  await db.companionMessages.bulkDelete(oldest);
};

export const clearChatMessages = async (companionId) => {
  if (!companionId) return;
  await db.companionMessages.where('companionId').equals(companionId).delete();
};

// 把一次回复的几个气泡各写一行；时间戳依次加 1ms，保证排序稳定。
const storeReplyBubbles = async (companionId, bubbles, notBefore) => {
  const replyBase = Math.max(Date.now(), notBefore + 1);
  const replies = [];
  for (let i = 0; i < bubbles.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    replies.push(await addChatMessage(companionId, 'companion', bubbles[i], replyBase + i));
  }
  return replies;
};

const safeTrim = async (companionId) => {
  try {
    await trimChatMessages(companionId);
  } catch (error) {
    console.warn('[CompanionChat] 清理旧消息失败（不影响聊天）:', error);
  }
};

const resolveUserName = async (chatId, character) => {
  const chat = chatId ? await db.chats.get(chatId) : null;
  return chat?.userName || character?.userName || '你';
};

/*
 * 发送一条 user 消息并拿回小伙伴的回复。
 *
 * 流程：先清掉过期（昨天及更早）的消息，再把 user 这条写库（保证即使
 * AI 失败，user 说过的话也还在），然后读最近历史调 AI，最后把每个气泡
 * 各写一行 companionMessages。
 *
 * 返回 { userMessage, replies, purged }；purged > 0 表示这次发送前清掉了
 * 过期消息（弹窗一直开着跨过了零点），调用方应当重新从库里读一遍列表。
 * AI 失败时抛 Error（message 可直接显示），此时 user 那条已经写入，不回滚。
 */
export const sendCompanionChatMessage = async ({ companion, character, chatId, text }) => {
  const content = String(text || '').trim().slice(0, CHAT_MAX_INPUT_CHARS);
  if (!companion?.id || !content) {
    throw new Error('消息不能为空。');
  }

  const purged = await purgeStaleChatMessages(companion.id);
  const history = await getRecentChatMessages(companion.id, CHAT_HISTORY_WINDOW);

  const now = Date.now();
  const userMessage = await addChatMessage(companion.id, 'user', content, now);
  const userName = await resolveUserName(chatId, character);

  const bubbles = await generateCompanionChatReply({
    companion,
    characterName: character?.name || '',
    characterBio: character?.bio || '',
    userName,
    history,
    userText: content,
  });

  if (bubbles.length === 0) {
    throw new Error('小伙伴好像没听清，再说一次试试？');
  }

  const replies = await storeReplyBubbles(companion.id, bubbles, now);
  await safeTrim(companion.id);

  return { userMessage, replies, purged };
};

/*
 * 重 roll：重新生成"最后一组小伙伴回复"。
 *
 * 只有当聊天记录的最后一条是小伙伴说的话时才可以重 roll；"最后一组"指
 * 最后一条 user 消息之后连续的所有小伙伴气泡。先用同一条 user 消息和它
 * 之前的历史调 AI，拿到新回复之后才删旧的、写新的——所以 AI 失败时旧回复
 * 原样保留，不会出现"删了旧的却没有新的"。
 *
 * 返回 { removedIds, replies, purged }；purged > 0 时调用方应当重新从库里
 * 读一遍列表。没有可以重 roll 的内容（比如刚好跨零点被清空）时抛 Error。
 */
export const rerollCompanionChatReply = async ({ companion, character, chatId }) => {
  if (!companion?.id) {
    throw new Error('找不到小伙伴。');
  }

  const purged = await purgeStaleChatMessages(companion.id);

  // 多读一些，保证能覆盖"最后一组回复 + 它前面的一条 user + 历史窗口"。
  const rows = await getRecentChatMessages(
    companion.id,
    CHAT_HISTORY_WINDOW + 10,
  );

  let cursor = rows.length - 1;
  const group = [];
  while (cursor >= 0 && rows[cursor].sender === 'companion') {
    group.unshift(rows[cursor]);
    cursor -= 1;
  }

  const lastUser = cursor >= 0 && rows[cursor].sender === 'user' ? rows[cursor] : null;
  if (group.length === 0 || !lastUser) {
    throw new Error('现在没有可以重新生成的回复。');
  }

  const history = rows.slice(Math.max(0, cursor - CHAT_HISTORY_WINDOW), cursor);
  const userName = await resolveUserName(chatId, character);

  const bubbles = await generateCompanionChatReply({
    companion,
    characterName: character?.name || '',
    characterBio: character?.bio || '',
    userName,
    history,
    userText: lastUser.content,
  });

  if (bubbles.length === 0) {
    throw new Error('小伙伴好像没想出来，再点一次试试？');
  }

  const removedIds = group.map((row) => row.id);
  await db.companionMessages.bulkDelete(removedIds);
  const replies = await storeReplyBubbles(companion.id, bubbles, lastUser.timestamp);
  await safeTrim(companion.id);

  return { removedIds, replies, purged };
};