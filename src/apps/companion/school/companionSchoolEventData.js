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
    groupPhotoUrl: 'https://img.pagehost.cn/autoupload/amqnh/20261018/eu7f/1024X1024/gi2-e1792229365.png/webp', // 春游全班合照
  },
  autumn_outing: {
    id: 'autumn_outing',
    name: '秋游',
    season: [9, 10, 11],
    tone: 'autumn',
    noticeText: '本周五我们将组织全班小朋友前往公园开展"秋游"活动，一起去捡捡落叶、晒晒太阳。'
      + '请确认{name}是否可以参加，并为TA准备一点零食和一壶水。',
    groupPhotoUrl: 'https://img.pagehost.cn/autoupload/amqnh/20261018/p1yU/1280X1280/dddf927a238a4bd2a73062c320654c59.png/webp', // 秋游全班合照
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
  {
    id: 'strawberry-candy',
    name: '草莓软糖',
    desc: '酸酸甜甜，怎么吃都不腻',
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261018/A3JL/1225X1115/_cgi-bin_mmwebwx-bin_webwxgetmsgimg__%26MsgID%3D6727291870786771879%26skey%3D%40crypt_5a237c93_47e8a50dc367fb733fd08a1713f91ebf%26mmweb_appid%3Dwx_webfilehelper.jpg/webp',
  },
  {
    id: 'cookie',
    name: '小饼干',
    desc: '一口一个，根本停不下来',
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261018/Utfb/1291X1426/_cgi-bin_mmwebwx-bin_webwxgetmsgimg__%26MsgID%3D7589155996901620503%26skey%3D%40crypt_5a237c93_47e8a50dc367fb733fd08a1713f91ebf%26mmweb_appid%3Dwx_webfilehelper.jpg/webp',
  },
  {
    id: 'chocolate',
    name: '巧克力豆',
    desc: '小小一颗，甜到心里',
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261018/3G1G/1349X1743/_cgi-bin_mmwebwx-bin_webwxgetmsgimg__%26MsgID%3D1056727306293950987%26skey%3D%40crypt_5a237c93_47e8a50dc367fb733fd08a1713f91ebf%26mmweb_appid%3Dwx_webfilehelper.jpg/webp',
  },
  {
    id: 'raisin',
    name: '葡萄干',
    desc: '甜甜的，还带点嚼劲',
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261018/Iypz/1674X1741/_cgi-bin_mmwebwx-bin_webwxgetmsgimg__%26MsgID%3D7146224855925094698%26skey%3D%40crypt_5a237c93_47e8a50dc367fb733fd08a1713f91ebf%26mmweb_appid%3Dwx_webfilehelper.jpg/webp',
  },
  {
    id: 'seaweed',
    name: '海苔片',
    desc: '咸咸脆脆，停不下来的那种',
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261018/Y75V/1350X1234/_cgi-bin_mmwebwx-bin_webwxgetmsgimg__%26MsgID%3D5209777935916091606%26skey%3D%40crypt_5a237c93_47e8a50dc367fb733fd08a1713f91ebf%26mmweb_appid%3Dwx_webfilehelper.jpg/webp',
  },
  {
    id: 'lollipop',
    name: '棒棒糖',
    desc: '甜得很慢，能舔很久',
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261018/JFQX/872X1355/_cgi-bin_mmwebwx-bin_webwxgetmsgimg__%26MsgID%3D657888298677368259%26skey%3D%40crypt_5a237c93_47e8a50dc367fb733fd08a1713f91ebf%26mmweb_appid%3Dwx_webfilehelper.jpg/webp',
  },
  {
    id: 'milk-box',
    name: '牛奶盒',
    desc: '插上吸管，咕嘟咕嘟',
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261018/vjWy/1216X1325/_cgi-bin_mmwebwx-bin_webwxgetmsgimg__%26MsgID%3D3865928720038065024%26skey%3D%40crypt_5a237c93_47e8a50dc367fb733fd08a1713f91ebf%26mmweb_appid%3Dwx_webfilehelper.jpg/webp',
  },
  {
    id: 'apple',
    name: '小苹果',
    desc: '脆脆的，咬一口汁水四溅',
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261018/wize/1216X1723/_cgi-bin_mmwebwx-bin_webwxgetmsgimg__%26MsgID%3D6454977092060386349%26skey%3D%40crypt_5a237c93_47e8a50dc367fb733fd08a1713f91ebf%26mmweb_appid%3Dwx_webfilehelper.jpg/webp',
  },
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
      sceneUrl: 'https://img.pagehost.cn/autoupload/amqnh/20261018/wmlf/1024X1024/gi2-e1792296008.png/webp',
      choices: [
        { label: '摘一朵带回去', tag: 'wild' },
        { label: '看看就好，不摘它', tag: 'gentle' },
      ],
    },
    {
      scene: '午饭时间，{name}的零食看起来特别香，旁边的同学忍不住多看了两眼。',
      sceneUrl: 'https://img.pagehost.cn/autoupload/amqnh/20261018/S9ZW/1024X1024/gi2-e1792296635.png/webp',
      choices: [
        { label: '分一点给同学', tag: 'gentle' },
        { label: '自己悄悄吃完', tag: 'wild' },
      ],
    },
    {
      scene: '集合的哨声响了，可是草地那边有只蝴蝶飞得特别好看。',
      sceneUrl: 'https://img.pagehost.cn/autoupload/amqnh/20261018/5zBv/1024X1024/gi2-e1792296245.png/webp',
      choices: [
        { label: '准时跑回去集合', tag: 'gentle' },
        { label: '再多追一会儿蝴蝶', tag: 'wild' },
      ],
    },
  ],
  autumn_outing: [
    {
      scene: '刚下车，地上已经积了一层厚厚的落叶，踩上去沙沙作响。',
      sceneUrl: 'https://img.pagehost.cn/autoupload/amqnh/20261018/FL0Z/1024X1024/gi2-e1792296254.png/webp',
      choices: [
        { label: '使劲踩一踩，听听声音', tag: 'wild' },
        { label: '小心绕过去，怕弄脏鞋子', tag: 'gentle' },
      ],
    },
    {
      scene: '午饭时间，{name}的零食看起来特别好吃，同桌已经盯着看了好一会儿了。',
      sceneUrl: 'https://img.pagehost.cn/autoupload/amqnh/20261018/S9ZW/1024X1024/gi2-e1792296635.png/webp',
      choices: [
        { label: '分一半零食给同桌', tag: 'gentle' },
        { label: '悄悄自己吃完', tag: 'wild' },
      ],
    },
    {
      scene: '集合时间快到了，池塘里有几条鱼游得正欢。',
      sceneUrl: 'https://img.pagehost.cn/autoupload/amqnh/20261018/o18T/1024X1024/gi2-e1792297582.png/webp',
      choices: [
        { label: '准时回去集合', tag: 'gentle' },
        { label: '多看一会儿鱼', tag: 'wild' },
      ],
    },
  ],
};

export const getEventRounds = (eventId) => EVENT_ROUNDS[eventId] || [];

/* ---------------- 结算：合影 + 结语 + 奖励 ---------------- */
/*
 * 三轮选完以后，哪一边（gentle / wild）出现次数多就走哪一条结语——
 * 3 轮两个选项，不会出现 1.5:1.5 的平局，所以只需要两条文案，不用
 * 处理"打平"的情况。
 */
export const EVENT_HEART_REWARD = 4;

export const EVENT_ENDINGS = {
  spring_outing: {
    gentle: '这次春游，{name}一直乖乖跟着队伍，看花不摘花、零食也记得分给同学，老师悄悄给了一朵小红花。',
    wild: '这次春游，{name}东跑西跑，追蝴蝶追到差点没跟上队伍，回来的路上还在跟同学比谁今天最开心。',
  },
  autumn_outing: {
    gentle: '这次秋游，{name}走得稳稳当当，零食主动分给了同桌，还捡了一片最好看的叶子准备带回家做标本。',
    wild: '这次秋游，{name}把落叶踩得沙沙响，蹲在池塘边看鱼看了好久，差点是最后一个跑回集合点的。',
  },
};

export const findEventEnding = (eventId, endingKey) => EVENT_ENDINGS[eventId]?.[endingKey] || '';
