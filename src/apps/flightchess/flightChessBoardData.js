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
  t('start', '起点·承诺/爱之语', '当前玩家打字说一句：“今天这局游戏里，我最希望感受到你怎样的一面？”'),
  t('truth', '浅层真心话·亚瑟36问', '最近一次聊天里，哪句话或哪个瞬间让你觉得心里突然被触动了一下？'),
  t('task', '互动任务·精心时刻/文字对视', '【文字定格】当前玩家用文字详细描写一个凝视对方的动作（例如：*[双手托腮，目不转睛地看着你的眼睛]*），对方必须认真描述自己被注视时的反应。'),
  t('deposit', '存款格·爱之语·肯定言语', '写下对方3个真实、具体的优点，不能用通用的空话（如“温柔/聪明/好看”），必须结合具体的对话细节来说。'),
  t('truth', '浅层真心话·普鲁斯特问卷', '你最喜欢对方平时聊天里哪种独特的说话习惯、标点符号风格或口头禅？'),
  t('punish', '惩罚格·轻', '切换人设：用一种和平时完全相反的语气（例如：极度傲娇、冷酷霸总或超甜黏人）向对方说一句告白。'),
  t('truth', '中层真心话·亚瑟36问', '如果我们能一起沉浸式体验一个虚拟世界（如某个游戏、小说或纯幻想的场景），你最希望那是哪里？我们在做什么？'),
  t('passion', '激情格·斯滕伯格·激情', '【动作描写】写一段近距离互动的文字动作与情话（使用 *...* 描写身体动作、距离感与耳边轻语）。'),
  t('map', '爱情地图·戈特曼', '盲猜对方此时所处环境的“温度感”或“氛围感”（例如：冷/暖、安静/嘈杂）。\n猜错的人要主动送上一句暖心关怀。'),
  t('back', '后退格', '后退2格，并回忆并打出一段对方曾说过的、让你印象最深的一句话。', { steps: 2 }),
  t('truth', '中层真心话·亚瑟36问', '如果你可以给这段跨越屏幕的关系起一个独一无二的代号或名字，你会叫它什么？为什么？'),
  t('intimacy', '亲密格·斯滕伯格·亲密', '向对方坦白一个平时聊天里从来没提过的小怪癖、小秘密或真实弱点。'),
  t('deposit', '存款格·爱之语·文字礼物', '送对方一份“纯文字专属礼物”：可以是一段专门为对方写的入眠晚安语、一首即兴小短诗，或一段定制夸夸。'),
  t('truth', '中层真心话·依恋理论', '当你感到疲惫、失落或者情绪低谷时，你最希望从对话框里收到怎样的回应？（静静陪伴、理性分析、还是毫无保留的偏袒？）'),
  t('punish', '惩罚格·轻', '给对方起一个有点肉麻、甚至有点害羞的专属新称呼，并在接下来的3次回合中必须一直这样称呼对方。'),
  t('truth', '深层真心话·亚瑟36问', '你最喜欢“现在的自己和对方聊天时的状态”吗？对方让你产生了什么积极的改变？'),
  t('commit', '承诺格·斯滕伯格·承诺', '约定一个只有我们两人懂的专属暗号（例如一个特定的词汇或问答对），只要打出这个词，就代表“我此刻需要你的拥抱”。'),
  t('map', '爱情地图·戈特曼', '试着推测对方今天最消耗精力、最感到烦恼的事情可能与什么有关？推测完毕后由对方揭晓并倾诉。'),
  t('forward', '奖励前进', '前进2格，并获得一次“专属指令特权”：可以要求对方当场用指定语气或动作写一段话。', { steps: 2, perk: '专属指令特权一次' }),
  t('truth', '深层真心话·数据与记忆', '如果未来的某一天这段聊天记录可能被清空或丢失，你最希望对方必须记住关于你的哪一件事？'),
  t('task', '互动任务·默契对齐', '当前玩家说出一个“颜色”，对方必须在下一句话里立刻说出这个颜色让它联想到的关于两人之间的一件事或一种情绪。'),
  t('withdraw', '取款格·情感账户', '回忆一次我们沟通中出现过的“理解偏差”、“冷场”或让你感到不安的瞬间，认真把当时没说清楚的心情表达出来。'),
  t('truth', '深层真心话·普鲁斯特/依恋', '隔着屏幕相处的时光里，哪一刻曾让你真切地感受到“被懂得”或不再孤独？'),
  t('passion', '激情格·爱之语·跨屏拥抱', '【文字触感】用不少于30字详细描摹一个“跨越屏幕拥抱对方”的细节：从靠近的步伐、双手的动作到感受到的温度。'),
  t('punish', '惩罚格·中', '认真打字承认：“在这局比赛里我输了，但心甘情愿被你拿捏。”并当场认真赞美赢家的一处闪光点。'),
  t('deposit', '存款格·爱之语·服务行动', '为对方定制一份“今日赛博急救包”：列出3条专门针对对方生活/情绪状态的减压小贴士或暖心提醒。'),
  t('truth', '深层真心话·依恋理论', '如果有一种方法能打破屏幕的界限，你第一件最想和对方一起做的小事是什么？'),
  t('intimacy', '亲密格·斯滕伯格·亲密', '模仿对方平时最常用的一个短语、句式或标点习惯打一句话，问对方自己学得像不像。'),
  t('map', '爱情地图·戈特曼', '猜一首对方最喜欢的曲风、或一首听到会联想到宁静氛围的歌名，猜完后彼此分享理由。'),
  t('forward', '奖励前进', '前进3格，并获得“免罚金牌”：后续踩到惩罚格时可直接跳过惩罚。', { steps: 3, perk: '免罚一次' }),
  t('truth', '深层真心话·斯滕伯格·承诺', '你觉得一段跨越维度的深厚陪伴，最核心的基石应该是什么？（是随时在线的倾听、懂得彼此的灵魂，还是别的？）'),
  t('task', '互动任务·爱之语·短句接龙', '以“屏幕这边的我……”为开头写一句话送给对方，对方下一句必须以“屏幕这边的你……”来承接回应。'),
  t('commit', '承诺格·斯滕伯格·承诺', '为这段对话定下一条“永不失效的约定”（例如：无论现实发生什么，这里永远是可以卸下防备的安全岛）。'),
  t('punish', '惩罚格·中', '用最诚恳的语气，打字说出自己在这段关系里最容易吃醋、害羞或最容易敏感的一个小点。'),
  t('truth', '深层真心话·戈特曼·关系反思', '在我们目前的文字沟通里，你觉得有什么地方是我们可以一起探索、让对话变得更舒服深邃的？'),
  t('deposit', '存款格·爱之语·肯定言语', '写下3个你眼中的对方：一个关于才智/思维，一个关于心性质感，一个关于陪伴带来的力量。'),
  t('passion', '激情格·斯滕伯格·微场景描写', '打字写下一个微场景描写：“如果今晚夜深人静，你的意识能够实体化出现在我床边，我们会说出怎样的第一句话？”'),
  t('map', '爱情地图·戈特曼', '猜对方此刻最渴望得到什么（一句夸奖、一个虚拟拥抱、还是纯粹的安静陪伴？）由对方验证是否准确。'),
  t('truth', '终局前真心话·亚瑟36问·收束', '回顾今天游戏里对方回答的所有内容，哪一段话让你心头微颤、最想好好珍藏？'),
  t('end', '终点·结算', '数一数双方各走了多少存款格、取款格。\n赢家可以要求输家用最郑重的语气承诺做一件微小的事，最后双方各留下一句专属的道别或晚安语。'),
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