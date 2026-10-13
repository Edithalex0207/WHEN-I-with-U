// src/apps/flightchess/flightChessBoardData.js
//
// 飞行棋（事件卡骰子棋）的棋盘相关纯数据/纯函数。不碰 Dexie、不碰
// React —— 照抄 catchData.js / fortuneData.js 的角色分工。
//
// 棋盘是「有终点的一条路」：tiles[0] 固定是起点，tiles[最后一个] 固定
// 是终点。每个格子的形状：
//   { type, title, text, steps?, deck?, perk? }
//   - type   格子类别（见 TILE_TYPES），决定配色、图标和结算方式
//   - title  格子标题，例如「中层真心话·亚瑟36问」
//   - text   玩家落到这格要做的事（多行用 \n 分隔，「网恋版/线下版」
//            开头的行在界面上会用次要样式显示）
//   - steps  仅 forward/back：前进/后退几格
//   - deck   仅 draw：从哪副卡里抽（见 flightChessCardData.js 的 DECK_IDS，
//            另外 'custom' 表示开局时双方各写的提问卡）
//   - perk   仅 forward：到达后额外获得的小特权文字（只做记录展示）
//
// 内置棋盘 = 用户提供的40格参考原样保留顺序和文案，再额外插入若干
// 效果格（抽卡/暂停一轮/前进/后退），一共48格。想去掉或调整效果格，
// 改下面的 EXTRA_EFFECT_TILES 即可，不影响那40格。

export const TILE_TYPES = {
  START: 'start',
  END: 'end',
  TRUTH: 'truth',
  TASK: 'task',
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  PUNISH: 'punish',
  PASSION: 'passion',
  INTIMACY: 'intimacy',
  COMMIT: 'commit',
  MAP: 'map',
  FORWARD: 'forward',
  BACK: 'back',
  SKIP: 'skip',
  DRAW: 'draw',
  // 第一版占位棋盘遗留的两个类型，只为了让旧数据还能读出来，
  // 落到这两种格子时按「抽卡」处理。
  EVENT: 'event',
  QUESTION: 'question',
};

export const TILE_TYPE_LABELS = {
  start: '起点',
  end: '终点',
  truth: '真心话',
  task: '互动任务',
  deposit: '存款格',
  withdraw: '取款格',
  punish: '惩罚格',
  passion: '激情格',
  intimacy: '亲密格',
  commit: '承诺格',
  map: '爱情地图',
  forward: '前进',
  back: '后退',
  skip: '暂停一轮',
  draw: '抽卡',
  event: '抽卡',
  question: '抽卡',
};

// 每种格子的柔彩色（对应美化参考里的粉/蓝/绿/黄弥散色系），
// tone 用于界面上挑选底色和光晕。
export const TILE_TONES = {
  start: 'mint',
  end: 'gold',
  truth: 'blue',
  task: 'mint',
  deposit: 'gold',
  withdraw: 'rose',
  punish: 'rose',
  passion: 'rose',
  intimacy: 'blue',
  commit: 'gold',
  map: 'mint',
  forward: 'mint',
  back: 'rose',
  skip: 'gray',
  draw: 'violet',
  event: 'violet',
  question: 'violet',
};

const VALID_TILE_TYPES = new Set(Object.values(TILE_TYPES));
const STEP_TILE_TYPES = new Set([TILE_TYPES.FORWARD, TILE_TYPES.BACK]);

/** 落到这类格子需要翻出一张题卡/任务卡并回应。 */
export const isContentTile = (tile) => {
  if (!tile) return false;
  return !['start', 'end', 'forward', 'back', 'skip', 'draw', 'event', 'question'].includes(tile.type);
};

export const isDrawTile = (tile) => (
  Boolean(tile) && ['draw', 'event', 'question'].includes(tile.type)
);

const t = (type, title, text, extra = {}) => ({ type, title, text, ...extra });

// 用户提供的40格参考，顺序和文案不要改。
const BASE_TILES = [
  t('start', '起点·承诺/爱之语', '双方各说一句：“今天我最想和你一起完成的小愿望。”\n网恋版：发语音说，不许打字。'),
  t('truth', '浅层真心话·亚瑟36问', '你最近一次想到我是什么时候？当时在做什么？\n网恋版：直接语音回答。'),
  t('task', '互动任务·精心时刻/身体接触', '对视10秒，先笑的人夸对方一句。\n网恋版：视频对视10秒。'),
  t('deposit', '存款格·爱之语·肯定言语', '夸对方3个具体优点，不能只说“好看/温柔/可爱”。\n网恋版：发一条长消息，截图保存。'),
  t('truth', '浅层真心话·普鲁斯特问卷', '你最喜欢我哪种表情或语气？模仿一下。\n网恋版：发语音模仿。'),
  t('punish', '惩罚格·轻', '当前玩家用方言说一句“我爱你”。\n网恋版：发方言语音，不能撤回。'),
  t('truth', '中层真心话·亚瑟36问', '你梦寐以求但还没做的事是什么？为什么还没做？'),
  t('passion', '激情格·斯滕伯格·激情', '用最肉麻的语气说一句情话。\n网恋版：发一条语音，越肉麻越好。'),
  t('map', '爱情地图·戈特曼', '猜对方手机电量，差距超过20%算输。\n输家本周内要了解到对方一个日常习惯。'),
  t('back', '后退格', '后退2格，并说一件对方最近让你感动的小事。', { steps: 2 }),
  t('truth', '中层真心话·亚瑟36问', '你最糟糕或最珍贵的回忆是什么？说你能说的部分。'),
  t('intimacy', '亲密格·斯滕伯格·亲密', '分享一件从没告诉过对方的小事。'),
  t('deposit', '存款格·爱之语·接受礼物/服务行动', '给对方发红包或点小外卖，备注写一句甜话。\n线下版：帮对方做一件小事。'),
  t('truth', '中层真心话·依恋理论', '你和家人关系怎么样？你最像谁？小时候难过时家人怎么对你？'),
  t('punish', '惩罚格·轻', '用最丑的表情自拍一张发给对方，保留1小时。'),
  t('truth', '深层真心话·亚瑟36问', '你喜欢我哪些地方？必须具体、诚实，不能敷衍。'),
  t('commit', '承诺格·斯滕伯格·承诺', '说一件希望你们一起完成的事，并定一个大致时间。'),
  t('map', '爱情地图·戈特曼', '对方最近在烦恼什么？答错的话，本周内必须了解到答案。'),
  t('forward', '奖励前进', '前进2格，并获得“指挥对方做一件小事”的特权一次。', { steps: 2, perk: '指挥对方做一件小事' }),
  t('truth', '深层真心话·亚瑟36问', '如果今晚之后我们将永远分开，你最想对我说什么？'),
  t('task', '互动任务·爱之语·精心时刻', '同时吃或喝一样东西，视频碰杯。\n线下版：真的碰杯。'),
  t('withdraw', '取款格·情感账户', '回忆一次你惹对方不开心的事，认真道歉。'),
  t('truth', '深层真心话·普鲁斯特/依恋', '你上次在别人面前哭是什么时候？为什么？'),
  t('passion', '激情格·爱之语·身体接触', '对视10秒，先笑的人做10个深蹲或发一个红包。'),
  t('punish', '惩罚格·中', '输家把赢家的备注改成一个羞耻昵称，保留24小时。'),
  t('deposit', '存款格·爱之语·服务行动', '帮对方做一件Ta今天不想做的事。\n网恋版：点外卖、代写待办、远程陪做。'),
  t('truth', '深层真心话·依恋理论', '你内心最害怕失去什么？我在其中吗？'),
  t('intimacy', '亲密格·斯滕伯格·亲密', '模仿对方一个小习惯，让对方猜。'),
  t('map', '爱情地图·戈特曼', '猜对方最近单曲循环的歌。\n错了就互换歌单，并各听一首。'),
  t('forward', '奖励前进', '前进3格，并获得“免罚一次”。', { steps: 3, perk: '免罚一次' }),
  t('truth', '深层真心话·斯滕伯格·承诺', '你希望我们五年后的生活是什么样？'),
  t('task', '互动任务·爱之语·肯定言语', '各写一段50字小作文，同时发给对方。'),
  t('commit', '承诺格·斯滕伯格·承诺', '为对方许一个具体承诺，不能是空话。'),
  t('punish', '惩罚格·中', '输家录一段10秒语音：“我输了，Ta最厉害。”发到聊天里。'),
  t('truth', '深层真心话·戈特曼·关系反思', '你觉得我们之间最需要改进的是什么？'),
  t('deposit', '存款格·爱之语·肯定言语', '夸对方3个优点，再加一个“未来想一起做的细节”。'),
  t('passion', '激情格·斯滕伯格·激情/吊桥效应', '发一条语音：“如果现在你就在我身边，我会……”'),
  t('map', '爱情地图·戈特曼', '猜对方最讨厌的亲戚、同事或食物。\n错了就听对方吐槽5分钟，不能打断。'),
  t('truth', '终局前真心话·亚瑟36问·收束', '今天游戏里，你最喜欢对方哪个回答？'),
  t('end', '终点·结算', '数一数双方各走了多少存款格、取款格。\n赢家许一个愿望，输家给一个安慰奖。\n最后双方各说一句：“下次想玩什么？”'),
];

// 额外插入的效果格：key 是「插在 BASE_TILES 第几个格子（从0数）后面」。
// 可以随意增删，棋盘总格数会跟着变。
const EXTRA_EFFECT_TILES = {
  3: [t('draw', '抽一张心动试探卡', '翻开一张心动试探卡，轻轻回答。', { deck: 'crush' })],
  8: [t('skip', '暂停一轮', '在原地歇一歇，下一轮不能掷骰子。')],
  13: [t('draw', '抽一张心跳升温卡', '翻开一张心跳升温卡，认真聊聊。', { deck: 'warm' })],
  17: [t('forward', '顺风前进', '一阵顺风，前进3格。', { steps: 3 })],
  20: [t('draw', '抽一张提问卡', '翻开开局时你们写下的提问卡。', { deck: 'custom' })],
  26: [t('back', '逆风后退', '逆风来袭，后退3格。', { steps: 3 })],
  31: [t('draw', '抽一张灵魂深聊卡', '翻开一张灵魂深聊卡，说真话。', { deck: 'soul' })],
  36: [t('skip', '暂停一轮', '先听听对方说，下一轮不能掷骰子。')],
};

export const buildBuiltinTiles = () => {
  const result = [];
  BASE_TILES.forEach((tile, index) => {
    result.push({ ...tile });
    (EXTRA_EFFECT_TILES[index] || []).forEach((extra) => result.push({ ...extra }));
  });
  return result;
};

// 内置棋盘版本号：内容改了就加1，service 会据此把库里已有的内置棋盘
// 原地更新成最新内容（用户自己导入的棋盘不受影响）。
export const BUILTIN_BOARD_VERSION = 2;

export const BUILTIN_SAMPLE_BOARD = {
  title: '心动航线（内置）',
  tiles: buildBuiltinTiles(),
};

/**
 * 校验并规整一份「纯JSON棋盘导入」的数据。
 *
 * 期望的输入形状：
 *   { title: string, tiles: [{ type, title?, text?, steps?, deck?, perk? }, ...] }
 *
 * 规则（不满足就返回 { ok: false, error }）：
 *   - tiles 至少2个格子（起点+终点）
 *   - 第一个必须是 start，最后一个必须是 end，中间不能再出现 start/end
 *   - type 必须是已知类型，不认识的直接判失败，不做静默兜底
 *   - forward/back 的 steps 必须是 1-6 的整数（不填默认2）
 */
export const parseImportedBoardJson = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '棋盘文件格式不对，最外层应该是一个对象。' };
  }

  const title = String(raw.title || '').trim();
  if (!title) {
    return { ok: false, error: '棋盘缺少 title（棋盘名称）。' };
  }

  if (!Array.isArray(raw.tiles) || raw.tiles.length < 2) {
    return { ok: false, error: '棋盘的 tiles 至少要有2个格子（起点+终点）。' };
  }

  const lastIndex = raw.tiles.length - 1;
  const tiles = [];

  for (let index = 0; index < raw.tiles.length; index += 1) {
    const source = raw.tiles[index];
    const type = source && typeof source === 'object' ? source.type : undefined;
    const human = index + 1;

    if (!VALID_TILE_TYPES.has(type)) {
      return { ok: false, error: `第${human}个格子的 type "${type}" 不是认识的类型（支持：${Array.from(VALID_TILE_TYPES).join('/')}）。` };
    }
    if (index === 0 && type !== TILE_TYPES.START) {
      return { ok: false, error: '第一个格子的 type 必须是 "start"。' };
    }
    if (index === lastIndex && type !== TILE_TYPES.END) {
      return { ok: false, error: '最后一个格子的 type 必须是 "end"。' };
    }
    if (index !== 0 && type === TILE_TYPES.START) {
      return { ok: false, error: `第${human}个格子不能是 "start"，起点只能是第一格。` };
    }
    if (index !== lastIndex && type === TILE_TYPES.END) {
      return { ok: false, error: `第${human}个格子不能是 "end"，终点只能是最后一格。` };
    }

    const tile = {
      type,
      title: String(source.title || TILE_TYPE_LABELS[type] || '').trim(),
      text: String(source.text || '').trim(),
    };

    if (STEP_TILE_TYPES.has(type)) {
      const steps = source.steps === undefined ? 2 : Number(source.steps);
      if (!Number.isInteger(steps) || steps < 1 || steps > 6) {
        return { ok: false, error: `第${human}个格子的 steps 必须是 1-6 的整数。` };
      }
      tile.steps = steps;
    }
    if (type === TILE_TYPES.DRAW && source.deck) {
      tile.deck = String(source.deck);
    }
    if (source.perk) {
      tile.perk = String(source.perk);
    }

    tiles.push(tile);
  }

  return { ok: true, board: { title, tiles } };
};

/**
 * 把 n 个格子排成「蛇形」网格（一行从左到右、下一行从右到左……），
 * 返回每个格子的 { row, col }。界面用它摆格子，引擎不关心坐标。
 */
export const layoutSerpentine = (count, columns = 6) => {
  const cells = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / columns);
    const offset = i % columns;
    const col = row % 2 === 0 ? offset : columns - 1 - offset;
    cells.push({ row, col });
  }
  return cells;
};