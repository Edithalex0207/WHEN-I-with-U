import db from '../../db';
import { readPixelDollState, giveGiftToUser } from './pixelDollService';
import { chooseGiftForUser } from './pixelDollAiService';

// ============================================================
// 像素衣橱——角色自主判断"要不要主动给用户的像素小人挑一件礼物穿上"。
// 跟异地任务挑战的 challengeScheduler.js 同一个思路：没有冷却，频率完全
// 靠下面的检查间隔（约 60 分钟）和 AI 自己的判断（大多数时候应该什么都
// 不选）来控制，force 固定传 false。
//
// 只处理"已经打开过衣橱面板"的聊天——pixelDollProfiles 里没有这一行，
// 就说明这个聊天还没开通衣橱，直接跳过，省掉用不上这个功能的聊天窗的
// AI 调用（跟 challengeScheduler 判断 challengeBoards 是否存在同一个
// 做法）。
//
// 挂进 globalChatScheduler.js 的共享基准 tick，不另起一个 setInterval。
// ============================================================

let isChecking = false;

/**
 * 扫描所有已经建过 pixelDollProfiles 档案行的聊天窗，逐个用一次 AI 调用
 * 决定这次要不要主动送一件礼物。串行执行，避免同时打好几个 AI 请求。
 */
export const runPixelDollScheduler = async (providedChats = null) => {
  if (isChecking) return;
  isChecking = true;

  try {
    const chats = providedChats || (await db.chats.toArray());

    const eligibleChats = [];
    for (const chat of chats) {
      if (!chat?.id || !chat?.characterId) continue;
      // eslint-disable-next-line no-await-in-loop
      const hasProfile = (await db.pixelDollProfiles.where('chatId').equals(chat.id).count()) > 0;
      if (hasProfile) eligibleChats.push(chat);
    }

    if (eligibleChats.length === 0) return;

    for (const chat of eligibleChats) {
      try {
        const character = await db.characters.get(chat.characterId);
        if (!character) continue;

        const { profile, customParts } = await readPixelDollState(chat.id);
        if (!profile) continue;

        const choice = await chooseGiftForUser({
          chatId: chat.id,
          character,
          userLook: profile.userLook,
          customParts,
          force: false,
        });

        if (!choice) continue;

        await giveGiftToUser(chat.id, choice.gift, { noteText: choice.note });
      } catch (err) {
        console.error(`[像素衣橱] chatId=${chat.id} 检查失败：`, err);
      }
    }
  } catch (err) {
    console.error('[像素衣橱] 调度检查失败：', err);
  } finally {
    isChecking = false;
  }
};