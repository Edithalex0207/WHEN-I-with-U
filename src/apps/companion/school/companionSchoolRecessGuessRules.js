/*
 * companionSchoolRecessGuessRules.js —— 「猜词」的规则、判定和兜底词库。
 *
 * 纯逻辑 + 纯文案，不 import 任何文件（不碰数据库，不碰网络）。想改判定宽松
 * 程度、加几个兜底词、换结果文案，只改这一个文件。
 *
 * 【玩法】
 * 同学想好一个词，线索一条一条放出来，由模糊到清楚，一共 3 条：
 *   - 开局只放第 1 条；
 *   - 猜错一次，多放出下一条；
 *   - 每条线索只有一次机会，第 3 条也猜错就公布答案（没猜中）。
 * 心情加成见 companionSchoolRecessData.js 的 RECESS_MOOD.guess：
 * 第 1 / 2 / 3 条猜中是 4 / 3 / 2，没猜中是 1，都不扣。
 *
 * 【判定】
 * 玩家输入和 answer + aliases 都先做一遍"规范化"（全半角统一、去空格和标点、
 * 大小写统一），再整串相等比较，不做"包含"判断，免得输入一长串把答案全
 * 罗列进去也算对。孩子常会多打一个"是"（"是西瓜"），所以也会去掉常见的
 * 前缀再比一次。
 *
 * 【兜底词库】
 * 没配置 AI 接口、请求失败、返回的格式不对时，用这里的词，所以没配置 API 的
 * 人也能玩。每条：word（答案）、aliases（也算对的说法）、clues（3 条，
 * 由模糊到清楚，线索里不能直接出现答案）。分幼儿园 / 小学两个学段。
 * 全部不带 emoji。
 */

/** 一次猜词最多放几条线索。 */
export const GUESS_CLUE_COUNT = 3;

/** 玩家输入框的字数上限。 */
export const GUESS_INPUT_MAX = 12;

/* ---------------- 规范化与判定 ---------------- */

const EMOJI_RE = /[\p{Extended_Pictographic}\u200d\ufe0f]/gu;

/** 去掉 emoji（AI 偶尔会手滑带出来，全站不用 emoji）。 */
export const stripEmoji = (text) => String(text || '').replace(EMOJI_RE, '');

/**
 * 规范化：NFKC（全角转半角）、小写、去掉所有空白和标点符号。
 * "西 瓜！" -> "西瓜"，"Apple" -> "apple"
 */
export const normalizeGuess = (text) => String(text || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s\p{P}\p{S}]+/gu, '')
  .trim();

/* 孩子常见的开头："是西瓜"、"我猜是西瓜"、"应该是西瓜"。长的放前面。 */
const LEAD_PREFIXES = ['我猜是', '我觉得是', '应该是', '可能是', '它是', '这是', '我猜', '是'];

const stripLead = (norm) => {
  for (const prefix of LEAD_PREFIXES) {
    if (norm.length > prefix.length && norm.startsWith(prefix)) return norm.slice(prefix.length);
  }
  return norm;
};

/**
 * 玩家的输入算不算猜对。
 * @param {string} input
 * @param {{ answer: string, aliases?: string[] }} puzzle
 */
export const isGuessCorrect = (input, puzzle) => {
  const norm = normalizeGuess(input);
  if (!norm || !puzzle?.answer) return false;
  const accepted = new Set(
    [puzzle.answer, ...(Array.isArray(puzzle.aliases) ? puzzle.aliases : [])]
      .map(normalizeGuess)
      .filter(Boolean),
  );
  return accepted.has(norm) || accepted.has(stripLead(norm));
};

/* ---------------- 题目整理（AI 返回的内容也走这里） ---------------- */

const ANSWER_MAX = 8;
const ALIAS_MAX = 8;
const ALIAS_COUNT_MAX = 6;
const CLUE_MAX = 44;

/**
 * 把一份"答案 + 同义说法 + 线索"整理成可玩的题目；不合格返回 null。
 * 不合格的情况：答案为空或太长；线索不是正好 3 条非空文字；任何一条线索把
 * 答案或同义说法直接写了出来（那就不用猜了）。
 *
 * @param {{ answer?: string, word?: string, aliases?: string[], clues?: string[] }} raw
 * @returns {{ answer: string, aliases: string[], clues: string[] }|null}
 */
export const sanitizePuzzle = (raw) => {
  if (!raw || typeof raw !== 'object') return null;

  const answer = stripEmoji(raw.answer ?? raw.word).trim();
  if (!answer || answer.length > ANSWER_MAX) return null;

  const aliasSet = new Set();
  const aliasList = Array.isArray(raw.aliases) ? raw.aliases : [];
  aliasList.forEach((item) => {
    const text = stripEmoji(item).trim();
    if (!text || text.length > ALIAS_MAX) return;
    if (normalizeGuess(text) === normalizeGuess(answer)) return;
    aliasSet.add(text);
  });
  const aliases = Array.from(aliasSet).slice(0, ALIAS_COUNT_MAX);

  const clueList = Array.isArray(raw.clues) ? raw.clues : [];
  if (clueList.length < GUESS_CLUE_COUNT) return null;
  const clues = clueList
    .slice(0, GUESS_CLUE_COUNT)
    .map((item) => stripEmoji(item).trim().slice(0, CLUE_MAX));
  if (clues.some((clue) => !clue)) return null;

  const secrets = [answer, ...aliases].map(normalizeGuess).filter((s) => s.length >= 1);
  const leaked = clues.some((clue) => {
    const normClue = normalizeGuess(clue);
    return secrets.some((secret) => normClue.includes(secret));
  });
  if (leaked) return null;

  return { answer, aliases, clues };
};

/* ---------------- 兜底词库 ---------------- */

const K = 'kindergarten';
const P = 'primary';

const FALLBACK_PUZZLES = [
  /* 幼儿园 */
  { stage: K, word: '苹果', aliases: ['红苹果', '大苹果'], clues: ['它是一种水果，吃起来脆脆甜甜的。', '它圆圆的，常常是红色的，也有青色的。', '白雪公主吃了它就睡着了，老师说每天一个对身体好。'] },
  { stage: K, word: '香蕉', aliases: ['大香蕉'], clues: ['它是一种水果，小猴子最爱吃。', '它弯弯的，像一个黄色的月牙。', '要先剥掉黄黄的外衣，里面软软的甜甜的。'] },
  { stage: K, word: '西瓜', aliases: ['大西瓜'], clues: ['夏天的时候，大家都爱吃它。', '它外面是绿色的，圆滚滚的，很大一个。', '切开以后里面是红红的，还有黑黑的籽，水多多。'] },
  { stage: K, word: '小猫', aliases: ['猫', '猫咪', '小猫咪'], clues: ['它是一种小动物，身上软软的毛。', '它有长长的胡子，走路一点声音也没有。', '它会喵喵叫，最喜欢吃小鱼，还会抓老鼠。'] },
  { stage: K, word: '小狗', aliases: ['狗', '狗狗', '小狗狗'], clues: ['它是一种常见的小动物，很多小朋友家里有。', '它有四条腿，还有一条会摇的尾巴。', '它会汪汪叫，爱啃骨头，是人类的好朋友。'] },
  { stage: K, word: '兔子', aliases: ['小兔子', '小白兔', '兔'], clues: ['它是一种小动物，身上毛茸茸的。', '它有两只长长的耳朵，跳起来一蹦一蹦的。', '它爱吃胡萝卜和青菜，眼睛常常是红红的。'] },
  { stage: K, word: '大象', aliases: ['象'], clues: ['它是动物园里很大很大的动物。', '它的耳朵像大大的扇子，腿像粗粗的柱子。', '它有一个长长的鼻子，可以喷水、可以卷东西。'] },
  { stage: K, word: '太阳', aliases: ['太阳公公', '红太阳'], clues: ['它每天都会出现，天亮了就能看见它。', '它挂在天上，圆圆的，暖暖的。', '它一出来天就亮了，在外面晒一晒，身上热乎乎的。'] },
  { stage: K, word: '月亮', aliases: ['月亮婆婆', '月牙'], clues: ['它在天上，一般晚上才看得见。', '它有时候圆圆的，有时候弯弯的，像一条小船。', '晚上睡觉的时候，它和星星一起在天上陪着你。'] },
  { stage: K, word: '雨伞', aliases: ['伞', '小雨伞'], clues: ['下雨天出门的时候，大家都会带着它。', '它能撑开，也能收起来，有各种漂亮的颜色。', '它像一朵会移动的大蘑菇，能挡住头顶的雨水。'] },
  { stage: K, word: '蛋糕', aliases: ['生日蛋糕', '小蛋糕'], clues: ['它是一种甜甜的、软软的好吃的东西。', '它上面常常有奶油，还有水果。', '过生日的时候，大家会围着它唱歌，还要吹蜡烛。'] },
  { stage: K, word: '牙刷', aliases: ['小牙刷'], clues: ['每天早上和晚上，我们都要用到它。', '它有一根长长的把手，一头有很多软软的毛。', '它和牙膏是好朋友，用它刷一刷，牙齿就干干净净。'] },
  { stage: K, word: '小鸭', aliases: ['鸭子', '小鸭子', '鸭'], clues: ['它是一种会下水的小动物，身上黄黄的。', '它的嘴扁扁的，走路一摇一摆。', '它会嘎嘎叫，喜欢在池塘里游来游去。'] },
  { stage: K, word: '汽车', aliases: ['小汽车', '车', '小车'], clues: ['它能带我们去很远的地方。', '它有四个轮子，还有两盏亮亮的灯。', '它会嘀嘀叫，爸爸妈妈开着它，我们坐在里面。'] },

  /* 小学 */
  { stage: P, word: '铅笔', aliases: ['笔', '铅笔头'], clues: ['它是上课时常常用到的东西。', '它细细长长的，是用木头做的，里面有一根黑色的芯。', '写错了可以擦掉，用钝了就要拿小刀削一削。'] },
  { stage: P, word: '橡皮', aliases: ['橡皮擦', '擦子'], clues: ['它是文具盒里的一个小东西，很小很软。', '它的本事是让错误消失，但自己会越用越小。', '铅笔写错字的时候，就要请它来帮忙擦掉。'] },
  { stage: P, word: '书包', aliases: ['背包', '小书包', '双肩包'], clues: ['每天上学放学，你都会带着它。', '它有两条带子，背在肩膀上，里面能装很多东西。', '课本、作业本和文具盒，都住在它的肚子里。'] },
  { stage: P, word: '尺子', aliases: ['直尺', '格尺'], clues: ['它是文具盒里的一个长条形的小帮手。', '它的边上有一格一格的刻度，数字从小排到大。', '画直线、量长短，都要靠它。'] },
  { stage: P, word: '彩虹', aliases: ['虹'], clues: ['它不是东西，也不是动物，要等到合适的天气才能看见。', '它挂在天上，像一座弯弯的大桥，有很多种颜色。', '雨停了、太阳出来的时候，抬头就可能看到红橙黄绿青蓝紫。'] },
  { stage: P, word: '雪人', aliases: ['小雪人'], clues: ['它只在冬天出现，天气一暖就会不见。', '它是小朋友们一起做出来的，身体是白白的。', '它的鼻子常常是一根胡萝卜，头上还会戴一顶帽子。'] },
  { stage: P, word: '蝴蝶', aliases: ['花蝴蝶'], clues: ['它是一种会飞的小动物，春天特别多。', '它有一对漂亮的翅膀，上面有各种花纹。', '它最喜欢在花丛里飞来飞去，小时候是一条毛毛虫。'] },
  { stage: P, word: '长颈鹿', aliases: ['鹿'], clues: ['它是动物园里很高很高的动物。', '它身上有一块一块的花纹，是黄色和棕色的。', '它的脖子特别长，可以吃到树顶上的叶子。'] },
  { stage: P, word: '冰淇淋', aliases: ['冰激凌', '冰激淋', '雪糕', '冰棍'], clues: ['它是夏天里最受欢迎的零食之一。', '它冰冰凉凉，甜甜的，有各种口味。', '它不吃快一点就会化掉，滴得满手都是。'] },
  { stage: P, word: '自行车', aliases: ['单车', '脚踏车', '车'], clues: ['它是一种交通工具，不用加油也能跑。', '它有两个轮子，有一个会响的小铃铛，还有一个小座位。', '要靠两只脚用力踩踏板，叮铃铃一响，路上的人就会让开。'] },
  { stage: P, word: '钟表', aliases: ['时钟', '闹钟', '钟', '手表'], clues: ['它是家里、教室里常常能看到的东西。', '它的脸上有一圈数字，还有长长短短的针。', '它滴答滴答地走，告诉我们现在几点了。'] },
  { stage: P, word: '向日葵', aliases: ['太阳花', '葵花'], clues: ['它是一种植物，夏天开得最好。', '它的花是金黄色的，像一个大圆盘，结的籽可以吃。', '它的花盘总是朝着天上那个红红的大火球转。'] },
  { stage: P, word: '熊猫', aliases: ['大熊猫', '国宝'], clues: ['它是一种很受欢迎的动物，很多人专门去看它。', '它身上只有黑白两种颜色，眼睛周围是黑黑的圈。', '它最爱抱着竹子啃，圆滚滚的，走起路来慢悠悠。'] },
  { stage: P, word: '地球', aliases: ['地球仪'], clues: ['我们每一个人都住在它的上面。', '它是圆圆的，从太空里看，是蓝色和白色的。', '它绕着太阳转，一圈就是一年，上面有大海和陆地。'] },
  { stage: P, word: '雨靴', aliases: ['雨鞋', '水靴'], clues: ['它是下雨天才会穿的东西。', '它穿在脚上，常常是亮亮的颜色，不怕水。', '穿着它可以放心地踩水坑，脚也不会湿。'] },
  { stage: P, word: '黑板', aliases: ['小黑板'], clues: ['每间教室里都有它，而且很大。', '老师在它上面写字，写完又可以擦掉。', '它不一定是黑色的，用粉笔写字，值日生负责擦干净。'] },
];

/** 兜底词库的词总数（给调试看）。 */
export const FALLBACK_PUZZLE_COUNT = FALLBACK_PUZZLES.length;

const toPuzzle = (item) => ({
  answer: item.word,
  aliases: item.aliases.slice(),
  clues: item.clues.slice(),
});

/**
 * 从兜底词库里挑一道题。
 * @param {{ stage?: string, recentWords?: string[], rng?: function }} options
 *        stage        'kindergarten' | 'primary'；小学的词用完（都在最近出过的词里）
 *                     时才会借幼儿园的词，幼儿园只用幼儿园的词。
 *        recentWords  最近出过的词，尽量避开；实在避不开也会出一道，不会卡住
 */
export const pickFallbackPuzzle = ({ stage = P, recentWords = [], rng = Math.random } = {}) => {
  const recent = new Set(recentWords.map(normalizeGuess));
  const fresh = (list) => list.filter((item) => !recent.has(normalizeGuess(item.word)));
  const pick = (list) => list[Math.floor(rng() * list.length)];

  const own = FALLBACK_PUZZLES.filter((item) => (stage === K ? item.stage === K : item.stage === P));
  const all = FALLBACK_PUZZLES;

  const pool = fresh(own).length ? fresh(own) : (fresh(all).length ? fresh(all) : own);
  return toPuzzle(pick(pool));
};

/* ---------------- 结果文案 ---------------- */

/** 结果的类别：'1' | '2' | '3'（第几条线索猜中）或 'miss'。 */
export const GUESS_OUTCOME_LABELS = {
  1: '一下就猜中',
  2: '猜中啦',
  3: '总算猜中',
  miss: '没猜中',
};

/** 揭晓后同学的表情贴图：被一下猜中不甘心，最后才猜中眨眼，没猜中得意。 */
export const GUESS_MATE_MOOD = { 1: 'sad', 2: 'sad', 3: 'wink', miss: 'happy' };

/*
 * 写进在校生活记录的那句话，也是结果贴纸上显示的文字（都用第三人称）。
 * 占位符：{name} 小伙伴、{mate} 同学、{answer} 答案。
 */
const RESULT_LINES = {
  1: [
    '{mate}才放出第一条线索，{name}就喊出了「{answer}」。{mate}瞪大眼睛，说你是不是偷看了我的草稿纸。',
    '答案是「{answer}」。{name}第一条线索就猜中了，{mate}捂着脑袋倒在桌子上，笑着说下次要出更难的。',
  ],
  2: [
    '放出第二条线索的时候，{name}想了想，说出了「{answer}」，猜对了。{mate}拍着手说，差一点就骗到你了。',
    '{name}第一次猜错了，第二条线索一出来，立刻改口说「{answer}」。{mate}笑着点头：对啦，你好聪明。',
  ],
  3: [
    '线索一条一条放完了，{name}才猜出是「{answer}」。{mate}长长地松了口气：好险，我还以为要把答案憋不住了。',
    '{name}猜了两次都不对，最后一条线索放出来，才说出「{answer}」。{mate}悄悄地笑，说你真的很努力。',
  ],
  miss: [
    '三条线索都放完了，{name}还是没猜出来。{mate}偷偷揭晓：是「{answer}」！{name}拍了一下脑门，说下次一定猜中。',
    '答案是「{answer}」。{name}没猜中，有点不好意思，{mate}说没关系，明天再给你出一个。',
  ],
};

const fillTemplate = (text, vars) => Object.keys(vars).reduce(
  (acc, key) => acc.split(`{${key}}`).join(vars[key]),
  text,
);

/**
 * 按结果挑一句文案并填好占位符。
 * @param {{ outcome: 1|2|3|'miss', name: string, mate: string, answer: string, rng?: function }} params
 */
export const buildGuessResultText = ({ outcome, name, mate, answer, rng = Math.random }) => {
  const pool = RESULT_LINES[outcome] || RESULT_LINES.miss;
  const line = pool[Math.floor(rng() * pool.length)];
  return fillTemplate(line, {
    name: name || '小伙伴',
    mate: mate || '同学',
    answer: answer || '',
  });
};