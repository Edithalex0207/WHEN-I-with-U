// src/apps/flightchess/flightChessAiService.js
//
// 飞行棋的 AI 调用：全部走 aiService.js 导出的 generateResponse
// （messages 数组进、文本出），不碰在线聊天的括号标签解析管线。
// 每个函数都带兜底：AI 失败时返回一句不出戏的默认文案，保证棋局
// 不会因为一次请求失败而卡住。

import db from '../../db';
import { generateResponse } from '../../services/aiService';

const clip = (text, max) => String(text || '').trim().slice(0, max);

const personaBlock = (character, userName) => `你正在扮演角色：${character.name}。
角色设定：
${clip(character.bio, 1200) || '无'}

你正在和${userName}玩一局情侣向的事件卡飞行棋。保持角色的口吻，不要出戏，不要提到自己是AI。`;

/**
 * 开局让角色写 count 张提问卡（给对方的问题）。返回字符串数组，
 * 长度保证等于 count（不够时用兜底问题补齐）。
 */
export const generateCharacterQuestionCards = async ({ character, userName = '你', count = 3 }) => {
  const fallback = [
    `你今天有没有哪一刻突然想到我？`,
    `说一件最近让你偷偷开心的小事。`,
    `如果现在可以马上见到我，你最想做什么？`,
  ];

  try {
    const raw = await generateResponse([
      {
        role: 'system',
        content: `${personaBlock(character, userName)}

现在请你为这局游戏写 ${count} 张“提问卡”：每张是一个你想问${userName}的问题，由你们之间的关系和你的性格自然产生，可以暧昧、可以认真，每个问题不超过40个字。
只输出一个 JSON 字符串数组，例如 ["问题1","问题2","问题3"]，不要输出其它任何文字。`,
      },
      { role: 'user', content: `请写 ${count} 张提问卡。` },
    ]);

    const match = String(raw || '').match(/\[[\s\S]*\]/);
    const parsed = match ? JSON.parse(match[0]) : [];
    const list = (Array.isArray(parsed) ? parsed : [])
      .map((item) => clip(item, 60))
      .filter(Boolean)
      .slice(0, count);
    while (list.length < count) list.push(fallback[list.length % fallback.length]);
    return list;
  } catch (err) {
    console.warn('[flightChessAi] 生成角色提问卡失败，使用兜底问题:', err);
    return fallback.slice(0, count);
  }
};

const recentLogText = (log) => (log || [])
  .slice(-6)
  .map((entry) => `${entry.who ? `${entry.who}：` : ''}${entry.text}`)
  .join('\n');

/**
 * 玩家落到一个需要回应的格子（或抽到一张卡）时，让角色做出反应。
 *
 * - 落子的是角色本人（actorIsCharacter = true）：角色按设定认真回答/完成这道题。
 * - 落子的是用户：reactor 角色看着用户的回答（可能为空）做出反应。
 */
export const generateTileReaction = async ({
  reactor,
  userName = '你',
  actorIsCharacter,
  actorName,
  promptTitle,
  promptText,
  userAnswer = '',
  log = [],
}) => {
  const fallback = actorIsCharacter
    ? '嗯……这个问题，我想认真回答你。'
    : '我听到了，你说的我都记在心里。';

  const taskLine = actorIsCharacter
    ? `这一格轮到你自己完成：「${promptTitle}」\n内容：${promptText}\n请按你的性格亲自回答/完成它（涉及语音、自拍之类做不到的部分，用文字描述你会怎么做）。`
    : `${userName}刚落到格子：「${promptTitle}」\n内容：${promptText}\n${userName}的回应：${clip(userAnswer, 400) || '（没有打字，大概是口头回应了）'}\n请你像在现场一样，对${userName}的这次回应做出反应。`;

  try {
    const raw = await generateResponse([
      {
        role: 'system',
        content: `${personaBlock(reactor, userName)}

最近发生的事：
${recentLogText(log) || '（刚开局）'}

${taskLine}

要求：只输出你要说的话，1到3句，不超过120个字，不要加引号、旁白或标签。`,
      },
      { role: 'user', content: actorIsCharacter ? `轮到你了，${actorName}。` : `${userName}回应完了，你怎么说？` },
    ]);
    return clip(raw, 400) || fallback;
  } catch (err) {
    console.warn('[flightChessAi] 生成格子反应失败，使用兜底文案:', err);
    return fallback;
  }
};

/** 终局：主角色用自己的口吻写一段给用户的总结，会发回主聊天框。 */
export const generateFinalSummary = async ({
  character,
  userName = '你',
  winnerName,
  statsLines = [],
  highlights = [],
}) => {
  const fallback = `这局飞行棋玩完啦，${winnerName} 先到了终点。${statsLines.join('；')}。下次还想和你一起玩。`;

  try {
    const raw = await generateResponse([
      {
        role: 'system',
        content: `${personaBlock(character, userName)}

这局棋刚刚结束。结果：${winnerName} 最先到达终点。
各人的存款格/取款格/惩罚格次数：${statsLines.join('；') || '无'}
这局里印象深的片段：
${highlights.join('\n') || '（没有特别记录）'}

请你以自己的口吻，给${userName}发一条这局的结束总结消息：回顾一两个有意思的瞬间，说说你的感受，最后自然地接一句“下次想玩什么”。不超过150个字，不要加引号或标签。`,
      },
      { role: 'user', content: '请发总结。' },
    ]);
    return clip(raw, 600) || fallback;
  } catch (err) {
    console.warn('[flightChessAi] 生成终局总结失败，使用兜底文案:', err);
    return fallback;
  }
};

/**
 * 把终局总结作为主角色发的一条普通文字消息写进主聊天框，并通知
 * ChatRoom 刷新（同 interactionService 的 'new-local-message-inserted' 约定）。
 */
export const postSummaryToMainChat = async ({ chatId, characterId, text }) => {
  if (!chatId || !characterId || !String(text || '').trim()) return null;

  const timestamp = new Date().toISOString();
  try {
    const messageId = await db.messages.add({
      chatId,
      characterId,
      sender: 'character',
      type: 'text',
      content: String(text).trim(),
      metadata: { source: 'flightchess_summary' },
      isRead: false,
      timestamp,
    });
    await db.chats.update(chatId, { updatedAt: timestamp });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('new-local-message-inserted', { detail: { chatId } })
      );
    }
    return messageId;
  } catch (err) {
    console.error('[flightChessAi] 写入终局总结消息失败:', err);
    return null;
  }
};