/*
 * companionSchoolEventData.js —— 「春游 / 秋游」特别活动的静态数据。
 *
 * 纯数据，不 import 任何文件，跟 companionSchoolActivities.js /
 * companionSchoolCardCatalog.js 一个性质。
 *
 * 【这一轮（切片③的①+②）做到什么程度】
 * 这里已经把完整的活动内容（通知文案、零食池、三轮事件文案）都写好了，
 * 但"合影 + 结语 + 落库 + 发奖励"是下一个子切片的事——所以这个文件里
 * 暂时没有奖励数值、没有结语文案，那些等下个子切片一起加，不是漏了。
 *
 * 【想加图的时候】
 * - SNACK_POOL 每样零食的 url 留空 = 占位卡面（SchoolArt.jsx 的 FoodArt，
 *   纯色底 + 名字第一个字），填了图就显示真实照片。
 * - EVENT_ROUNDS 每一轮的 sceneUrl 留空 = 占位纯色场景块（跟着
 *   SEASON_EVENTS 对应的 tone 走），填了图就显示真实场景图。
 * 都不用改任何其它文件。
 */

/* ---------------- 活动本身：什么时候开放 ---------------- */
/*
 * season：开放月份（1~12，闭区间）。一年只能做一次——判断方式是查
 * companionSchoolLife 里今年有没有已经完成的这个 eventId（下个子切片
 * 真正开始写这条记录之后才会生效；这一轮因为还没有"完成"这一步，
 * 查到的永远是"没做过"，属于预期内的阶段性行为，不是 bug）。
 */
export const SEASON_EVENTS = {
  spring_outing: {
    id: 'spring_outing',
    name: '春游',
    season: [3, 4, 5],
    tone: 'spring', // 对应 schoolEvent.css 的 .ev-banner.is-spring / .ev-scene-card.is-spring
    noticeText: '本周五我们将组织全班小朋友前往公园开展"春游"活动，一起去看看春天的样子。'
      + '请确认{name}是否可以参加，并为TA准备一点零食和一壶水。',
  },
  autumn_outing: {
    id: 'autumn_outing',
    name: '秋游',
    season: [9, 10, 11],
    tone: 'autumn',
    noticeText: '本周五我们将组织全班小朋友前往公园开展"秋游"活动，一起去捡捡落叶、晒晒太阳。'
      + '请确认{name}是否可以参加，并为TA准备一点零食和一壶水。',
  },
};

export const findSeasonEvent = (eventId) => SEASON_EVENTS[eventId] || null;

/* ---------------- 准备零食：零食池 ---------------- */
/*
 * 春游 / 秋游共用同一个零食池（零食本身不分季节）——只有场景事件
 * （下面的 EVENT_ROUNDS）才按季节各写一套，这是跟你确认过的分工。
 * desc 只是一句风味描述，不会在界面上暗示具体数值影响，不剧透。
 */
export const SNACK_PICK_MIN = 1;
export const SNACK_PICK_MAX = 3;

export const SNACK_POOL = [
  { id: 'strawberry-candy', name: '草莓软糖', desc: '酸酸甜甜，怎么吃都不腻', url: '' },
  { id: 'cookie', name: '小饼干', desc: '一口一个，根本停不下来', url: '' },
  { id: 'chocolate', name: '巧克力豆', desc: '小小一颗，甜到心里', url: '' },
  { id: 'raisin', name: '葡萄干', desc: '甜甜的，还带点嚼劲', url: '' },
  { id: 'seaweed', name: '海苔片', desc: '咸咸脆脆，停不下来的那种', url: '' },
  { id: 'lollipop', name: '棒棒糖', desc: '甜得很慢，能舔很久', url: '' },
  { id: 'milk-box', name: '牛奶盒', desc: '插上吸管，咕嘟咕嘟', url: '' },
  { id: 'apple', name: '小苹果', desc: '脆脆的，咬一口汁水四溅', url: '' },
];

export const findSnack = (id) => SNACK_POOL.find((s) => s.id === id) || null;

/* ---------------- 活动当天：三轮事件选择 ---------------- */
/*
 * 每个 eventId 对应 3 轮、每轮 2 个选项。选项的 tag 只有两种：
 * 'gentle'（乖巧/守规矩这一路）和 'wild'（调皮/随性这一路）——
 * 三轮选完会倾向哪一边，决定下个子切片里最后弹出哪一种结语，
 * 现在这一轮只负责"选、记下来"，不负责"算出来之后怎么样"。
 * sceneUrl 留空 = 占位纯色块，填了图显示真实场景图。
 */
export const EVENT_ROUNDS = {
  spring_outing: [
    {
      scene: '刚到公园，草坪上开满了不知名的小黄花，{name}蹲下来看了好久。',
      sceneUrl: '',
      choices: [
        { label: '摘一朵带回去', tag: 'wild' },
        { label: '看看就好，不摘它', tag: 'gentle' },
      ],
    },
    {
      scene: '午饭时间，{name}的零食看起来特别香，旁边的同学忍不住多看了两眼。',
      sceneUrl: '',
      choices: [
        { label: '分一点给同学', tag: 'gentle' },
        { label: '自己悄悄吃完', tag: 'wild' },
      ],
    },
    {
      scene: '集合的哨声响了，可是草地那边有只蝴蝶飞得特别好看。',
      sceneUrl: '',
      choices: [
        { label: '准时跑回去集合', tag: 'gentle' },
        { label: '再多追一会儿蝴蝶', tag: 'wild' },
      ],
    },
  ],
  autumn_outing: [
    {
      scene: '刚下车，地上已经积了一层厚厚的落叶，踩上去沙沙作响。',
      sceneUrl: '',
      choices: [
        { label: '使劲踩一踩，听听声音', tag: 'wild' },
        { label: '小心绕过去，怕弄脏鞋子', tag: 'gentle' },
      ],
    },
    {
      scene: '午饭时间，{name}的零食看起来特别好吃，同桌已经盯着看了好一会儿了。',
      sceneUrl: '',
      choices: [
        { label: '分一半零食给同桌', tag: 'gentle' },
        { label: '悄悄自己吃完', tag: 'wild' },
      ],
    },
    {
      scene: '集合时间快到了，池塘里有几条鱼游得正欢。',
      sceneUrl: '',
      choices: [
        { label: '准时回去集合', tag: 'gentle' },
        { label: '多看一会儿鱼', tag: 'wild' },
      ],
    },
  ],
};

export const getEventRounds = (eventId) => EVENT_ROUNDS[eventId] || [];