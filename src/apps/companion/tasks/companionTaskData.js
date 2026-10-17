/*
 * "小伙伴"每日任务——静态任务池定义。
 *
 * 每天从这个池子里随机抽 DAILY_TASK_COUNT 个（全类型混合，不分配角色/
 * 小伙伴类的配额——用户明确要求"全类型混合"），存进
 * companion.dailyTasks.taskIds，具体的抽取/判定/完成逻辑在
 * companionTaskService.js。
 *
 * 每一项：
 *   id        唯一标识，存进 companion.dailyTasks 用
 *   category  'companion'（照顾小伙伴本身）| 'character'（跟角色互动），
 *             纯展示用的分类标签，不影响抽取逻辑
 *   label     任务文案
 *   note      可选的小字补充说明
 *   eventKey  这个任务关心哪个"事件"——companionTaskService.recordTaskEvent
 *             按 eventKey 匹配今天抽到的任务，不是每个任务都有专属的
 *             判定函数，而是各个功能点各自调用同一个 recordTaskEvent
 *             上报事件，任务系统自己去匹配
 *   target    需要累计多少次才算完成（默认 1）
 *   reward    完成奖励的心心数量
 */

export const TASK_CATEGORIES = {
  COMPANION: 'companion',
  CHARACTER: 'character',
};

export const DAILY_TASK_COUNT = 5;
export const DAILY_TASK_BONUS_HEARTS = 3;

// N 次类任务的次数，单独列出来方便以后调整，也是任务文案里要用到的数字。
export const POKE_TASK_TARGET = 3;
export const STICKER_TASK_TARGET = 2;
export const SCHOOL_TASK_TARGET = 2;
export const CHAT_TASK_TARGET = 10;

export const TASK_POOL = [
  {
    id: 'feed-once',
    category: TASK_CATEGORIES.COMPANION,
    label: '喂TA吃点东西',
    eventKey: 'feed',
    target: 1,
    reward: 1,
  },
  {
    id: 'clean-once',
    category: TASK_CATEGORIES.COMPANION,
    label: '给TA洗干净',
    eventKey: 'clean',
    target: 1,
    reward: 1,
  },
  {
    id: 'play-once',
    category: TASK_CATEGORIES.COMPANION,
    label: '陪TA玩一次',
    eventKey: 'play',
    target: 1,
    reward: 1,
  },
  {
    id: 'shop-buy-once',
    category: TASK_CATEGORIES.COMPANION,
    label: '去商店买一件东西',
    eventKey: 'shop_buy',
    target: 1,
    reward: 1,
  },
  {
    id: 'backpack-use-once',
    category: TASK_CATEGORIES.COMPANION,
    label: '用一次背包里的道具',
    eventKey: 'backpack_use',
    target: 1,
    reward: 1,
  },
  {
    id: 'claw-play-once',
    category: TASK_CATEGORIES.COMPANION,
    label: '去娃娃机玩一次',
    eventKey: 'claw_play',
    target: 1,
    reward: 1,
  },
  {
    id: 'catch-play-once',
    category: TASK_CATEGORIES.COMPANION,
    label: '玩一次接东西小游戏',
    eventKey: 'catch_play',
    target: 1,
    reward: 1,
  },
  {
    id: 'poke-times',
    category: TASK_CATEGORIES.COMPANION,
    label: `戳一戳TA ${POKE_TASK_TARGET} 次`,
    eventKey: 'poke',
    target: POKE_TASK_TARGET,
    reward: 1,
  },
  {
    id: 'sticker-times',
    category: TASK_CATEGORIES.CHARACTER,
    label: `给TA发 ${STICKER_TASK_TARGET} 次表情包`,
    eventKey: 'sticker_sent',
    target: STICKER_TASK_TARGET,
    reward: 1,
  },
  {
    id: 'chat-messages',
    category: TASK_CATEGORIES.CHARACTER,
    label: `跟TA聊满 ${CHAT_TASK_TARGET} 句`,
    eventKey: 'chat_message',
    target: CHAT_TASK_TARGET,
    reward: 2,
  },
  {
    id: 'daily-qa-once',
    category: TASK_CATEGORIES.CHARACTER,
    label: '完成一次每日问答',
    eventKey: 'daily_qa_done',
    target: 1,
    reward: 1,
  },
  {
    id: 'fortune-once',
    category: TASK_CATEGORIES.CHARACTER,
    label: '抽一次今日签',
    eventKey: 'fortune_drawn',
    target: 1,
    reward: 1,
  },
  {
    id: 'school-lessons',
    category: TASK_CATEGORIES.CHARACTER,
    label: `去上 ${SCHOOL_TASK_TARGET} 节课`,
    note: '上学里的课，上够才算完成',
    eventKey: 'school_lesson',
    target: SCHOOL_TASK_TARGET,
    reward: 3,
  },
];

export const findTaskDef = (taskId) => TASK_POOL.find((task) => task.id === taskId) || null;

export const findTaskDefsByEventKey = (eventKey) => TASK_POOL.filter((task) => task.eventKey === eventKey);