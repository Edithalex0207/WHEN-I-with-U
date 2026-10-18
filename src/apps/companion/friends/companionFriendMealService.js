/*
 * companionFriendMealService.js —— "蹭饭"：友谊值 >= 50 的朋友，在托管
 * 巡检时有概率主动跑来蹭一顿饭。
 *
 * 规则（跟设计确认过）：
 *   - 只在 companion.custodyEnabled 打开、且至少有一位 friendship >= 50
 *     的朋友时才会检查；每个小伙伴每天最多蹭饭一次。
 *   - 不走 performFreeAction：那会占当天免费喂食的名额/计数，蹭饭跟
 *     "用户自己喂" "托管帮忙喂" 是三件不同的事，必须分开算，写法照抄
 *     companionService.js 的 triggerCompanionAutonomousCare（直接
 *     db.companions.put 改数值，不碰 freeActionDaily）。
 *   - 不直接去改 companionCustodyService.js 的 custodyDaily 计数——
 *     蹭饭把 satiety 顶上去之后，托管那边自己的"数值 >= 50 就不用买"
 *     判断会自然跳过喂食这一项自动购买，等于"省了一次"，不需要跨文件
 *     互相改状态。scheduledMessageService.js 里把蹭饭的调用排在了托管
 *     前面，但两边都是 void 掉的 fire-and-forget，不是严格同步执行，
 *     所以"同一轮就跳过"只是大概率，不是硬保证——没赶上也没关系，
 *     satiety 已经涨了，下一轮（2 分钟后）托管巡检一样会跳过那一项。
 *   - 友谊值再 +3（原始设计稿定的量，跟三个社交按钮的 delta 分开定义，
 *     不借用 FRIENDSHIP_DELTA.visit，免得以后改了串门的值连带把蹭饭的
 *     涨幅也改掉）。
 *   - 产出一封"蹭饭"待读信，结构照抄 custodyPendingLetter，取走即清空；
 *     同时留一条 logType: 'friend_meal' 的时间线记录。
 *
 * 依赖方向：本文件 import companionFriendService.js 的
 * FRIEND_MEAL_THRESHOLD 常量，companionFriendService.js 不反过来 import
 * 本文件，没有循环依赖。调度入口 runFriendMealTick 由
 * scheduledMessageService.js 现有的 60 秒调度器顺路调用，不新增定时器。
 */

import db from '../../../db';
import { FRIEND_MEAL_THRESHOLD } from './companionFriendService';

export const FRIEND_MEAL_SATIETY_GAIN = 22;
export const FRIEND_MEAL_FRIENDSHIP_GAIN = 3;

// 每次巡检、每个符合条件的小伙伴，命中这个概率才会真的蹭一顿（每天最多一次）。
const FRIEND_MEAL_CHANCE = 0.3;
// satiety 已经很高就不蹭了（不然顶到 100 没意义，还占当天名额）。
const FRIEND_MEAL_SATIETY_CEILING = 75;
// 调度器每次 tick 最少间隔，跟 companionCustodyService.js 的节奏保持一致。
const TICK_MIN_GAP_MS = 2 * 60 * 1000;

const clamp100 = (value) => Math.max(0, Math.min(100, Math.round(value)));

const todayDateStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const MEAL_LINES = [
  '闻着味儿就跑过来了，一点都不见外。',
  '说"就吃一口"，结果吃了一整盘。',
  '蹭完饭还打了个饱嗝，心满意足地走了。',
  '一进门就直奔饭碗，熟门熟路的样子。',
];
const pickRandom = (pool) => pool[Math.floor(Math.random() * pool.length)];

const runFriendMealInner = async (companionId) => {
  const companion = await db.companions.get(companionId);
  if (!companion || !companion.custodyEnabled) return false;
  if ((companion.satiety ?? 100) >= FRIEND_MEAL_SATIETY_CEILING) return false;

  const dateStr = todayDateStr();
  if (companion.friendMealDaily?.dateStr === dateStr && companion.friendMealDaily?.happened) {
    return false; // 今天已经蹭过了
  }

  const eligible = (companion.friends || []).filter((f) => f.friendship >= FRIEND_MEAL_THRESHOLD);
  if (eligible.length === 0) return false;

  if (Math.random() >= FRIEND_MEAL_CHANCE) {
    // 没中概率，也记一下"今天检查过"，避免同一天被反复判定（但还没真的发生）。
    return false;
  }

  const friend = pickRandom(eligible);
  const now = Date.now();

  const friends = companion.friends || [];
  const index = friends.findIndex((f) => f.id === friend.id);
  if (index === -1) return false;

  const nextFriends = [...friends];
  nextFriends[index] = {
    ...friend,
    friendship: clamp100(friend.friendship + FRIEND_MEAL_FRIENDSHIP_GAIN),
  };

  const updated = {
    ...companion,
    satiety: clamp100((companion.satiety ?? 100) + FRIEND_MEAL_SATIETY_GAIN),
    friends: nextFriends,
    friendMealDaily: { dateStr, happened: true },
    friendMealPendingLetter: {
      id: now,
      timestamp: now,
      friendId: friend.id,
      friendName: friend.name,
      friendAvatarId: friend.avatarId,
      satietyGain: FRIEND_MEAL_SATIETY_GAIN,
      friendshipGain: FRIEND_MEAL_FRIENDSHIP_GAIN,
      line: pickRandom(MEAL_LINES),
    },
    updatedAt: now,
  };

  await db.companions.put(updated);

  await db.companionLogs.add({
    companionId,
    logType: 'friend_meal',
    actionType: 'friend_meal',
    content: `${friend.name}来蹭了顿饭，吃得饱饱的～`,
    timestamp: now,
  });

  return true;
};

const runningIds = new Set();

/*
 * 对一只小伙伴检查一次是否触发蹭饭。同一只同时只跑一轮，出错只打日志。
 */
export const runFriendMealForCompanion = async (companionId) => {
  if (runningIds.has(companionId)) return false;
  runningIds.add(companionId);
  try {
    return await runFriendMealInner(companionId);
  } catch (error) {
    console.error('[CompanionFriend] 蹭饭检查失败:', error);
    return false;
  } finally {
    runningIds.delete(companionId);
  }
};

/*
 * 取走还没弹过的"蹭饭"信（取走即清空）。没有就返回 null。
 */
export const takePendingFriendMealLetter = async (companionId) => {
  const companion = await db.companions.get(companionId);
  const letter = companion?.friendMealPendingLetter || null;
  if (!letter) return null;
  await db.companions.update(companionId, { friendMealPendingLetter: null });
  return letter;
};

let lastTickAt = 0;

/*
 * 调度入口：挂在 scheduledMessageService.js 现有的调度器上。刻意排在
 * runCustodyTick 之前调用（见 scheduledMessageService.js），这样蹭饭
 * 顶高的 satiety 能在同一轮巡检里让托管的自动购买判断跳过喂食那一项。
 */
export const runFriendMealTick = async () => {
  const now = Date.now();
  if (now - lastTickAt < TICK_MIN_GAP_MS) return;
  lastTickAt = now;

  try {
    const companions = await db.companions.toArray();
    for (const companion of companions) {
      if (companion.custodyEnabled && (companion.friends || []).length > 0) {
        await runFriendMealForCompanion(companion.id);
      }
    }
  } catch (error) {
    console.error('[CompanionFriend] 蹭饭巡检失败:', error);
  }
};