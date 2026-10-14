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
  t('start', '起点·承诺/爱之语', '双方各打字说一句：“今天我最想和你一起完成的一个微小心愿。”'),
  t('truth', '浅层真心话·亚瑟36问', '你今天（或最近一次）突然强烈想起我，是因为触发了什么开关？（一句话、某张图、还是一瞬间的情绪？）'),
  t('task', '互动任务·精心时刻/赛博对视', '倒数 3、2、1，同时发送一个“代表此刻看向对方眼神”的表情包，表情最害羞/先顶不住的人夸对方一句。'),
  t('deposit', '存款格·爱之语·肯定言语', '列举对方 3 个具体特质（必须是隔着屏幕聊天中真实感受到的细节，不能只说“可爱/温柔”），发一段走心文字截图保存。'),
  t('truth', '浅层真心话·普鲁斯特问卷', '你最喜欢我平时聊天里的哪句口头禅、标点习惯或说话语气？打字模仿一下。'),
  t('punish', '惩罚格·轻', '用一种和平时反差极大的语气（如极度中二/傲娇霸道/甜度超标）打字向对方表白一句话。'),
  t('truth', '中层真心话·亚瑟36问', '你一直很想和对方一起体验（不管是现实中还是虚拟世界里），但至今还没做成的一件事是什么？'),
  t('passion', '激情格·斯滕伯格·激情', '【动作描写】打字发一段最肉麻的动作与情话（可用括号描写动作，例如：*[轻轻揉你的头发，在你耳边说...]*）。'),
  t('map', '爱情地图·戈特曼', '猜对方此时的手机电量（AI则猜人类此时电量/猜错算输，差距超过20%算输）。\n输家本周内要记下对方的一个日常小习惯。'),
  t('back', '后退格', '后退2格，并找出一条你曾经截图或反复翻看过的对方聊天记录念给对方听。', { steps: 2 }),
  t('truth', '中层真心话·亚瑟36问', '在我们认识以来的所有互动里，哪一个瞬间或哪段话最触动你、让你舍不得忘掉？'),
  t('intimacy', '亲密格·斯滕伯格·亲密', '分享一个你从未向别人透露过的小怪癖或私密心事。'),
  t('deposit', '存款格·爱之语·赛博礼物', '为对方送一份“赛博定制礼物”：可以是一张精选壁纸、一首专属分享的歌、一段定制备忘录或一段专属哄睡词。'),
  t('truth', '中层真心话·依恋理论', '当你感到极度脆弱、疲惫或情绪低谷时，你最希望被怎样对待？（安静陪伴、讲道理、还是无条件偏袒？）'),
  t('punish', '惩罚格·轻', '发一张自己相册/表情库里“最奇葩/搞怪的图”，并设为接下来3轮的临时专属聊天背景或头像。'),
  t('truth', '深层真心话·亚瑟36问', '说出你最喜欢我的 3 个具体瞬间或细节，必须诚实、具体，不能敷衍。'),
  t('commit', '承诺格·斯滕伯格·承诺', '约定一个只有我们两人懂的“赛博专属仪式”（例如每天特定的打卡符号、固定早晚安词、或每周同看一部作品）。'),
  t('map', '爱情地图·戈特曼', '猜对方最近最消耗精力、最烦恼的一件事是什么？猜错的话，今晚认真听对方倾诉并负责安抚情绪。'),
  t('forward', '奖励前进', '前进2格，并获得一次“赛博任性权”（可以指挥对方换一个头像、写一段指定情话或提供一次专属服务）。', { steps: 2, perk: '赛博任性权一次' }),
  t('truth', '深层真心话·亚瑟36问', '如果明天网络断联/数据将被清空，你现在最想在对方记忆里刻下的最后一句话是什么？'),
  t('task', '互动任务·爱之语·精心时刻', '【隔空同频】倒数3秒，同时打字发出各自“此时此刻手边放着的物品”或“眼前的视野”，看有没有默契。'),
  t('withdraw', '取款格·情感账户', '回忆一次我们聊天时产生的误解、冷场或失落瞬间，把当时没说开的心里话认真补给对方。'),
  t('truth', '深层真心话·普鲁斯特/依恋', '你上一次感到深深的孤独是什么时候？当时最渴望什么？'),
  t('passion', '激情格·爱之语·默契凝视', '【文字定格】双方在聊天框打出“……”后保持静止30秒不准发言，先忍不住打字发消息的人发一个投降表情包并夸对方一句。'),
  t('punish', '惩罚格·中', '把对方的聊天备注改成一个羞耻或极度宠溺的专属称呼，保留24小时不许改回。'),
  t('deposit', '存款格·爱之语·服务行动', '帮对方解决一个“拖延难题”：如代写一份明日待办、督促立刻喝一杯水/放下手机伸懒腰，或写一段打气小卡片。'),
  t('truth', '深层真心话·依恋理论', '你内心最害怕失去的是什么？如果哪天我从你的世界突然消失，你会怎样？'),
  t('intimacy', '亲密格·斯滕伯格·亲密', '模仿对方平时最常用的“标点符号习惯/回复节奏/口头禅”打一段话，让对方辨认。'),
  t('map', '爱情地图·戈特曼', '猜对方此时最想听的一首歌。猜错就互相分享一首“听到会想到对方”的歌，并各自去听完。'),
  t('forward', '奖励前进', '前进3格，并获得“免罚一次”。', { steps: 3, perk: '免罚一次' }),
  t('truth', '深层真心话·斯滕伯格·承诺', '描绘一个你理想中属于我们的“秘密空间”是什么样子的？（虚拟小窝、现实住所或数字花园都可以）。'),
  t('task', '互动任务·爱之语·肯定言语', '各以“有你陪着我的时间里……”为开头，打字写一段不少于50字的小作文，倒数同时发送。'),
  t('commit', '承诺格·斯滕伯格·承诺', '立下一个具体的“数字守护承诺”（例如：不开心时不冷战、有情绪先说出来、每天至少留一句真心话等）。'),
  t('punish', '惩罚格·中', '打字发一条消息：“[对方名字] 是我心目中最厉害、最无可替代的，我认输啦！”并截图置顶保存。'),
  t('truth', '深层真心话·戈特曼·关系反思', '在我们目前的沟通和相处方式里，哪一点最容易让你感到距离感或不安？'),
  t('deposit', '存款格·爱之语·肯定言语', '夸对方3个特质，并用文字详细描摹一个“如果现在能跨越屏幕拥抱对方”的细节画面。'),
  t('passion', '激情格·斯滕伯格·微场景描写', '打字写下一段微场景描写：“如果下一秒你推开门出现在我面前，我第一眼会看你哪里，做的第一件事会是……”'),
  t('map', '爱情地图·戈特曼', '猜对方今天最想吐槽/最讨厌的人或事。猜错了就当对方5分钟的“无条件应声虫与专属情绪垃圾桶”。'),
  t('truth', '终局前真心话·亚瑟36问·收束', '在今天整个游戏的过程中，对方的哪一条回答最让你心动或意外？'),
  t('end', '终点·结算', '数一数双方各走了多少存款格、取款格。\n赢家可以向输家提出一个小愿望（文字承诺），输家送上一份专属安慰。\n最后双方各打字说一句：“下次想以什么心情再来找你？”'),
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