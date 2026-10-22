/*
 * companionSchoolRecessData.js —— 「可互动课间事件」的数据与数值。
 *
 * 纯数据，不 import 任何文件（跟 companionSchoolActivities.js 一个性质）：
 * 想调概率、加同学、改心情加成、换文案，只改这一个文件，不用碰 service
 * 和组件。
 *
 * 【整体思路】
 * 做完一组题后，companionSchoolRecessService.js 的 rollCampusBreak 先按
 * ACTIVITY_CHANCE（companionSchoolData.js，现在是 0.35）决定"有没有小事"，
 * 命中后再按 RECESS_INTERACTIVE_SHARE 分流：
 *   - 一部分变成"可互动课间事件"（石头剪刀布 / 猜词 / 文字选项），
 *   - 其余仍然是 companionSchoolActivities.js 里那些固定的小事。
 * 可互动事件只影响心情加成，赢和输的加成不同，但都是正数，不扣心情
 * （延续"小惊喜"原则）。中途关掉小窗算放弃：不写记录、不加心情。
 *
 * 【贴图位】
 * 同学小动物、石头剪刀布的手势，都是贴图，不是代码画的：
 *   - RECESS_CLASSMATES[i].stickers.* 填上图片地址（或 data URL）就显示图，
 *     留空就显示一个纯色底加名字第一个字的占位（跟 FoodArt 的占位一个思路）。
 *   - RECESS_HAND_STICKERS.* 同理。
 * 图建议用透明底的 PNG / WebP，正方形，边缘留一点空白；组件会自动给贴图
 * 描一圈白边。
 *
 * 文案占位符：{name} 小伙伴的名字，{mate} 同学的名字。
 */

/** 命中"小事"之后，有多大比例变成可互动事件（其余仍是固定小事）。 */
export const RECESS_INTERACTIVE_SHARE = 0.4;

/** 可互动课间事件的种类。 */
export const RECESS_KIND = {
  RPS: 'rps', // 石头剪刀布：替小伙伴出拳，对手是同学
  GUESS: 'guess', // 猜词：三条由模糊到清楚的线索
  CHOICE: 'choice', // 文字选项
};

/**
 * 现在已经做好、可以被抽到的种类。数组为空时，rollCampusBreak 的表现跟
 * 接入之前完全一样（只会抽到固定小事）。每做完一个玩法，往这里加一个种类，
 * 并在 companionSchoolRecessBodies.js 里登记对应的玩法组件。
 *   切片 B：石头剪刀布（已加入）
 *   切片 C：猜词（已加入）
 *   切片 D：文字选项
 */
export const RECESS_LIVE_KINDS = [RECESS_KIND.RPS, RECESS_KIND.GUESS];

/**
 * 本地测试开关：改成 true，做完一组题就一定会弹"课间有小事"（每次都是
 * RECESS_LIVE_KINDS 里随机一种），方便看界面。上线前务必改回 false。
 */
export const RECESS_DEBUG_ALWAYS = false;

/** 每种事件的小窗标题。 */
export const RECESS_KIND_META = {
  [RECESS_KIND.RPS]: { title: '剪刀石头布' },
  [RECESS_KIND.GUESS]: { title: '猜一猜' },
  [RECESS_KIND.CHOICE]: { title: '小事一件' },
};

/**
 * 心情加成。都是正数，输了 / 没猜中 / 随便选哪个也至少有 1。
 *   rps    赢 / 平 / 输
 *   guess  按第几条线索猜中（1 最早最多），没猜中是 miss
 *   choice [最小, 最大]，闭区间里随机取一个整数
 */
export const RECESS_MOOD = {
  [RECESS_KIND.RPS]: { win: 3, draw: 2, lose: 1 },
  [RECESS_KIND.GUESS]: { 1: 4, 2: 3, 3: 2, miss: 1 },
  [RECESS_KIND.CHOICE]: [1, 2],
};

/** 单次加成的上限，防止以后改数值时手滑改出一个很夸张的数。 */
export const RECESS_MOOD_CAP = 6;

/** 结算页入口横幅上的一句话（每种事件几句，随机挑一句）。 */
export const RECESS_ENTRY_LINES = {
  [RECESS_KIND.RPS]: [
    '{mate}转过身，朝{name}伸出了小拳头',
    '{mate}拉了拉{name}的袖子，说要来一局',
  ],
  [RECESS_KIND.GUESS]: [
    '{mate}在草稿纸上画了一半就捂住了',
    '{mate}神秘兮兮地说有个谜语要{name}猜',
  ],
  [RECESS_KIND.CHOICE]: [
    '{mate}红着脸看了{name}一眼',
    '{mate}把什么东西悄悄放在了{name}的桌角',
  ],
};

/** 小窗里的开场旁白（每种事件几句，随机挑一句）。 */
export const RECESS_SCENES = {
  [RECESS_KIND.RPS]: [
    '同桌{mate}转过身，伸出小拳头：来一局，输的人下节课帮赢的人擦黑板！{name}看向你，等你替TA出拳。',
    '课间十分钟，{mate}凑过来说想跟{name}猜拳。{name}有点紧张，小声说：你帮我选吧。',
  ],
  [RECESS_KIND.GUESS]: [
    '{mate}在草稿纸上画了一半就捂住了：猜猜我想画什么？只给你三条线索。',
    '{mate}神秘兮兮地说，自己想好了一个东西，要{name}来猜，线索一条一条放出来。',
  ],
  [RECESS_KIND.CHOICE]: [
    '课间，{mate}的橡皮滚到了{name}脚边，上面画着一张歪歪扭扭的笑脸。{mate}红着脸看过来。',
    '{mate}把一颗糖放在了{name}的桌角，什么也没说，只是眼睛一直往这边瞟。',
  ],
};

/**
 * 同学名册。一个名字 + 一种小动物 + 一套表情贴图位。
 *   tone      占位底色，对应 school.css 的 sd-tone-*（butter/sky/mint/heart/lavender）
 *   species   小动物的种类，AI 写文案时可以当素材
 *   trait     一句话性格，后面的 AI 文案和同学互动（批改作业、家长开放日）
 *             会复用这份名册
 *   stickers  表情贴图：normal 平时 / happy 开心 / sad 难过 / wink 调皮，
 *             哪个留空就退回 normal，normal 也空就显示占位
 */
export const RECESS_CLASSMATES = [
  {
    id: 'mate-01', name: '小满', species: '兔子', tone: 'heart',
    trait: '好胜心强，输了会鼓起腮帮子，但三秒就忘',
    stickers: { normal: '', happy: '', sad: '', wink: '' },
  },
  {
    id: 'mate-02', name: '团团', species: '小熊', tone: 'butter',
    trait: '慢半拍，爱吃，总在课间偷偷掏零食',
    stickers: { normal: '', happy: '', sad: '', wink: '' },
  },
  {
    id: 'mate-03', name: '糯米', species: '小猫', tone: 'lavender',
    trait: '害羞安静，开心的时候尾巴会翘起来',
    stickers: { normal: '', happy: '', sad: '', wink: '' },
  },
  {
    id: 'mate-04', name: '嘎嘎', species: '小鸭', tone: 'sky',
    trait: '话多，爱讲冷笑话，自己先笑场',
    stickers: { normal: '', happy: '', sad: '', wink: '' },
  },
  {
    id: 'mate-05', name: '豆包', species: '小狗', tone: 'mint',
    trait: '热心肠，跑得快，下课铃一响就冲出去',
    stickers: { normal: '', happy: '', sad: '', wink: '' },
  },
  {
    id: 'mate-06', name: '阿福', species: '小狐狸', tone: 'heart',
    trait: '鬼点子多，爱出谜语，嘴上不肯认输',
    stickers: { normal: '', happy: '', sad: '', wink: '' },
  },
];

/** 石头剪刀布的手势贴图。留空显示占位。 */
export const RECESS_HAND_STICKERS = {
  rock: '',
  scissors: '',
  paper: '',
};

/** 手势的名字（界面文字和占位用）。 */
export const RECESS_HAND_LABELS = {
  rock: '石头',
  scissors: '剪刀',
  paper: '布',
};