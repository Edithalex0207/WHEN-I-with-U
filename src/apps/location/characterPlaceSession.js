// src/apps/location/characterPlaceSession.js
//
// 角色在正常回复里写了 [CHAR_PLACE_WANT] 之后，立刻补的那一次单独调用。
// 完整的格式说明（地名/评价/心情怎么写）只在这里出现，平时的主聊天
// 提示词里只有一句"想分享就写 [CHAR_PLACE_WANT]"。
//
// 写法跟 bubbleStyleSession.js 一样：直接 fetch db.settings 里的
// apiConfig，不经过 aiService.js（aiService.js 要 import 这个文件，
// 反过来 import 会循环依赖）。失败一律静默，只留一条 console.warn，
// 不影响已经写入的正常回复。
//
// 落地：recordCharacterPlaceVisit 按地名模糊匹配，决定这是"新地方"还是
// "角色又来的老地方"（visitCount+1）；角色这次的评价/心情写成一条
// characterPlaceMemories 记录，author 'char'。

import Dexie from 'dexie';
import db from '../../db';
import {
  recordCharacterPlaceVisit,
  addCharacterPlaceMemory,
} from './characterPlaceService';

const HISTORY_LIMIT = 8;
const HISTORY_LINE_MAX = 120;

const getRecentHistoryText = async (chatId, character) => {
  const rows = await db.messages
    .where('[chatId+timestamp]')
    .between([chatId, Dexie.minKey], [chatId, Dexie.maxKey])
    .reverse()
    .limit(HISTORY_LIMIT)
    .toArray();

  return rows
    .reverse()
    .filter((row) => row.type === 'text' && row.content)
    .map((row) => {
      const who = row.sender === 'user' ? '用户' : (character?.name || '你');
      return `${who}：${String(row.content).replace(/\s+/g, ' ').slice(0, HISTORY_LINE_MAX)}`;
    })
    .join('\n');
};

const buildSessionPrompt = ({ character, historyText, triggerReply }) => `你正在扮演角色：${character?.name || '角色'}。

角色设定：
${String(character?.bio || '无').slice(0, 800)}

补充设定：
${String(character?.extraNotes || '无').slice(0, 400)}

你刚才在和用户聊天时，表示想分享一个你自己去过/常去的地方。现在请你具体决定是哪里、你对这个地方的感觉。就当你是一个有自己生活的真实的人——这个地方不需要跟用户有关，可以完全是你自己的日常（比如常去的咖啡馆、住的地方附近的公园、工作的地方）。

最近的聊天：
${historyText || '（暂无）'}

你刚才说的这句话：${String(triggerReply || '').slice(0, 200)}

严格按照下面的标签格式输出，不要有任何多余的话：
[PLACE: 地名，简短，不超过10个字]
[REVIEW: 你对这个地方的一句评价或感受，不超过30个字，第一人称]
[MOOD: 用两三个字概括这次提到这里时的心情，比如"平静""有点想念""还挺开心"]

规则：
1. 地名要具体、口语化，像一个真实的人会怎么称呼自己去的地方（"楼下那家面馆"而不是泛泛的"餐厅"）。
2. 可以是你之前提到过的老地方，也可以是新地方，自己判断，不用刻意求新或求旧。
3. REVIEW 要有真实感受，不要只是客观描述这个地方是什么。
4. 不要用 Emoji。
5. 三个标签都要写，缺一不可。`;

const callModel = async (systemPrompt) => {
  const apiSetting = await db.settings.get('apiConfig');
  const apiConfig = apiSetting?.value || {};

  if (!apiConfig.baseUrl || !apiConfig.apiKey) return null;

  const baseUrl = String(apiConfig.baseUrl).replace(/\/$/, '');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: apiConfig.model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '请按照上面的要求执行。' },
      ],
      temperature: 0.9,
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || null;
};

const readTag = (text, tagName) => {
  const match = new RegExp(`\\[${tagName}:\\s*([^\\]]*)\\]`, 'i').exec(text);
  return match ? match[1].trim() : '';
};

export const runCharacterPlaceSession = async ({ chatId, character, triggerReply }) => {
  try {
    if (!chatId || !character) return { applied: false };

    const historyText = await getRecentHistoryText(chatId, character);
    const prompt = buildSessionPrompt({ character, historyText, triggerReply });
    const rawText = await callModel(prompt);
    if (!rawText) return { applied: false };

    const placeName = readTag(rawText, 'PLACE');
    if (!placeName) return { applied: false };

    const review = readTag(rawText, 'REVIEW');
    const mood = readTag(rawText, 'MOOD');

    const visit = await recordCharacterPlaceVisit({
      chatId,
      characterId: character.id,
      name: placeName,
    });

    if (!visit?.place) return { applied: false };

    if (review) {
      await addCharacterPlaceMemory({
        chatId,
        placeId: visit.place.id,
        author: 'char',
        text: review,
        mood,
      });
    }

    return { applied: true, isFirstVisit: visit.isFirstVisit };
  } catch (error) {
    console.warn('[CharacterPlace] 记录角色地点失败：', error);
    return { applied: false };
  }
};

export default { runCharacterPlaceSession };