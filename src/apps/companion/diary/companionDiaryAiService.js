/*
 * "小伙伴"日记——数据 CRUD + 生成编排。
 *
 * 【触发方式，用户已确认】：不是定时写，而是由"重要事件"触发——也就是
 * companionEventService.js 判定命中一个特殊事件（氛围/稀有解锁/传说发放/
 * 选项事件）的那一刻，顺带让小伙伴写一篇日记。调用方是
 * companionEventService.js，见那边的 checkCompanionEvents /
 * resolveCompanionChoiceEvent。
 *
 * 【用户互动，已确认】：用户可以给每篇日记点赞、留一句话评论；这个互动
 * 本身要能被角色感知到——具体做法是 companionStatusPrompt.js 里概率性地
 * 把"最近一篇日记 + 用户有没有点赞/说了什么"喂给角色（见那个文件），
 * 这里不负责往聊天里插消息，只负责把数据存好、让状态提示词能读到。
 *
 * 完全新表 companionDiaries（db.version(90)），跟 companionLogs
 * （互动/自主照料的轻量流水账）是两回事，不共用、不混着查。
 */

import db from '../../../db';
import { generateDiaryText } from './companionDiaryAiService';

const MAX_COMMENT_LENGTH = 200;

// AI 没配置/生成失败时的兜底——刻意写得比较通用，毕竟触发日记的事件
// 五花八门，兜底文案没法针对每一种事件单独写一条，只能给一种"写了点什么，
// 但说不清具体细节"的感觉，保持小伙伴自己的口吻。
const DIARY_FALLBACKS = [
  '今天发生了一点小事，心里有点小小的波动，说不清是什么感觉，但还是想记下来。',
  '今天的心情有点不一样，趴在这里想了好一会儿，最后还是决定写下来，哪怕只是几句话。',
  '今天过得挺特别的，有些瞬间让我想了很久，希望以后翻看的时候还能想起来当时的感觉。',
  '今天的事情有点出乎意料，一时半会儿说不清楚，先简单记一笔，改天再慢慢想。',
  '今天有点小小的触动，不算是什么大事，但还是想留一点痕迹在这里。',
];

const pickFallback = (pool) => pool[Math.floor(Math.random() * pool.length)];

/*
 * 由 companionEventService.js 在事件触发/选项事件结算时调用。
 *   triggerDefId：触发这篇日记的事件定义 id（纯记录用，方便以后排查）。
 *   triggerLabel：给 AI 看的"发生了什么"的简短描述（事件的 title/结果句）。
 *   triggerDetail：可选的补充说明（比如 bannerText），不是必须的。
 *
 * 全程 try/catch 包在外面调用（跟自主照顾日志一样），这里内部也做了
 * 防御——找不到companion/chat/character 就直接跳过，不抛出去打断
 * 调用方本来的事件流程。
 */
export const generateDiaryEntry = async (companionId, { triggerDefId = null, triggerLabel, triggerDetail = null } = {}) => {
  if (!companionId || !triggerLabel) return null;

  try {
    const companion = await db.companions.get(companionId);
    if (!companion) return null;

    const chat = await db.chats.get(companion.chatId);
    const character = chat ? await db.characters.get(chat.characterId) : null;

    const now = Date.now();
    let content = null;

    if (chat && character) {
      content = await generateDiaryText({
        chatId: companion.chatId,
        chat,
        character,
        companion,
        triggerLabel,
        triggerDetail,
      });
    }

    if (!content) content = pickFallback(DIARY_FALLBACKS);

    const record = {
      companionId,
      timestamp: now,
      triggerDefId,
      triggerLabel,
      content,
      liked: false,
      likedAt: null,
      userComment: null,
      commentedAt: null,
    };

    const id = await db.companionDiaries.add(record);
    record.id = id;
    return record;
  } catch (error) {
    console.error('[CompanionDiary] 生成日记失败:', error);
    return null;
  }
};

export const getDiaries = async (companionId, limit = 30) => {
  const rows = await db.companionDiaries
    .where('companionId')
    .equals(companionId)
    .reverse()
    .sortBy('timestamp');
  return rows.slice(0, limit);
};

/*
 * 点赞只是个开关，没有"赞的数量"这个概念（一篇日记只有用户一个人能点）。
 */
export const toggleDiaryLike = async (companionId, diaryId) => {
  const diary = await db.companionDiaries.get(diaryId);
  if (!diary || diary.companionId !== companionId) return null;

  const now = Date.now();
  const nextLiked = !diary.liked;

  await db.companionDiaries.update(diaryId, {
    liked: nextLiked,
    likedAt: nextLiked ? now : null,
  });

  return await db.companionDiaries.get(diaryId);
};

/*
 * 留言：覆盖式的（跟改名一样，不留历史版本），传空字符串/只有空白就当作
 * "删除这条留言"处理。
 */
export const commentOnDiary = async (companionId, diaryId, commentText) => {
  const diary = await db.companionDiaries.get(diaryId);
  if (!diary || diary.companionId !== companionId) return null;

  const trimmed = String(commentText || '').trim().slice(0, MAX_COMMENT_LENGTH);
  const now = Date.now();

  await db.companionDiaries.update(diaryId, {
    userComment: trimmed || null,
    commentedAt: trimmed ? now : null,
  });

  return await db.companionDiaries.get(diaryId);
};