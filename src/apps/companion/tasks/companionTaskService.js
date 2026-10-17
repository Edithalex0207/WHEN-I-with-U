/*
 * "小伙伴"每日任务——抽取/进度/完成逻辑。
 *
 * 存储方式：companion.dailyTasks（新增的单个字段，不建新表、不用升
 * Dexie 版本号，跟 companion.freeActionDaily/chatHeartProgress 是同一个
 * 思路），形状：
 *   {
 *     dateStr: '2026-10-17',
 *     taskIds: ['feed-once', 'poke-times', ...],   // 今天抽到的几个任务
 *     progress: { 'poke-times': 2, ... },          // 累计进度，没出现的算 0
 *     completedIds: ['feed-once', ...],             // 已完成（已发过奖励）的
 *     bonusClaimed: false,                           // 全部完成的额外奖励发过没有
 *   }
 *
 * 各个功能点（喂食/戳一戳/发表情包/写日记/……）不需要知道任务系统内部
 * 怎么存，只需要在对应动作发生时调用 recordTaskEvent(companionId, eventKey)
 * 上报一个事件，任务系统自己去匹配今天抽到的任务里有没有对应的、没完成
 * 的任务，进度够了就自动发奖励、写日志——跟免费互动一样是"做了就算"，
 * 不需要用户额外去任务面板里点"领取"。
 */

import db from '../../../db';
import { DAILY_TASK_BONUS_HEARTS, DAILY_TASK_COUNT, findTaskDefsByEventKey, TASK_POOL } from './companionTaskData';

const todayDateStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// 从任务池里不重复地随机抽 count 个 id。池子目前远大于每天要抽的数量，
// 不用担心重复抽样次数过多的问题。
const drawRandomTaskIds = (count) => {
  const pool = [...TASK_POOL];
  const picked = [];

  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0].id);
  }

  return picked;
};

const emptyDailyTasks = (dateStr) => ({
  dateStr,
  taskIds: drawRandomTaskIds(DAILY_TASK_COUNT),
  progress: {},
  completedIds: [],
  bonusClaimed: false,
});

/*
 * 确保 companion.dailyTasks 是"今天"的——跨天了就重新抽一批、进度清零。
 * 其它函数（getDailyTaskView/recordTaskEvent）都先调这个，保证拿到的
 * 永远是今天有效的任务集合，不用在每个调用点各自判断日期。
 *
 * 跨天重抽会直接写回 db（跟 performFreeAction 里 freeActionDaily 跨天
 * 重置是同一个思路），返回的是写回之后的 companion。
 */
const ensureDailyTasks = async (companion) => {
  const dateStr = todayDateStr();
  if (companion.dailyTasks?.dateStr === dateStr) return companion;

  const dailyTasks = emptyDailyTasks(dateStr);
  await db.companions.update(companion.id, { dailyTasks });
  return { ...companion, dailyTasks };
};

/*
 * 给页面用的展示视图：把今天抽到的 taskId 列表换成完整的任务信息
 * （label/reward/target/当前进度/是否完成），再附上总体进度和奖励状态。
 *
 * 调用方（CompanionPage.jsx/CompanionTasksModal.jsx）只需要：
 *   const companion = await getCompanionByChat(chatId); // 已经 ensure 过
 *   const view = await getDailyTaskView(companion.id);
 */
export const getDailyTaskView = async (companionId) => {
  let companion = await db.companions.get(companionId);
  if (!companion) return null;
  companion = await ensureDailyTasks(companion);

  const { dailyTasks } = companion;
  const tasks = dailyTasks.taskIds.map((taskId) => {
    const def = TASK_POOL.find((task) => task.id === taskId);
    if (!def) return null;
    const progress = Math.min(dailyTasks.progress?.[taskId] || 0, def.target);
    const done = dailyTasks.completedIds.includes(taskId);
    return { ...def, progress, done };
  }).filter(Boolean);

  const completedCount = tasks.filter((task) => task.done).length;

  return {
    dateStr: dailyTasks.dateStr,
    tasks,
    completedCount,
    totalCount: tasks.length,
    bonusHearts: DAILY_TASK_BONUS_HEARTS,
    bonusClaimed: dailyTasks.bonusClaimed,
    allDone: tasks.length > 0 && completedCount === tasks.length,
  };
};

// 未读徽标用：今天还有几个任务没做（抽到了但还没完成的数量）。
export const getPendingTaskCount = async (companionId) => {
  const view = await getDailyTaskView(companionId);
  if (!view) return 0;
  return view.totalCount - view.completedCount;
};

/*
 * 上报一次任务事件。eventKey 对应 companionTaskData.js 里任务定义的
 * eventKey（比如 'feed'、'poke'、'sticker_sent'）。incrementBy 默认 1，
 * 戳一戳/发表情包这种"按次数累计"的任务，调用方每发生一次就调一次
 * （不用自己算总数，这里会自己把每日进度存起来）。
 *
 * 只有"今天恰好抽到了这个 eventKey 对应的任务、且这个任务还没完成"
 * 时才会真正产生效果——抽不到就只是静默忽略，调用方不需要关心今天
 * 有没有抽到这个任务，所有互动点都可以无条件调用这个函数。
 *
 * 返回值：
 *   null                    没有命中任何今天的任务（没抽到/已完成），
 *                           companion 没有变化
 *   { companion, completedTask, bonusGranted }
 *                           companion 是最新状态；completedTask 是刚好
 *                           达成 target、完成了的任务定义（没达成就是
 *                           null，只是进度 +1）；bonusGranted 表示这次
 *                           顺带触发了"全部完成"的额外奖励
 */
export const recordTaskEvent = async (companionId, eventKey, incrementBy = 1) => {
  if (!companionId || !eventKey) return null;

  let companion = await db.companions.get(companionId);
  if (!companion) return null;
  companion = await ensureDailyTasks(companion);

  const { dailyTasks } = companion;
  const candidateIds = findTaskDefsByEventKey(eventKey).map((def) => def.id);
  const activeTaskId = dailyTasks.taskIds.find(
    (taskId) => candidateIds.includes(taskId) && !dailyTasks.completedIds.includes(taskId)
  );
  if (!activeTaskId) return null; // 今天没抽到这个任务，或者已经做完了

  const def = TASK_POOL.find((task) => task.id === activeTaskId);
  const prevProgress = dailyTasks.progress?.[activeTaskId] || 0;
  const nextProgress = Math.min(prevProgress + incrementBy, def.target);
  const justCompleted = nextProgress >= def.target;

  const nextCompletedIds = justCompleted
    ? [...dailyTasks.completedIds, activeTaskId]
    : dailyTasks.completedIds;

  const now = Date.now();
  let heartsDelta = 0;
  let bonusGranted = false;

  if (justCompleted) {
    heartsDelta += def.reward;

    const allDoneNow = dailyTasks.taskIds.every((taskId) => nextCompletedIds.includes(taskId));
    if (allDoneNow && !dailyTasks.bonusClaimed) {
      heartsDelta += DAILY_TASK_BONUS_HEARTS;
      bonusGranted = true;
    }
  }

  const nextDailyTasks = {
    ...dailyTasks,
    progress: { ...dailyTasks.progress, [activeTaskId]: nextProgress },
    completedIds: nextCompletedIds,
    bonusClaimed: dailyTasks.bonusClaimed || bonusGranted,
  };

  const updated = {
    ...companion,
    dailyTasks: nextDailyTasks,
    hearts: Math.round(((companion.hearts || 0) + heartsDelta) * 10) / 10,
    updatedAt: now,
  };

  await db.companions.put(updated);

  if (justCompleted) {
    await db.companionLogs.add({
      companionId,
      logType: 'user_action',
      actionType: 'task_complete',
      content: bonusGranted
        ? `完成了"${def.label}"，今天的任务全部做完啦，额外拿到 ${DAILY_TASK_BONUS_HEARTS} 颗心心！`
        : `完成了"${def.label}"，拿到了 ${def.reward} 颗心心。`,
      timestamp: now,
    });
  }

  return {
    companion: updated,
    completedTask: justCompleted ? def : null,
    bonusGranted,
  };
};

/*
 * 给只有 chatId、没有 companionId 的调用点用（比如 ChatRoom.jsx 发表情包
 * 的地方）——内部自己查一次 companion，查不到（这个聊天窗没养小伙伴）
 * 就静默跳过，不抛错，不影响调用方自己的主流程。
 */
export const recordTaskEventForChat = async (chatId, eventKey, incrementBy = 1) => {
  if (chatId === null || chatId === undefined) return null;
  const companion = await db.companions.where('chatId').equals(chatId).first();
  if (!companion) return null;
  return recordTaskEvent(companion.id, eventKey, incrementBy);
};

export default {
  getDailyTaskView,
  getPendingTaskCount,
  recordTaskEvent,
  recordTaskEventForChat,
};