/*
 * companionMoodScheduler.js —— 心情日历 Slice B：每天晚上固定判断一次
 * char（角色）当天的心情，写进 companionMoods.charMood。
 *
 * 这种"每隔几分钟扫一遍所有聊天窗"的检查，现在已经并入
 * globalChatScheduler.js 的共享基准 tick（见该文件头部说明），不再自己
 * 起一个独立 setInterval——这里只导出 checkCompanionMoods(chats)，接收
 * 共享查好的 chats 数组（可选，不传就自己查一次，跟 almanacGreeting 的
 * checkAlmanacGreetings 一个写法）；真正多久检查一次由
 * globalChatScheduler.js 的 REGISTRATIONS 决定。
 *
 * "今天判断过没有"直接看 companionMoods 表里今天这条记录的 charMood
 * 是不是已经有值，不需要像问候系统那样单独记一张事件表。
 *
 * 遍历的是 chats（跟其它几个合并进来的调度器一样），每个 chat 有没有
 * 小伙伴（companion）、有没有心情日历，在 processChat 里面单独判断——
 * 没养小伙伴的聊天窗直接跳过。
 */

import db from '../../../db';
import { getCompanionByChat } from '../companionService';
import { getTodayDateStr, toDateStr, setCharMood } from './companionMoodService';
import { judgeCharMood } from './companionMoodAiService';

const NIGHT_HOUR = 22;
const MAX_MESSAGES_FOR_MOOD = 24;

const schedulerState = {
  processing: false,
};

const getTodayMessages = async (chatId, todayStr) => {
  const all = await db.messages.where('chatId').equals(chatId).sortBy('timestamp');
  const todays = all.filter((m) => toDateStr(m.timestamp) === todayStr);
  return todays.slice(-MAX_MESSAGES_FOR_MOOD);
};

const processChat = async (chat, todayStr) => {
  const companion = await getCompanionByChat(chat.id);
  if (!companion) return; // 这个聊天窗没养小伙伴，没有心情日历

  const existing = await db.companionMoods
    .where('[companionId+date]')
    .equals([companion.id, todayStr])
    .first();

  if (existing?.charMood) return; // 今天已经判断过了

  const character = await db.characters.get(chat.characterId);
  if (!character) return;

  const todayMessages = await getTodayMessages(chat.id, todayStr);

  const moodKey = await judgeCharMood({
    chatId: chat.id,
    chat,
    character,
    companion,
    todayMessages,
  });

  if (!moodKey) return; // AI 没判断出来就不写，不瞎编一个

  await setCharMood(companion.id, todayStr, moodKey);
};

export const checkCompanionMoods = async (providedChats = null) => {
  if (schedulerState.processing) return;

  schedulerState.processing = true;

  try {
    const now = new Date();
    if (now.getHours() < NIGHT_HOUR) return; // 还没到 22 点，不用查

    const todayStr = getTodayDateStr();
    const chats = providedChats || (await db.chats.toArray());

    for (const chat of chats) {
      try {
        await processChat(chat, todayStr);
      } catch (error) {
        console.warn('[CompanionMood] 判断心情失败：', error);
      }
    }
  } finally {
    schedulerState.processing = false;
  }
};

export default {
  checkCompanionMoods,
};