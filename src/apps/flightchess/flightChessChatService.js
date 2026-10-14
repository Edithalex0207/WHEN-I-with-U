// src/apps/flightchess/flightChessChatService.js
//
// 飞行棋「聊天抽屉」和「掷骰反应」用到的 AI 调用。
// 全部走 aiService.js 导出的 generateResponse（messages 数组进、文本出），
// 不碰在线聊天的括号标签解析管线，也不写任何数据库。
//
// 设计原则：任何一次请求失败都不能卡住棋局。
//   - 掷骰反应失败：返回一句本地短句，并带 failed: true，界面上给「换一句」按钮；
//   - 任务对话失败：返回 failed: true，界面上给「重试」和「直接放行」两个按钮。

import { generateResponse } from '../../services/aiService';

/** 聊任务时，用户和角色最多来回几轮；到了这一轮角色必须放行 */
export const MAX_CHAT_ROUNDS = 5;

const clip = (text, max) => String(text || '').trim().slice(0, max);

const personaBlock = (character, userName) => `你正在扮演角色：${character.name}。
角色设定：
${clip(character.bio, 1200) || '无'}

你正在和${userName}玩一局情侣向的事件卡飞行棋。保持角色的口吻，不要出戏，不要提到自己是AI。`;

/** 去掉模型偶尔加的引号、旁白括号和我们自己的标签 */
const cleanReply = (raw) => String(raw || '')
  .replace(/\[(认可|追问)\]/g, '')
  .replace(/^["“”'\s]+|["“”'\s]+$/g, '')
  .trim();

/* ------------------------------------------------------------------ */
/* 掷骰反应                                                             */
/* ------------------------------------------------------------------ */

const LOCAL_ROLL_LINES = {
  self: [
    '看我的。',
    '这一把，稳一点。',
    '骰子，听我的。',
  ],
  other: [
    '轮到你啦，我在旁边看着。',
    '这一步不错，继续。',
    '我有点期待你落在哪一格。',
  ],
};

export const pickLocalRollLine = (actorIsReactor) => {
  const list = actorIsReactor ? LOCAL_ROLL_LINES.self : LOCAL_ROLL_LINES.other;
  return list[Math.floor(Math.random() * list.length)];
};

/**
 * 每次掷骰后，让一位角色说一句话（不超过 40 字）。
 * 返回 { text, failed }；失败时 text 是本地短句，failed 为 true。
 */
export const generateRollComment = async ({
  reactor,
  userName = '你',
  actorName,
  actorIsReactor,
  value,
  destinationTitle = '',
  log = [],
}) => {
  const recent = (log || [])
    .slice(-4)
    .map((entry) => `${entry.who ? `${entry.who}：` : ''}${entry.text}`)
    .join('\n');

  const situation = actorIsReactor
    ? `刚才是你自己在掷骰子，掷出了 ${value} 点。`
    : `刚才是${actorName}在掷骰子，掷出了 ${value} 点。`;

  try {
    const raw = await generateResponse([
      {
        role: 'system',
        content: `${personaBlock(reactor, userName)}

${situation}${destinationTitle ? `前面的格子是「${destinationTitle}」。` : ''}
最近发生的事：
${recent || '（刚开局）'}

请你像在牌桌边一样随口说一句话，自然、有角色感，可以调侃、期待或撒娇。
要求：只输出这一句话，不超过40个字，不要加引号、旁白或标签。`,
      },
      { role: 'user', content: '说吧。' },
    ]);
    const text = clip(cleanReply(raw), 80);
    if (!text) return { text: pickLocalRollLine(actorIsReactor), failed: true };
    return { text, failed: false };
  } catch (err) {
    console.warn('[flightChessChat] 生成掷骰反应失败，使用本地短句:', err);
    return { text: pickLocalRollLine(actorIsReactor), failed: true };
  }
};

/* ------------------------------------------------------------------ */
/* 任务对话                                                             */
/* ------------------------------------------------------------------ */

const taskBlock = (task, userName) => `这一格的任务：「${task.title}」
内容：${task.text}${task.author ? `\n（这张卡是 ${task.author} 写的）` : ''}
这是${userName}要完成的任务。`;

/**
 * 用户完成任务时，角色的一轮回复。
 *
 * history: [{ role: 'user' | 'char', text }]，最后一条是用户刚说的话。
 * round: 这是第几轮（从 1 开始）。到达 MAX_CHAT_ROUNDS 时一定放行。
 *
 * 返回 { text, approved, failed }。
 *   approved：角色认可了，可以继续；
 *   failed：请求失败（text 为空）。
 */
export const generateTaskChatTurn = async ({
  character,
  userName = '你',
  task,
  history,
  round,
  log = [],
}) => {
  const isLastRound = round >= MAX_CHAT_ROUNDS;
  const recent = (log || [])
    .slice(-4)
    .map((entry) => `${entry.who ? `${entry.who}：` : ''}${entry.text}`)
    .join('\n');

  const system = `${personaBlock(character, userName)}

${taskBlock(task, userName)}
最近发生的事：
${recent || '（刚开局）'}

现在你要判断${userName}有没有认真完成这个任务，并像在现场一样回应：
- 满意（有诚意地回应了，不必写得很长）：用你的口吻回应，并在最后加上 [认可]
- 还想多听一点或想追问：用你的口吻追问一句，并在最后加上 [追问]
要求：对话要自然，不要像在打分；宽容一点，真诚比完整更重要；只输出你要说的话加标签，1到3句，不超过120个字。
这是第 ${round} 轮，最多 ${MAX_CHAT_ROUNDS} 轮。${isLastRound ? '这是最后一轮，必须加上 [认可]。' : ''}`;

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `（${userName}开始完成任务了）` },
    ...history.map((item) => ({
      role: item.role === 'char' ? 'assistant' : 'user',
      content: item.text,
    })),
  ];

  try {
    const raw = String(await generateResponse(messages) || '');
    const text = clip(cleanReply(raw), 400);
    if (!text) return { text: '', approved: false, failed: true };

    const asksMore = /\[追问\]/.test(raw);
    const approved = isLastRound || !asksMore;
    return { text, approved, failed: false };
  } catch (err) {
    console.warn('[flightChessChat] 任务对话失败:', err);
    return { text: '', approved: false, failed: true };
  }
};

/**
 * 角色自己抽到任务时：角色亲自完成。
 * 返回 { text, failed }。
 */
export const generateCharacterTaskAnswer = async ({
  character,
  userName = '你',
  task,
  log = [],
}) => {
  const recent = (log || [])
    .slice(-4)
    .map((entry) => `${entry.who ? `${entry.who}：` : ''}${entry.text}`)
    .join('\n');

  try {
    const raw = await generateResponse([
      {
        role: 'system',
        content: `${personaBlock(character, userName)}

最近发生的事：
${recent || '（刚开局）'}

这一格轮到你自己完成：「${task.title}」
内容：${task.text}
请按你的性格亲自回答/完成它（涉及语音、自拍之类做不到的部分，用文字描述你会怎么做）。
要求：只输出你要说的话，1到3句，不超过120个字，不要加引号、旁白或标签。`,
      },
      { role: 'user', content: `轮到你了，${character.name}。` },
    ]);
    const text = clip(cleanReply(raw), 400);
    if (!text) return { text: '', failed: true };
    return { text, failed: false };
  } catch (err) {
    console.warn('[flightChessChat] 角色完成任务失败:', err);
    return { text: '', failed: true };
  }
};

/**
 * 角色完成任务之后，用户回了一句，角色再接一句（不判定，只是聊天）。
 * history 最后一条是用户的话。返回 { text, failed }。
 */
export const generateCharacterFollowUp = async ({
  character,
  userName = '你',
  task,
  history,
}) => {
  const messages = [
    {
      role: 'system',
      content: `${personaBlock(character, userName)}

刚才你完成了任务：「${task.title}」（${task.text}）。${userName}对你的回答回了一句话，请你自然地接一句。
要求：只输出你要说的话，1到2句，不超过80个字，不要加引号、旁白或标签。`,
    },
    { role: 'user', content: `轮到你了，${character.name}。` },
    ...history.map((item) => ({
      role: item.role === 'char' ? 'assistant' : 'user',
      content: item.text,
    })),
  ];

  try {
    const raw = await generateResponse(messages);
    const text = clip(cleanReply(raw), 300);
    if (!text) return { text: '', failed: true };
    return { text, failed: false };
  } catch (err) {
    console.warn('[flightChessChat] 角色接话失败:', err);
    return { text: '', failed: true };
  }
};

export default {
  MAX_CHAT_ROUNDS,
  pickLocalRollLine,
  generateRollComment,
  generateTaskChatTurn,
  generateCharacterTaskAnswer,
  generateCharacterFollowUp,
};