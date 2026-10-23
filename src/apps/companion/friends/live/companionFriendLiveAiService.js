/*
 * companionFriendLiveAiService.js —— "小伙伴和朋友真聊"的纯 AI 部分。
 *
 * 只负责两件事：拼提示词、调用 AI 拿回一轮两句话。不访问数据库，
 * companion / friend / character / 已经聊过的内容全部由
 * companionFriendLiveService.js 读好以后传进来（跟 companionChatAiService.js
 * 的拆分方式一致，避免循环依赖）。
 *
 * 调用走 aiService.js 导出的 generateResponse（跟小伙伴聊天那边一样，
 * 不另写 fetch，也不走 triggerAiResponse / runAiToolOrchestrator，不接
 * MCP 工具）。没配置 API 或请求失败时 generateResponse 会直接抛错，错误
 * 信息可以直接显示给 user（由 companionFriendLiveService.js 原样往外抛，
 * 不包一层）。
 *
 * 一轮 = 一次调用 = 两句话：先是"先发言的一方"说一句，再是"另一方"
 * 回应一句，中间用 LIVE_LINE_DELIMITER 分隔。解析要容错——模型没按
 * 分隔符输出时，退一步按换行拆；两种都拆不出两句就当这一轮没聊成功
 * （返回 null，调用方据此抛错，按钮变"接着聊"）。
 */

import { generateResponse } from '../../../../services/aiService';
import { describeCompanionState } from '../../chat/companionChatAiService';
import { describeTimeOfDay, describeFriendshipStage } from '../companionFriendStoryData';

export const LIVE_LINE_DELIMITER = '|||';

// 朋友那边知道的"小伙伴所属角色"人设摘要上限。比小伙伴聊天那边的
// BIO_SUMMARY_CHARS（600）短一些，但已经按用户要求往大了调（最初建议
// 200-300），留一个常量方便以后再调。
export const FRIEND_BIO_SUMMARY_CHARS = 400;

const summarizeCharacterBio = (bio) => {
  const text = String(bio || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return Array.from(text).slice(0, FRIEND_BIO_SUMMARY_CHARS).join('');
};

const escapeRegExp = (text) => String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 清掉模型可能自己加上的名字前缀（"团团：……"），跟 companionChatAiService
// 的 parseCompanionReply 是同一个思路。
const stripNamePrefix = (text, names) => {
  let result = String(text || '').trim();
  for (const name of names) {
    if (!name) continue;
    const re = new RegExp(`^["“]?${escapeRegExp(name)}["”]?\\s*[:：]\\s*`);
    result = result.replace(re, '');
  }
  return result.replace(/^["“”']+|["“”']+$/g, '').trim();
};

/*
 * 解析一轮的原始输出，拿到 { first, second } 两句干净的话。
 * firstName/secondName 用来清掉模型可能误加的名字前缀。
 * 拆不出两句非空的话时返回 null。
 */
export const parseLiveChatRound = (raw, { firstName, secondName } = {}) => {
  let text = String(raw || '').replace(/```[a-z]*|```/gi, '').trim();
  if (!text) return null;

  let parts = text.split(LIVE_LINE_DELIMITER).map((part) => part.trim()).filter(Boolean);

  if (parts.length < 2) {
    // 容错：没找到分隔符，退一步按换行拆成两句。
    const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (lines.length >= 2) parts = lines;
  }

  if (parts.length < 2) return null;

  const first = stripNamePrefix(parts[0], [firstName, secondName]);
  const second = stripNamePrefix(parts[1], [firstName, secondName]);
  if (!first || !second) return null;

  return { first, second };
};

const buildLiveChatPrompt = ({
  companion,
  friend,
  character,
  sceneSeed,
  openingSpeaker,
  history,
  petName,
  friendName,
}) => {
  const owner = character?.name || 'TA';
  const bioText = summarizeCharacterBio(character?.bio);
  const traits = `${friend?.k1 || ''}、${friend?.k2 || ''}`;
  const firstName = openingSpeaker === 'friend' ? friendName : petName;
  const secondName = openingSpeaker === 'friend' ? petName : friendName;

  const historyText = (Array.isArray(history) ? history : [])
    .map((line) => `${line.speaker === 'friend' ? friendName : petName}：${line.text}`)
    .join('\n');

  return `你在给一个宠物社交小游戏写"${petName}"和它的朋友"${friendName}"之间的一小段真实对话，user 只是旁观者，不会说话、不会出现在对话里。

"${petName}"是"${owner}"养的小伙伴。${bioText
    ? `它很熟悉"${owner}"，下面是"${owner}"的人设，你清楚"${owner}"是什么样的人：\n${bioText}\n`
    : `它的主人角色叫"${owner}"。\n`}"${petName}"现在${describeCompanionState(companion)}。
朋友"${friendName}"的性格标签是：${traits}${friend?.declaration ? `，它的交友宣言是"${friend.declaration}"` : ''}。
现在是${describeTimeOfDay()}，两个人${describeFriendshipStage(friend?.friendship)}。
这次聊天的开场：${sceneSeed}。
${historyText
    ? `到目前为止已经聊过：\n${historyText}\n接下来请自然地接着往下聊，不要重复前面说过的话和梗，要让话题有一点新进展。`
    : '这是这次聊天的第一轮，请从上面的开场自然地聊起来。'}

写作要求：
1. 只写这一轮的两句话：先是"${firstName}"说一句，再是"${secondName}"回应一句，中间用 ${LIVE_LINE_DELIMITER} 隔开，不要多写或者少写。
2. 每句话都是真实的口语对话，像两只小动物当面聊天，简短自然（一句话为主，最多两句），不要写成旁白、不要描述动作和表情，只写说出口的话。
3. 说话风格要符合各自的性格："${petName}"是软软的、带点孩子气的小伙伴口吻；"${friendName}"要体现它的性格标签，两个人的语气要能分得出不一样。
4. 不要在句子前面加名字和冒号，不要给整句话加引号，不要使用表情符号，不要出现"系统""AI""任务""提示词"这类词。
5. 只输出这两句话和中间的分隔符本身，不要加任何其他说明文字。`;
};

/*
 * 生成一轮（两句话）。
 *
 * args:
 *   companion, friend, character  用来拼提示词（companion 用到 name/mood
 *     等状态，friend 用到 name/k1/k2/declaration/friendship，character
 *     用到 name/bio）
 *   sceneSeed       这次聊天的开场（来自 companionFriendStoryData 的
 *                   pickSceneSeed('talk')，整场聊天只抽一次）
 *   openingSpeaker  'pet' | 'friend'，这场聊天里固定先发言的一方
 *   history         已经聊过的 { speaker, text } 数组（不含这一轮）
 *
 * 返回 [{ speaker, text }, { speaker, text }]（第一句是 openingSpeaker
 * 说的，第二句是另一方说的）。解析不出两句可用的话时抛 Error；
 * generateResponse 本身失败（没配置 API / 请求失败）时错误原样往外抛。
 */
export const generateLiveChatRound = async ({ companion, friend, character, sceneSeed, openingSpeaker, history }) => {
  const petName = companion?.name || '小伙伴';
  const friendName = friend?.name || '朋友';
  const otherOf = (speaker) => (speaker === 'friend' ? 'pet' : 'friend');

  const firstName = openingSpeaker === 'friend' ? friendName : petName;
  const secondName = openingSpeaker === 'friend' ? petName : friendName;

  const systemPrompt = buildLiveChatPrompt({
    companion,
    friend,
    character,
    sceneSeed,
    openingSpeaker,
    history,
    petName,
    friendName,
  });

  const raw = await generateResponse([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '请写这一轮的两句对话。' },
  ]);

  const parsed = parseLiveChatRound(raw, { firstName, secondName });
  if (!parsed) {
    throw new Error('这一轮没聊成功，请再试一次。');
  }

  return [
    { speaker: openingSpeaker, text: parsed.first },
    { speaker: otherOf(openingSpeaker), text: parsed.second },
  ];
};