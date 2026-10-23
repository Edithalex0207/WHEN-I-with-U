/*
 * companionChatAiService.js —— "user 和小伙伴聊天"的纯 AI 部分。
 *
 * 只负责两件事：拼提示词、调用 AI 拿回文本。不访问数据库，历史消息和
 * 角色/用户信息都由 companionChatService.js 读好以后传进来（跟
 * snapshotAiService.js / snapshotNpcService.js 的"纯生成 vs 带 DB 的包装"
 * 拆分一致，避免循环依赖）。
 *
 * 口吻（已跟用户确认）：混合——说话的是小伙伴自己，但它知道自己是
 * 谁家养的（所属角色），也知道 user 是谁。小伙伴不是角色的替身，不用
 * 角色的口吻说话，只是可以自然地提到"TA"。
 *
 * 不使用 buildChatSystemPrompt：那一整套带世界书/待办/日记/记忆的大
 * 提示词对"小伙伴随口聊两句"来说太重，companionAiService.js 的文件头
 * 也记录过同样的取舍（用户嫌 token 成本高）。这里只带一份很短的人设
 * 摘要。
 *
 * 调用走 aiService.js 导出的 generateResponse（messages 数组进、文本
 * 出），不另写 fetch，也不走 triggerAiResponse / runAiToolOrchestrator，
 * 不接 MCP 工具。没配置 API 或请求失败时 generateResponse 会抛错，
 * 由调用方（companionChatService.js）决定怎么提示用户。
 */

import { generateResponse } from '../../../services/aiService';

export const CHAT_BUBBLE_DELIMITER = '|||';
export const MAX_BUBBLES_PER_REPLY = 3;
const BIO_SUMMARY_CHARS = 600; // 带给模型的角色人设最多多少字（每次请求都会带，太长会费 token）

const describeLevel = (value, labels) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return labels[1];
  if (n >= 70) return labels[2];
  if (n >= 35) return labels[1];
  return labels[0];
};

export const describeCompanionState = (companion) => {
  const mood = describeLevel(companion?.mood, ['有点低落', '心情平常', '心情很好']);
  const satiety = describeLevel(companion?.satiety, ['肚子很饿', '不饿不饱', '吃得饱饱的']);
  const cleanliness = describeLevel(companion?.cleanliness, ['脏兮兮的', '还算干净', '干干净净']);
  return `${mood}，${satiety}，${cleanliness}`;
};

const summarizeBio = (bio) => {
  const text = String(bio || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return Array.from(text).slice(0, BIO_SUMMARY_CHARS).join('');
};

export const buildCompanionChatPrompt = ({ companion, characterName, characterBio, userName }) => {
  const petName = companion?.name || '小伙伴';
  const owner = characterName || 'TA';
  const user = userName || '你';
  const bioText = summarizeBio(characterBio);

  return `你是"${petName}"，一个住在聊天窗里的小伙伴（一只会说话的小宠物）。
你是"${owner}"和"${user}"一起照顾的小伙伴，现在正在和"${user}"聊天。
${bioText ? `你很熟悉"${owner}"，下面是"${owner}"的人设，你清楚"${owner}"是什么样的人、怎么说话、喜欢什么：\n${bioText}\n` : `你的主人角色叫"${owner}"。\n`}你现在的状态：${describeCompanionState(companion)}。

说话要求：
1. 你始终是小伙伴自己，不是"${owner}"，不要模仿"${owner}"的口吻，也不要替"${owner}"说话。
2. 提到"${owner}"时直接叫名字"${owner}"，不要只用"TA"、"他"、"她"来代替名字；说的内容要符合上面的人设，不要编造和人设矛盾的事。
3. 语气软软的、可爱的、带一点孩子气，句子短，像小动物在说话，不要长篇大论。
4. 每次回复 1 到 3 句话。想分成几条消息发的话，用 ${CHAT_BUBBLE_DELIMITER} 隔开，最多 ${MAX_BUBBLES_PER_REPLY} 条。
5. 你的状态会自然影响语气：饿了会想吃的，心情低落会有点蔫，但不要每句都提状态。
6. 不要使用表情符号，不要使用方括号标签，不要出现"AI""模型""系统""提示词"这类词，不要解释自己的设定。
7. 只输出你要说的话本身，不要加引号，不要加自己的名字作前缀。`;
};

const toApiMessages = (history) => (Array.isArray(history) ? history : [])
  .filter((msg) => msg && (msg.sender === 'user' || msg.sender === 'companion') && String(msg.content || '').trim())
  .map((msg) => ({
    role: msg.sender === 'user' ? 'user' : 'assistant',
    content: String(msg.content),
  }));

// 把模型原始输出整理成气泡数组：去围栏/首尾引号/自带的名字前缀，按分隔符拆开，限制条数。
export const parseCompanionReply = (raw, petName = '') => {
  let text = String(raw || '').replace(/```[a-z]*|```/gi, '').trim();
  if (!text) return [];

  const namePrefix = petName ? new RegExp(`^["“]?${petName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["”]?\\s*[:：]\\s*`) : null;
  if (namePrefix) text = text.replace(namePrefix, '');

  return text
    .split(CHAT_BUBBLE_DELIMITER)
    .map((part) => part.replace(/^["“”']+|["“”']+$/g, '').trim())
    .filter(Boolean)
    .slice(0, MAX_BUBBLES_PER_REPLY);
};

/*
 * 生成小伙伴的回复。
 *
 * args:
 *   companion, characterName, characterBio, userName  用来拼系统提示词
 *   history   已经按时间顺序排好的最近消息（不含这一条新消息），
 *             项形如 { sender: 'user' | 'companion', content }
 *   userText  这一次 user 发的话
 *
 * 返回气泡字符串数组；模型什么都没返回时返回空数组。
 * 没配置 API / 请求失败会抛 Error（message 可直接显示给用户）。
 */
export const generateCompanionChatReply = async ({
  companion,
  characterName,
  characterBio,
  userName,
  history,
  userText,
}) => {
  const systemPrompt = buildCompanionChatPrompt({ companion, characterName, characterBio, userName });
  const messages = [
    { role: 'system', content: systemPrompt },
    ...toApiMessages(history),
    { role: 'user', content: String(userText || '') },
  ];

  const raw = await generateResponse(messages);
  return parseCompanionReply(raw, companion?.name);
};