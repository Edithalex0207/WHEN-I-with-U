/*
 * companionFriendLiveService.js —— "小伙伴和朋友真聊"的数据层：读写
 * friend.liveChat、额度和友谊值结算、当天清空、跑完整场 LIVE_CHAT_TOTAL_ROUNDS
 * 轮的"一轮"这个动作（整场由谁来跑、要不要继续，交给弹窗自己控制，
 * 见 CompanionFriendLiveModal.jsx）。
 *
 * 存储：不新增表、不升级 schema，直接存在 companion.friends 数组里
 * 对应那一项的新字段 liveChat 上（跟 friend.daily / friend.lastStory
 * 一个性质）：
 *   liveChat: {
 *     sceneSeed        这场聊天的开场（pickSceneSeed('talk') 抽一次）
 *     openingSpeaker   'pet' | 'friend'，这场聊天固定先发言的一方
 *     lines            [{ speaker: 'pet' | 'friend', text, timestamp }]
 *     roundsCompleted  已经成功聊完的轮数
 *     quotaCharged     这场聊天有没有结算过额度/友谊值（只结算一次）
 *     startedAt/updatedAt
 *   }
 *
 * 每日清空：跟小伙伴聊天那边同一套"几点算新的一天"规则，复用
 * companionChatService.js 导出的 getChatDayStart，不新增常量、不加
 * 调度器——liveChat.updatedAt 不是"今天"的，读的时候就当没聊过
 * （惰性清空，等用户真的点"开始聊"时才会被新的一场覆盖掉）。
 *
 * 额度/友谊值结算直接复用 companionFriendService.js 的
 * applyFriendSocialResult（已改成命名导出）——跟"互动"一样，扣额度、
 * 加 FRIENDSHIP_DELTA.talk、覆盖 lastStory，不重新写一遍逻辑。已跟
 * user 确认：第一轮成功后才结算，不是一开始就扣。
 */

import db from '../../../../db';
import { getChatDayStart } from '../../chat/companionChatService';
import {
  applyFriendSocialResult,
  isFriendSocialExhausted,
  FRIENDSHIP_DELTA,
} from '../companionFriendService';
import { pickSceneSeed } from '../companionFriendStoryData';
import { generateLiveChatRound } from './companionFriendLiveAiService';

export const LIVE_CHAT_TOTAL_ROUNDS = 3; // 默认连聊几轮，等于这场聊天大约会调用几次 AI

const emptyLiveChat = () => ({
  sceneSeed: '',
  openingSpeaker: 'pet',
  lines: [],
  roundsCompleted: 0,
  quotaCharged: false,
  startedAt: 0,
  updatedAt: 0,
});

// liveChat 的更新时间是不是"今天"的——不是就当没聊过。
export const isLiveChatFresh = (liveChat, now = Date.now()) => (
  Boolean(liveChat?.updatedAt) && liveChat.updatedAt >= getChatDayStart(now)
);

// 给 UI 用的纯函数：从 friend 对象直接算出"今天有效的 liveChat"，拿不到
// 就返回一个空壳，不用等一次数据库查询就能先画出初始界面。
export const getLiveChatOrEmpty = (friend) => (
  isLiveChatFresh(friend?.liveChat) ? friend.liveChat : emptyLiveChat()
);

// 今天是不是已经开始过（哪怕只开了头、一轮都没聊完）——给"我的朋友"卡片
// 判断入口按钮要不要在额度用完时仍然可以点开（看已经聊的内容/接着聊）。
export const hasFreshLiveChat = (friend) => {
  const liveChat = getLiveChatOrEmpty(friend);
  return Boolean(liveChat.sceneSeed);
};

const getFriend = (companion, friendId) => (companion?.friends || []).find((f) => f.id === friendId);

/*
 * 读取某个朋友今天的真聊状态（给弹窗打开时兜底用，平时弹窗直接用
 * getLiveChatOrEmpty 同步算，不用等这个）。
 */
export const getFriendLiveChatView = async (companionId, friendId) => {
  const companion = await db.companions.get(companionId);
  const friend = getFriend(companion, friendId);
  if (!friend) throw new Error('这位朋友不见了。');

  const liveChat = getLiveChatOrEmpty(friend);
  return {
    friend,
    liveChat,
    finished: liveChat.roundsCompleted >= LIVE_CHAT_TOTAL_ROUNDS,
    exhausted: isFriendSocialExhausted(friend),
  };
};

// 把 liveChat 整个写回 companion.friends 对应那一项，返回写回后的 friend。
const writeLiveChat = async (companionId, friendId, liveChat) => {
  const companion = await db.companions.get(companionId);
  if (!companion) throw new Error('小伙伴不存在');

  const friends = companion.friends || [];
  const index = friends.findIndex((f) => f.id === friendId);
  if (index === -1) throw new Error('这位朋友不见了。');

  const next = [...friends];
  next[index] = { ...next[index], liveChat };
  await db.companions.update(companionId, { friends: next, updatedAt: Date.now() });
  return next[index];
};

/*
 * 开始一次新的真聊："开始聊"（第一次）和"再聊一次"（聊完一场之后再来
 * 一场）都走这里：重置 liveChat，重新挑一次场景种子和随机的先发言方。
 * 今天的社交额度已经用完时直接抛错，不往下走（跟 interactWithFriend
 * 开头的检查一样）。
 */
export const startFriendLiveChat = async (companionId, friendId) => {
  const companion = await db.companions.get(companionId);
  const friend = getFriend(companion, friendId);
  if (!friend) throw new Error('这位朋友不见了。');
  if (isFriendSocialExhausted(friend)) {
    throw new Error('今天跟这位朋友的互动次数已经用完啦，明天再来吧。');
  }

  const now = Date.now();
  const liveChat = {
    ...emptyLiveChat(),
    sceneSeed: pickSceneSeed('talk'),
    openingSpeaker: Math.random() < 0.5 ? 'pet' : 'friend',
    startedAt: now,
    updatedAt: now,
  };

  const updatedFriend = await writeLiveChat(companionId, friendId, liveChat);
  return { friend: updatedFriend, liveChat };
};

// 这一场聊天第一次成功的那一轮，顺手结算额度+友谊值+lastStory；
// 额度万一在中途被别的入口用掉了（极少见），只记日志，不让这一轮白聊。
const chargeFirstRound = async (companionId, friendId, { companion, friend, newLines }) => {
  try {
    const petName = companion?.name || '小伙伴';
    const text = newLines
      .map((line) => `${line.speaker === 'friend' ? (friend?.name || '朋友') : petName}："${line.text}"`)
      .join(' ');
    return await applyFriendSocialResult(companionId, friendId, {
      friendshipDelta: FRIENDSHIP_DELTA.talk,
      lastStory: { text, label: '聊天记' },
    });
  } catch (error) {
    console.warn('[CompanionFriendLive] 结算额度/友谊值失败，这一轮已经聊到的内容不受影响:', error);
    return null;
  }
};

/*
 * 跑一轮（一次 AI 调用，两句话）。轮与轮之间要不要继续，由调用方
 * （弹窗）自己控制——这里只管"跑好这一轮、写库、需要的话顺手结算"。
 *
 * AI 失败（包括 generateLiveChatRound 抛出的"没配置 API"之类的错误）
 * 直接往外抛，liveChat 不改一个字——已经聊过的内容原样保留，弹窗据此
 * 把按钮变回"接着聊"。成功就把两句话追加进 lines、roundsCompleted+1；
 * 如果这是这场聊天第一次成功的轮次且还没结算过，顺手结算一次
 * （quotaCharged 标记，防止"接着聊"/重新进入弹窗时重复结算）。
 */
export const runFriendLiveChatRound = async (companionId, friendId, { character } = {}) => {
  const companion = await db.companions.get(companionId);
  const friend = getFriend(companion, friendId);
  if (!friend) throw new Error('这位朋友不见了。');

  const liveChat = getLiveChatOrEmpty(friend);
  if (!liveChat.sceneSeed) {
    throw new Error('这次聊天还没开始，请先点"开始聊"。');
  }
  if (liveChat.roundsCompleted >= LIVE_CHAT_TOTAL_ROUNDS) {
    return { friend, liveChat, finished: true };
  }

  const newLines = await generateLiveChatRound({
    companion,
    friend,
    character,
    sceneSeed: liveChat.sceneSeed,
    openingSpeaker: liveChat.openingSpeaker,
    history: liveChat.lines,
  });

  const now = Date.now();
  const wasFirstRound = !liveChat.quotaCharged;

  let updatedFriend = friend;
  if (wasFirstRound) {
    updatedFriend = (await chargeFirstRound(companionId, friendId, { companion, friend, newLines })) || friend;
  }

  const nextLiveChat = {
    ...liveChat,
    lines: [
      ...liveChat.lines,
      ...newLines.map((line, i) => ({ ...line, timestamp: now + i })),
    ],
    roundsCompleted: liveChat.roundsCompleted + 1,
    quotaCharged: true,
    updatedAt: now,
  };

  updatedFriend = await writeLiveChat(companionId, friendId, nextLiveChat);

  return {
    friend: updatedFriend,
    liveChat: nextLiveChat,
    finished: nextLiveChat.roundsCompleted >= LIVE_CHAT_TOTAL_ROUNDS,
  };
};