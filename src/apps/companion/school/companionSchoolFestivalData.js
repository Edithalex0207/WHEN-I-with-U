/*
 * companionSchoolFestivalData.js —— 「校园节日事件」的数据与数值。
 *
 * 纯数据，不 import 任何文件（跟 companionSchoolRecessData.js 一个性质）：
 * 想调概率、冷却、奖励、职业清单、换文案，只改这一个文件，不用碰 service
 * 和组件。
 *
 * 【什么是校园节日事件】
 * 做完一组题之后，companionSchoolFestivalService.js 的 rollSchoolFestival
 * 会独立 roll 一次（跟课间小事、收藏卡、老师的嘱托是四次互不影响的 roll）。
 * 命中了，结算页出一条横幅，点开才弹窗；不点就当没发生，不保存。
 * 跟"课间可互动事件"的区别：节日事件有自己的概率、自己的冷却、可选的
 * 日期窗口，奖励是心情加心心，落库也是自己的函数，不挤进课间那套。
 *
 * 【以后加一个新节日（比如春游日、运动会）要做的事】
 *   1. 这个文件：FESTIVAL_ID 加一个 id，FESTIVALS 加一条登记，
 *      FESTIVAL_LIVE_IDS 加上它；节日自己的文案、数值放在下面单开一节。
 *   2. 新建玩法组件，在 companionSchoolFestivalBodies.js 登记（第二批）。
 *   3. 需要 AI 写文字的话，另建一个 AI 服务文件。
 *   外壳、roll、冷却、落库都不用动。
 *
 * 文案占位符：{name} 小伙伴的名字。
 */

/* ---------------- 登记表 ---------------- */

/** 节日的 id。 */
export const FESTIVAL_ID = {
  OPEN_DAY: 'openDay', // 家长开放日
};

/**
 * 现在已经做好、可以被抽到的节日。数组为空时，rollSchoolFestival 永远返回
 * null，表现跟没接入之前完全一样。每做完一个节日，往这里加一个 id，并在
 * companionSchoolFestivalBodies.js 里登记对应的玩法组件，两边要一起改。
 */
export const FESTIVAL_LIVE_IDS = [FESTIVAL_ID.OPEN_DAY];

/**
 * 本地测试开关：改成 true，做完一组题就一定会出节日横幅，并且无视冷却、
 * 日期窗口和"有没有配置接口"（这样没配接口也能看到失败那一页）。
 * 上线前务必改回 false。
 */
export const FESTIVAL_DEBUG_ALWAYS = false;

/**
 * 本地测试开关：填一个节日 id，测试时只抽它（要配合 FESTIVAL_DEBUG_ALWAYS）。
 * 上线前务必改回 null。
 */
export const FESTIVAL_DEBUG_FORCE_ID = null;

/**
 * 每个节日一条登记：
 *   id             节日 id
 *   title          小窗标题（丝带上的字）
 *   chance         做完一组题后命中的概率（0 到 1）
 *   cooldownDays   命中（横幅出现）之后，几天内不再出这个节日
 *   window         日期窗口，null = 全年都可能；
 *                  或 { from: 'MM-DD', to: 'MM-DD' }（含两端，from 晚于 to 表示跨年）
 *   needsApi       true = 没有配置 AI 接口就不出这个节日（节日里要现写文字时用）
 *   classmateCount 同时出场的同学人数
 */
export const FESTIVALS = {
  [FESTIVAL_ID.OPEN_DAY]: {
    id: FESTIVAL_ID.OPEN_DAY,
    title: '家长开放日',
    chance: 0.08,
    cooldownDays: 7,
    window: null,
    needsApi: true,
    classmateCount: 3,
  },
};

/** 冷却记录存在 db.settings 里：key = 前缀 + 小伙伴 id + ':' + 节日 id。 */
export const FESTIVAL_COOLDOWN_KEY_PREFIX = 'companionSchoolFestivalLast:';

/**
 * 单次奖励的上限，防止以后改数值时手滑改出一个很夸张的数。
 * 以后某个节日真的要给更多，在这里放宽一次就行。
 */
export const FESTIVAL_HEARTS_CAP = 3;
export const FESTIVAL_MOOD_CAP = 6;

/* =========================================================
 * 家长开放日
 *
 * 你（玩家）是以家长身份来学校分享自己的职业，小伙伴是孩子。
 * 选一个职业，三位同学各有一小段反应（AI 写），小伙伴觉得自豪，
 * 加心情和心心。
 * ========================================================= */

/**
 * 预设职业清单，按学段分。幼儿园 12 个，小学 16 个。
 * 界面按这个顺序排，配色在组件里轮着取。
 */
export const OPEN_DAY_PROFESSIONS = {
  kindergarten: [
    '医生', '警察', '消防员', '老师', '厨师', '司机',
    '快递员', '农民', '画家', '护士', '理发师', '面包师',
  ],
  primary: [
    '医生', '警察', '消防员', '老师', '厨师', '司机', '快递员', '程序员',
    '画家', '农民', '记者', '飞行员', '护士', '科学家', '宇航员', '工程师',
  ],
};

/** 自己写职业最多几个字。 */
export const OPEN_DAY_CUSTOM_MAX_LEN = 8;

/**
 * 奖励：预设职业和自填职业各一档（鼓励自己写）。
 * 心心不扣、心情只加不减；数值会再被 FESTIVAL_*_CAP 夹一次。
 */
export const OPEN_DAY_REWARD = {
  preset: { hearts: 2, mood: 3 },
  custom: { hearts: 3, mood: 4 },
};

/** 按是不是自填职业取奖励。 */
export const getOpenDayReward = (isCustom) => (
  isCustom ? OPEN_DAY_REWARD.custom : OPEN_DAY_REWARD.preset
);

/** 结算页入口横幅上的一句话（随机挑一句）。 */
export const OPEN_DAY_ENTRY_LINES = [
  '教室里坐满了同学，都在等你来介绍',
  '同学们都伸长了脖子，想听听你是做什么的',
  '黑板上写着欢迎家长，同学们在等你',
];

/** 小窗里的开场旁白（随机挑一句）。 */
export const OPEN_DAY_SCENES = [
  '今天是家长开放日，你来到了{name}的教室。同学们都转过头来看着你：你是做什么工作的呢？',
  '家长开放日到啦，{name}紧张地坐直了身子。同学们好奇地看着你，等你介绍自己的工作。',
  '教室后面站满了来参加开放日的家长，轮到你上台了。{name}悄悄朝你眨了眨眼。',
];

/** 点"开始介绍"之后、等同学反应时的旁白（随机挑一句）。 */
export const OPEN_DAY_WAIT_SCENES = [
  '你说完了，教室里安静了一小会儿。同学们交头接耳，好像都有话想说……',
  '你介绍完了。同学们互相看了看，有人已经悄悄举起了小手。',
];

/** 同学反应出来之后的旁白（随机挑一句）。 */
export const OPEN_DAY_REACT_SCENES = [
  '你介绍完了自己的职业。同学们一个接一个举起了小手。',
  '你的介绍结束了，教室里热闹起来，同学们抢着说话。',
];

/** 小伙伴的自豪（固定文案，不走 AI，随机挑一句）。 */
export const OPEN_DAY_PROUD_LINES = [
  '{name}挺起小胸脯，悄悄在心里说：那是我的家长。',
  '{name}的耳朵红红的，嘴角怎么也压不下去。',
  '{name}小声对旁边的同学说：那是我的家长哦。',
  '{name}坐得笔直，眼睛亮晶晶地看着你。',
];

/** 写进生活记录的默认一句话。{job} 是职业。 */
export const OPEN_DAY_DEFAULT_TEXT = '家长开放日，你向全班介绍了自己的职业：{job}。同学们都听得很认真，{name}觉得特别自豪。';