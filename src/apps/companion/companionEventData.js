/*
 * "小伙伴"特殊事件目录——纯数据，不含任何 db 读写（逻辑在
 * companionEventService.js）。三种事件：
 *
 *   - flavor：纯氛围小事件（心情异常、认识新朋友、学会新技能……），
 *     只给一点点数值小加成，不解锁任何东西，可以反复触发。
 *   - rare_unlock：触发一次就永久解锁对应的稀有食物购买资格
 *     （解锁状态记在 companion.unlockedRareFoodIds，触发过一次后
 *     这条事件不会再触发——判断方式就是"那个食物 id 是否已经在
 *     解锁列表里"，不需要额外的"已触发"标记）。
 *   - legendary_grant：触发一次就给 1 份对应的传说食物（存进
 *     companion.legendaryStock），可以反复触发（毕竟是消耗品），
 *     但全局有冷却（见 companionEventService.js 的
 *     MIN_LEGENDARY_GRANT_GAP_HOURS），防止短时间内连续刷到。
 *
 * check(ctx) 是纯函数，ctx 由 companionEventService.js 在每次判定时
 * 组装（daysSinceAdopt、daysSinceLastOpen、companion 当前各项计数
 * 字段等），这里不直接访问 companion 原始字段，方便以后要加新派生
 * 数据时只用改 service 这一处。
 *
 * 【关于"清洁度"】：目前小伙伴只有饱食/心情两个数值属性，还没有真正
 * 的清洁度数值字段，"泡了一个悠长的澡"这条事件改成了用"累计清洁互动
 * 次数"代替原本设想的"清洁度满格"，等后续真的加了清洁度属性，
 * 只需要改这一条的 check，不影响别的事件。
 *
 * 【关于"生日/节日"】：需要用户先设置生日才能判断，这个功能现在还没
 * 有，所以"今天是个特别的日子"这条传说事件先不放进自动判定池
 * （isAutoRollable: false），留着以后接上生日设置后再打开。
 */

export const EVENT_KINDS = {
  FLAVOR: 'flavor',
  RARE_UNLOCK: 'rare_unlock',
  LEGENDARY_GRANT: 'legendary_grant',
  CHOICE: 'choice',
};

// ---- 氛围小事件：心情异常 / 想要东西 / 认识新朋友 / 学会技能 ----
export const FLAVOR_EVENTS = [
  {
    id: 'flavor-mood-low',
    kind: EVENT_KINDS.FLAVOR,
    title: '它好像有点低落',
    bannerText: '它窝在角落里，看起来不太开心……',
    characterLine: (name) => `${name}今天好像有点闷闷的，蹲在角落里不太想动，要不要去陪陪它？`,
    reward: { mood: 5 },
    probability: 0.08,
    check: (ctx) => ctx.mood < 40,
  },
  {
    id: 'flavor-mood-high',
    kind: EVENT_KINDS.FLAVOR,
    title: '它兴奋得跳了起来',
    bannerText: '它绕着圈圈跑，心情好得不行！',
    characterLine: (name) => `${name}今天兴奋得不得了，一直围着你转圈圈，看着就让人开心。`,
    reward: { hearts: 1 },
    probability: 0.08,
    check: (ctx) => ctx.mood > 85,
  },
  {
    id: 'flavor-new-friend',
    kind: EVENT_KINDS.FLAVOR,
    title: '它好像认识了新朋友',
    bannerText: '它趴在窗边，好像在跟外面的谁打招呼。',
    characterLine: (name) => `${name}好像在窗边认识了个新朋友，叽叽喳喳地跟对方"聊"了好一会儿。`,
    reward: { mood: 6 },
    probability: 0.05,
    check: (ctx) => ctx.daysSinceAdopt >= 2,
  },
  {
    id: 'flavor-new-skill',
    kind: EVENT_KINDS.FLAVOR,
    title: '它学会了一个新技能',
    bannerText: '它正得意地展示一个新学会的小动作！',
    characterLine: (name) => `${name}好像自己偷偷学会了个新把戏，一直在你面前得意地表演。`,
    reward: { mood: 8 },
    probability: 0.05,
    check: (ctx) => ctx.daysSinceAdopt >= 3,
  },
  {
    id: 'flavor-wants-something',
    kind: EVENT_KINDS.FLAVOR,
    title: '它好像很想要点什么',
    bannerText: '它盯着商店的方向，眼神里全是期待。',
    characterLine: (name) => `${name}一直盯着商店那边看，好像很想要点什么好吃的或者好玩的。`,
    reward: {},
    probability: 0.06,
    check: (ctx) => ctx.satiety < 60 && ctx.mood < 70,
  },
  {
    id: 'flavor-nice-dream',
    kind: EVENT_KINDS.FLAVOR,
    title: '它做了一个有趣的梦',
    bannerText: '它睡醒之后一直盯着你，好像在回味什么。',
    characterLine: (name) => `${name}好像刚睡醒，迷迷糊糊地盯着你，像是梦到了什么有趣的事。`,
    reward: { mood: 3 },
    probability: 0.04,
    check: () => true,
  },
  // ↓↓↓ 新增 ↓↓↓
  {
    id: 'flavor-sleepy-yawn',
    kind: EVENT_KINDS.FLAVOR,
    title: '它打了一个好大的哈欠',
    bannerText: '它吃得饱饱的，窝在原地打哈欠，眼皮都快睁不开了。',
    characterLine: (name) => `${name}吃饱喝足之后一直打哈欠，眼皮耷拉下来，看起来下一秒就要睡着了。`,
    reward: { mood: 2 },
    probability: 0.07,
    check: (ctx) => ctx.satiety > 75 && ctx.mood > 50,
  },
  {
    id: 'flavor-mirror-curious',
    kind: EVENT_KINDS.FLAVOR,
    title: '它对着镜子发呆',
    bannerText: '它盯着镜子里的自己，歪着头，好像没认出来。',
    characterLine: (name) => `${name}趴在镜子前面歪着头看了好久，还伸爪子碰了碰，像是没认出镜子里的是自己。`,
    reward: {},
    probability: 0.03,
    check: () => true,
  },
  {
    id: 'flavor-hums-along',
    kind: EVENT_KINDS.FLAVOR,
    title: '它跟着哼起了调子',
    bannerText: '它心情很好，嘴里哼哼唧唧地跟着节奏晃。',
    characterLine: (name) => `${name}心情好得不行，嘴里哼哼唧唧的，还跟着不知道哪来的调子晃来晃去。`,
    reward: { mood: 4 },
    probability: 0.06,
    check: (ctx) => ctx.mood > 70,
  },
  {
    id: 'flavor-tidies-nest',
    kind: EVENT_KINDS.FLAVOR,
    title: '它偷偷收拾了自己的小窝',
    bannerText: '它把自己的小窝重新摆弄了一遍，看起来很满意。',
    characterLine: (name) => `${name}不知道什么时候把自己的小窝重新收拾了一遍，叼来叼去摆弄半天，摆完还蹲在旁边美滋滋地看。`,
    reward: { mood: 5 },
    probability: 0.05,
    check: (ctx) => ctx.daysSinceAdopt >= 5,
  },
  {
    id: 'flavor-chasing-shadow',
    kind: EVENT_KINDS.FLAVOR,
    title: '它追着自己的影子玩',
    bannerText: '它兴致勃勃地追着自己的影子转圈，玩得不亦乐乎。',
    characterLine: (name) => `${name}不知道在兴奋什么，追着自己的影子转了一圈又一圈，玩得气喘吁吁还很开心。`,
    reward: { mood: 3 },
    probability: 0.05,
    check: (ctx) => ctx.mood > 60 && ctx.satiety > 50,
  },
    {
    id: 'flavor-chase-shadow',
    kind: EVENT_KINDS.FLAVOR,
    title: '它在和自己的影子斗智斗勇',
    bannerText: '它正全神贯注地盯着地上的影子，突然猛地一扑！',
    characterLine: (name) => `${name}在地上一惊一乍地追着自己的影子扑腾，玩得满头大汗还乐此不疲。`,
    reward: { mood: 6 },
    probability: 0.05,
    check: (ctx) => ctx.mood >= 50,
  },
  {
    id: 'flavor-supervise-work',
    kind: EVENT_KINDS.FLAVOR,
    title: '它化身成了小监工',
    bannerText: '它端端正正地蹲在旁边，眼睛一眨不眨地盯着你。',
    characterLine: (name) => `${name}像个称职的小监工一样守在旁边，只要你一停下来，它就发出小呼噜声催你继续加油。`,
    reward: { mood: 5, hearts: 1 },
    probability: 0.05,
    check: () => true,
  },
  {
    id: 'flavor-contagious-yawn',
    kind: EVENT_KINDS.FLAVOR,
    title: '它打了一个超大的哈欠',
    bannerText: '它张大嘴巴伸了个长长的懒腰，连带着空气都变慵懒了。',
    characterLine: (name) => `${name}揉了揉眼睛，当着你的面打了个大大的哈欠，看得你也忍不住跟着犯困了。`,
    reward: { mood: 4 },
    probability: 0.06,
    check: (ctx) => ctx.satiety > 50,
  },
  {
    id: 'flavor-pretend-deaf',
    kind: EVENT_KINDS.FLAVOR,
    title: '它假装没听到你的呼唤',
    bannerText: '明明耳朵都动了动，小脑袋却故意扭向另一边。',
    characterLine: (name) => `你刚才喊了${name}一声，它的小耳朵明明抖了一下，却还故意背过身去，真是只傲娇的小家伙。`,
    reward: { mood: 3 },
    probability: 0.04,
    check: (ctx) => ctx.mood < 60,
  },
  {
    id: 'flavor-hide-treasure',
    kind: EVENT_KINDS.FLAVOR,
    title: '它藏起了一个神秘宝物',
    bannerText: '它鬼鬼祟祟地用爪子往小窝底下塞着什么小玩意儿。',
    characterLine: (name) => `${name}不知道从哪捡了个小纸团，神神秘秘地藏在垫子底下，还自以为藏得天衣无缝。`,
    reward: { mood: 5 },
    probability: 0.05,
    check: (ctx) => ctx.daysSinceAdopt >= 1,
  },
  {
    id: 'flavor-startled-self',
    kind: EVENT_KINDS.FLAVOR,
    title: '它被自己吓了一大跳',
    bannerText: '突然一阵机灵原地弹起，四周看了一圈又假装什么都没发生。',
    characterLine: (name) => `${name}刚才突然被自己的小尾巴扫到，原地吓得蹦起半米高，落地后还若无其事地理了理毛。`,
    reward: { mood: 4 },
    probability: 0.04,
    check: () => true,
  },

];

// ---- 稀有食物解锁事件：触发一次，永久解锁对应食物的购买资格 ----
export const RARE_UNLOCK_EVENTS = [
  {
    id: 'rare-unlock-old-recipe',
    kind: EVENT_KINDS.RARE_UNLOCK,
    title: '发现了角落里的旧食谱',
    bannerText: '它翻出了一本旧食谱，上面画着樱花年糕的做法。',
    characterLine: (name) => `${name}翻出了一本旧食谱，兴冲冲地指着上面"樱花年糕"的插画，看起来很想尝尝。`,
    grantsFoodId: 'food-sakura-mochi',
    check: (ctx) => ctx.daysSinceAdopt >= 7,
  },
  {
    id: 'rare-unlock-mood-streak',
    kind: EVENT_KINDS.RARE_UNLOCK,
    title: '某天心情特别好',
    bannerText: '它一连好几次都是最开心的样子，像是打开了什么新世界。',
    characterLine: (name) => `${name}这几天心情都特别好，好像因为这样学会了做奶油泡芙。`,
    grantsFoodId: 'food-cream-puff',
    check: (ctx) => ctx.moodFullStreak >= 3,
  },
  {
    id: 'rare-unlock-long-bath',
    kind: EVENT_KINDS.RARE_UNLOCK,
    title: '泡了一个悠长的澡',
    bannerText: '它刚洗完澡，整个人暖烘烘的，闻起来香香的。',
    characterLine: (name) => `${name}刚洗完一个很舒服的澡，暖烘烘地凑过来，好像特别想吃溏心温泉蛋。`,
    grantsFoodId: 'food-onsen-egg',
    check: (ctx) => ctx.cleanActionCount >= 15,
  },
  {
    id: 'rare-unlock-spilled-lemon',
    kind: EVENT_KINDS.RARE_UNLOCK,
    title: '打翻了一瓶柠檬汁',
    bannerText: '它不小心碰倒了柠檬汁，反而闻出了新灵感。',
    characterLine: (name) => `${name}不小心打翻了一瓶柠檬汁，闻着闻着居然琢磨出了薄荷柠檬挞的配方。`,
    grantsFoodId: 'food-mint-lemon-tart',
    probability: 0.01,
    check: () => true,
  },
  {
    id: 'rare-unlock-matcha-dream',
    kind: EVENT_KINDS.RARE_UNLOCK,
    title: '做了一个关于抹茶的梦',
    bannerText: '它睡得很香，嘴里好像还在念叨着"抹茶"。',
    characterLine: (name) => `${name}梦里好像全是抹茶的味道，醒来就缠着要抹茶千层。`,
    grantsFoodId: 'food-matcha-millefeuille',
    // 心情越高，越容易做个好梦——概率随 mood 线性提高。
    probability: null,
    getProbability: (ctx) => 0.015 + (ctx.mood / 100) * 0.03,
    check: () => true,
  },
  {
    id: 'rare-unlock-fridge-cheese',
    kind: EVENT_KINDS.RARE_UNLOCK,
    title: '翻出了冰箱里的奶酪',
    bannerText: '它饿得不行，自己翻冰箱找到了一块奶酪。',
    characterLine: (name) => `${name}饿得翻遍了冰箱，最后啃着一块奶酪，像是发现了芝士焗红薯的灵感。`,
    grantsFoodId: 'food-cheese-sweet-potato',
    check: (ctx) => ctx.satiety < 30,
  },
  {
    id: 'rare-unlock-learned-recipe',
    kind: EVENT_KINDS.RARE_UNLOCK,
    title: '偷偷学会了一个食谱',
    bannerText: '它趴在你喂食的样子旁边偷偷观察了好久。',
    characterLine: (name) => `${name}偷偷观察你喂它吃了那么多次，终于自己也学会了做草莓大福。`,
    grantsFoodId: 'food-strawberry-daifuku',
    check: (ctx) => ctx.feedCount >= 50,
  },
  {
    id: 'rare-unlock-garden-dream',
    kind: EVENT_KINDS.RARE_UNLOCK,
    title: '梦见了花园',
    bannerText: '它趴在窗边睡着了，嘴角带着笑意，像是梦到了一座花园。',
    characterLine: (name) => `${name}这一个月陪你陪得很开心，昨晚还梦到了一座开满玫瑰的花园。`,
    grantsFoodId: 'food-rose-pudding',
    check: (ctx) => ctx.daysSinceAdopt >= 30,
  },
  // ↓↓↓ 新增 ↓↓↓
  {
    id: 'rare-unlock-midnight-snack',
    kind: EVENT_KINDS.RARE_UNLOCK,
    title: '半夜偷偷找吃的',
    bannerText: '它半夜饿醒，翻箱倒柜找吃的，自己捣鼓出了新花样。',
    characterLine: (name) => `${name}半夜饿得受不了，翻箱倒柜捣鼓了半天，居然自己烤出了一块蜂蜜红茶蛋糕。`,
    grantsFoodId: 'food-honey-black-tea-cake',
    check: (ctx) => ctx.satiety < 20,
  },
  {
    id: 'rare-unlock-happy-and-full',
    kind: EVENT_KINDS.RARE_UNLOCK,
    title: '又开心又吃得饱饱的',
    bannerText: '它心情好、肚子也饱，整只都在发光，好像灵感爆棚。',
    characterLine: (name) => `${name}今天心情特别好，肚子也吃得饱饱的，美滋滋地琢磨出了蜜桃樱花糕的做法。`,
    grantsFoodId: 'food-peach-blossom-cake',
    check: (ctx) => ctx.mood > 80 && ctx.satiety > 80,
  },
  {
    id: 'rare-unlock-two-weeks',
    kind: EVENT_KINDS.RARE_UNLOCK,
    title: '相伴两周了',
    bannerText: '陪伴满两周，它像是想郑重其事地庆祝一下。',
    characterLine: (name) => `${name}掐着手指算了算，已经陪你整整两周了，特意泡了一杯伯爵红茶，还顺手做了个布丁。`,
    grantsFoodId: 'food-earl-grey-pudding',
    check: (ctx) => ctx.daysSinceAdopt >= 14,
  },
  {
    id: 'rare-unlock-super-active',
    kind: EVENT_KINDS.RARE_UNLOCK,
    title: '跟你互动得特别勤',
    bannerText: '它这阵子跟你互动得特别频繁，好像黏人了不少。',
    characterLine: (name) => `${name}这阵子一直缠着你玩，互动多到自己都数不清了，开心之余居然学会了做芒果糯米饭。`,
    grantsFoodId: 'food-mango-sticky-rice',
    check: (ctx) => ctx.totalInteractionCount >= 200,
  },
];

// ---- 传说食物触发事件：触发一次就给 1 份对应传说食物 ----
export const LEGENDARY_GRANT_EVENTS = [
  {
    id: 'legendary-shooting-star',
    kind: EVENT_KINDS.LEGENDARY_GRANT,
    title: '流星划过',
    bannerText: '夜空中划过一道流星，它许了个愿望。',
    characterLine: (name) => `${name}好像看到了一道流星，兴奋地拉着你一起许愿，然后不知从哪变出了一串流星糖葫芦。`,
    grantsFoodId: 'food-shooting-star-candy',
    probability: 0.002,
    check: () => true,
  },
  {
    id: 'legendary-missed-you',
    kind: EVENT_KINDS.LEGENDARY_GRANT,
    title: '好久没见，好想你',
    bannerText: '它窝在原地等了你好久，终于等到你回来了。',
    characterLine: (name) => `${name}已经好几天没见到你了，一直等在原地，见到你的第一件事就是把珍藏的梦境马卡龙拿出来分你一半。`,
    grantsFoodId: 'food-dream-macaron',
    check: (ctx) => ctx.daysSinceLastOpen >= 5,
  },
  {
    id: 'legendary-mystery-box',
    kind: EVENT_KINDS.LEGENDARY_GRANT,
    title: '捡到了一个神秘礼盒',
    bannerText: '它叼回来一个包装精美的小礼盒，不知道从哪捡到的。',
    characterLine: (name) => `${name}不知道从哪叼回来一个神秘礼盒，拆开一看，里面是一包幸运饼干。`,
    grantsFoodId: 'food-lucky-cookie',
    probability: 0.03,
    check: () => true,
  },
  {
    id: 'legendary-chef-gift',
    kind: EVENT_KINDS.LEGENDARY_GRANT,
    title: '梦里的厨师送来了礼物',
    bannerText: '它说梦里有个神秘的厨师，送了它一份特别的礼物。',
    characterLine: (name) => `${name}陪你整整 100 天了，说梦里有个厨师出现，送了它一份金灿灿的栗子饭当作礼物。`,
    grantsFoodId: 'food-golden-chestnut-rice',
    // 陪伴满 100 天是个一次性里程碑，不是"每次打开都满足"的常驻条件，
    // 只触发一次——靠 companion.firedMilestoneEventIds 记录，不会反复给。
    oncePerLifetime: true,
    check: (ctx) => ctx.daysSinceAdopt >= 100,
  },
  {
    id: 'legendary-rainbow-moment',
    kind: EVENT_KINDS.LEGENDARY_GRANT,
    title: '彩虹出现的那一刻',
    bannerText: '它指着天边的彩虹，整只都在发光一样开心。',
    characterLine: (name) => `${name}指着天边一道彩虹，兴奋地说这是好运气的预兆，变出了一碗星空果冻。`,
    grantsFoodId: 'food-starry-jelly',
    probability: 0.007,
    check: () => true,
  },
  {
    id: 'legendary-time-loop-feeling',
    kind: EVENT_KINDS.LEGENDARY_GRANT,
    title: '时光倒流的错觉',
    bannerText: '它望着你，好像在回忆你们相处的每一个瞬间。',
    characterLine: (name) => `${name}数了数你们已经互动了 1000 次，恍惚间有种时光倒流的错觉，郑重地端出一碗时光奶油冻。`,
    grantsFoodId: 'food-time-cream-pudding',
    // 同上，1000 次互动也是一次性里程碑，不会每次打开都重复触发。
    oncePerLifetime: true,
    check: (ctx) => ctx.totalInteractionCount >= 1000,
  },
  {
    id: 'legendary-special-day',
    kind: EVENT_KINDS.LEGENDARY_GRANT,
    title: '今天是个特别的日子',
    bannerText: '它好像知道今天有什么特别的意义。',
    characterLine: (name) => `${name}好像知道今天是个特别的日子，特地准备了一份彩虹蜂蜜蛋糕。`,
    grantsFoodId: 'food-rainbow-honey-cake',
    // 需要先有"生日/纪念日"设置才能真正判断，暂不加入自动判定池。
    isAutoRollable: false,
    check: () => false,
  },
  {
    id: 'legendary-catch-all-good-day',
    kind: EVENT_KINDS.LEGENDARY_GRANT,
    title: '今天一定会有好事发生',
    bannerText: '它莫名其妙地开始翻箱倒柜，像是在找什么惊喜。',
    characterLine: (name) => `${name}莫名其妙地开始翻箱倒柜，最后举着一卷初雪抹茶卷跑了回来，说今天一定会有好事发生。`,
    grantsFoodId: 'food-first-snow-matcha-roll',
    // 兜底事件：以上传说事件这次都没命中时，极小概率给个"安慰"惊喜。
    probability: 0.005,
    check: () => true,
  },
  // ↓↓↓ 新增 ↓↓↓
  {
    id: 'legendary-moonlight-feeling',
    kind: EVENT_KINDS.LEGENDARY_GRANT,
    title: '月光正好的夜晚',
    bannerText: '月光洒在它身上，它安安静静地望着月亮出神。',
    characterLine: (name) => `${name}今晚月光特别好，它趴在窗边望了很久月亮，转头端出一碗月光布丁，说是看月亮看出来的灵感。`,
    grantsFoodId: 'food-moonlight-pudding',
    probability: 0.004,
    check: () => true,
  },
  {
    id: 'legendary-half-year-anniversary',
    kind: EVENT_KINDS.LEGENDARY_GRANT,
    title: '相伴半年了',
    bannerText: '陪伴满半年，它郑重其事地准备了一份纪念礼物。',
    characterLine: (name) => `${name}陪你整整半年了，一直偷偷准备，今天郑重其事地端出一份周年纪念挞，像是在说"谢谢你一直陪着我"。`,
    grantsFoodId: 'food-anniversary-tart',
    // 半年陪伴是一次性里程碑，不会每次打开都重复触发。
    oncePerLifetime: true,
    check: (ctx) => ctx.daysSinceAdopt >= 180,
  },
];

// ---- 选项事件：触发时先插一句"剧情开场白"，用户点开事件卡片后要从
// 2-3 个选项里选一个；选完才真正结算奖励（小数值加成，不会出现惩罚性的
// 负数——"不是最优解"体现在奖励明显更少，而不是倒扣），并把对应那个
// 选项的文案当作角色反应单独插进聊天记录（跟触发时的开场白是两条
// 独立的消息）。跟其它三类事件共用同一套触发判定/冷却/卡槽逻辑，
// 见 companionEventService.js 的 evaluateCompanionEvents。
export const CHOICE_EVENTS = [
  {
    id: 'choice-two-boxes',
    kind: EVENT_KINDS.CHOICE,
    title: '两个神秘的盒子',
    bannerText: '它叼来了两个长得差不多的盒子，纠结地看看这个又看看那个，好像在等你帮它拿主意。',
    characterLine: (name) => `${name}叼来了两个长得差不多的盒子，纠结了半天也拿不定主意，眼巴巴地望着你，好像想让你帮它选一个。`,
    probability: 0.05,
    check: () => true,
    options: [
      {
        id: 'shiny',
        label: '选闪闪发光的那个',
        outcomeText: (name) => `${name}兴冲冲地打开闪闪发光的盒子，结果里面空空如也——不过盒子本身挺好看，它干脆把盒子当成新玩具抱着玩了起来。`,
        reward: { mood: 4 },
      },
      {
        id: 'plain',
        label: '选朴素的那个',
        outcomeText: (name) => `${name}半信半疑地打开朴素的盒子，没想到里面满满当当全是它最爱吃的东西，开心得直打转。`,
        reward: { mood: 10, satiety: 15, hearts: 1.5 },
      },
    ],
  },
  {
    id: 'choice-two-paths',
    kind: EVENT_KINDS.CHOICE,
    title: '两条没走过的小路',
    bannerText: '它在岔路口停了下来，一条近一条远，看起来是想让你帮它挑一条。',
    characterLine: (name) => `${name}在岔路口停了下来，一条近一条远，转头看着你，好像在等你帮它挑一条没走过的路。`,
    probability: 0.05,
    check: (ctx) => ctx.daysSinceAdopt >= 1,
    options: [
      {
        id: 'near',
        label: '走近的那条',
        outcomeText: (name) => `${name}很快就逛完了近的那条路，没什么特别的，不过悠悠闲闲地散了个步，心情也还不错。`,
        reward: { mood: 5 },
      },
      {
        id: 'far',
        label: '走远的那条',
        outcomeText: (name) => `${name}走了好久远的那条路，意外看到一片开得正好的花丛，开心得又蹦又跳，一直拉着你说要再去看看。`,
        reward: { mood: 14, hearts: 1 },
      },
        {
    id: 'choice-cardboard-box',
    kind: EVENT_KINDS.CHOICE,
    title: '地上出现了一个空纸箱',
    bannerText: '一个刚拆开的干净纸箱摆在地上，它两眼放光，正在纠结怎么处置这个新领地。',
    characterLine: (name) => `${name}围着刚拆开的空纸箱转了好几圈，尾巴摇得飞快，想让你决定该怎么玩。`,
    probability: 0.045,
    check: () => true,
    options: [
      {
        id: 'box-fort',
        label: '钻进去当秘密基地',
        outcomeText: (name) => `${name}麻利地钻进了纸箱，只露出两只亮晶晶的眼睛偷看你，在里面窝得特别有安全感。`,
        reward: { mood: 8 },
      },
      {
        id: 'box-destroy',
        label: '在外面抓挠磨磨爪',
        outcomeText: (name) => `${name}对着纸箱边缘一顿疯狂抓挠和啃咬，纸屑横飞，彻底释放了精力，心满意足地喘着气。`,
        reward: { mood: 12, hearts: 1 },
      },
    ],
  },
  {
    id: 'choice-pet-spot',
    kind: EVENT_KINDS.CHOICE,
    title: '求抚摸的小心思',
    bannerText: '它主动凑了过来，脑袋轻轻贴在你的手边，等待着抚摸。',
    characterLine: (name) => `${name}凑到你的手边轻轻蹭了蹭，仰着小脸，在纠结让你先摸哪里最舒服。`,
    probability: 0.05,
    check: (ctx) => ctx.mood > 20,
    options: [
      {
        id: 'scratch-chin',
        label: '挠挠软软的下巴',
        outcomeText: (name) => `你轻轻挠了挠${name}的下巴，它舒服得立刻闭上眼睛，喉咙里响起了像小马达一样的呼噜声。`,
        reward: { mood: 7 },
      },
      {
        id: 'rub-belly',
        label: '大方揉揉小肚子',
        outcomeText: (name) => `${name}顺势四脚朝天翻出了肚皮，任由你轻轻揉搓，这是它对你毫无保留的极致信任！`,
        reward: { mood: 10, hearts: 2 },
      },
    ],
  },
  {
    id: 'choice-bird-at-window',
    kind: EVENT_KINDS.CHOICE,
    title: '窗外停了一只小麻雀',
    bannerText: '窗台外落下一只扑闪翅膀的小鸟，它整只都定住了。',
    characterLine: (name) => `窗外飞来一只小麻雀，${name}眼睛瞪得圆滚滚的，身子压得低低的，尾巴尖还在轻微颤动。`,
    probability: 0.04,
    check: () => true,
    options: [
      {
        id: 'hold-up-closer',
        label: '抱起它靠近看个仔细',
        outcomeText: (name) => `你抱着${name}贴近窗户，小家伙看得聚精会神，好奇心得到了极大的满足，直到小鸟飞走还意犹未尽。`,
        reward: { mood: 9 },
      },
      {
        id: 'pull-curtain',
        label: '拉上薄纱防止太激动',
        outcomeText: (name) => `薄纱窗帘挡住了直视，${name}在薄纱后影影绰绰地看了一会儿，慢慢冷静下来，蹭着你的手心表示感谢。`,
        reward: { mood: 6, hearts: 1 },
      },
    ],
  },
  {
    id: 'choice-playtime-style',
    kind: EVENT_KINDS.CHOICE,
    title: '现在要玩什么游戏',
    bannerText: '它叼来了自己的逗宠小道具，歪着头期待你的陪伴。',
    characterLine: (name) => `${name}精神头十足，在房间中央蹦跶来蹦跶去，正眼巴巴地等着你陪它玩游戏。`,
    probability: 0.045,
    check: (ctx) => ctx.satiety >= 30,
    options: [
      {
        id: 'play-hide-seek',
        label: '玩躲猫猫（你藏它找）',
        outcomeText: (name) => `你悄悄藏在门后，${name}像个侦探一样耸着鼻子四处搜寻，找到你的一瞬间激动得直接扑了过来！`,
        reward: { mood: 11, hearts: 1 },
      },
      {
        id: 'play-chase',
        label: '玩快节奏的追逐战',
        outcomeText: (name) => `你拿小道具在房间里轻快移动，${name}展现出了闪电般的身手，一番追逐大战后痛快地瘫在垫子上直喘气。`,
        reward: { mood: 14 },
      },
    ],
  },
  {
    id: 'choice-photo-pose',
    kind: EVENT_KINDS.CHOICE,
    title: '给它拍一张今日特写',
    bannerText: '你拿出了相机，它似乎察觉到了镜头，正琢磨摆个什么架势。',
    characterLine: (name) => `${name}看到你举起镜头，一下子愣在原地，不知道该摆出帅气姿态还是搞怪表情。`,
    probability: 0.04,
    check: (ctx) => ctx.daysSinceAdopt >= 2,
    options: [
      {
        id: 'pose-cute-silly',
        label: '抓拍歪头搞怪瞬间',
        outcomeText: (name) => `咔嚓一声！正巧抓拍到${name}歪着脑袋吐舌头的瞬间，滑稽又可爱，绝对能当今日最佳表情包！`,
        reward: { mood: 8 },
      },
      {
        id: 'pose-elegant-model',
        label: '等它端正坐好拍靓照',
        outcomeText: (name) => `${name}立刻心领神会，挺直腰板坐得端端正正，小爪子并得整整齐齐，拍出了一张帅气的“证件照”。`,
        reward: { mood: 9, hearts: 1 },
      },
    ],
  },

    ],
  },
  {
    id: 'choice-stranger-snacks',
    kind: EVENT_KINDS.CHOICE,
    title: '自己捣鼓的两份点心',
    bannerText: '它神气活现地端出两份自己捣鼓的点心，一份看起来普普通通，一份看起来有点奇怪，拿不定主意该先吃哪份。',
    characterLine: (name) => `${name}神气活现地端出两份自己捣鼓的点心，一份普普通通，一份看起来有点奇怪，举着左看右看，想让你帮它决定先吃哪份。`,
    probability: 0.04,
    check: (ctx) => ctx.satiety < 90,
    options: [
      {
        id: 'plain-snack',
        label: '先吃普通的那份',
        outcomeText: (name) => `${name}吃了普普通通的那份，味道中规中矩，但也算是吃饱了，心满意足地拍了拍肚子。`,
        reward: { satiety: 12, mood: 3 },
      },
      {
        id: 'odd-snack',
        label: '先吃奇怪的那份',
        outcomeText: (name) => `${name}试探地咬了一口看起来奇怪的那份，没想到意外地好吃，眼睛都亮了起来，一下子吃了个精光。`,
        reward: { satiety: 10, mood: 12, hearts: 1 },
      },
    ],
  },
  // ↓↓↓ 新增 ↓↓↓
  {
    id: 'choice-two-letters',
    kind: EVENT_KINDS.CHOICE,
    title: '两封没拆的信',
    bannerText: '信箱里躺着两封信，一封信封普普通通，一封印着好看的花纹，它拿不定主意先拆哪封。',
    characterLine: (name) => `${name}从信箱里叼回来两封信，一封很普通，一封印着好看的花纹，举着两封信看看你又看看信，想让你帮它选一封先拆。`,
    probability: 0.04,
    check: (ctx) => ctx.daysSinceAdopt >= 3,
    options: [
      {
        id: 'plain-letter',
        label: '先拆普通的信封',
        outcomeText: (name) => `${name}拆开普通的信封，里面只是一张写着"今天也要开心哦"的小卡片，虽然简单，但它看完还是笑眯眯的。`,
        reward: { mood: 4 },
      },
      {
        id: 'fancy-letter',
        label: '先拆花纹的信封',
        outcomeText: (name) => `${name}拆开花纹信封，里面居然夹着一张手绘的小地图，标着附近一个它从没去过的好地方，它兴奋得原地转了好几圈。`,
        reward: { mood: 11, hearts: 1 },
      },
    ],
  },
  {
    id: 'choice-two-games',
    kind: EVENT_KINDS.CHOICE,
    title: '今天想玩哪种游戏',
    bannerText: '它叼来了两样玩具放在你面前，一样是安安静静的，一样是会满屋子疯跑的，等你帮它选一种玩法。',
    characterLine: (name) => `${name}把两样玩具都摆在你面前，一样适合安安静静地玩，一样适合满屋子疯跑，眼巴巴地等你帮它决定今天玩哪种。`,
    probability: 0.045,
    check: (ctx) => ctx.mood > 40,
    options: [
      {
        id: 'quiet-game',
        label: '玩安静的游戏',
        outcomeText: (name) => `${name}乖乖地跟你玩了一会儿安静的小游戏，虽然不算刺激，但窝在你旁边的样子格外安心。`,
        reward: { mood: 6 },
      },
      {
        id: 'wild-game',
        label: '玩疯跑的游戏',
        outcomeText: (name) => `${name}一下子就开始满屋子疯跑，跑得气喘吁吁还舍不得停，玩到最后整个人（整只）都兴奋得不行。`,
        reward: { mood: 13, satiety: -3 },
      },
    ],
  },
  {
    id: 'choice-two-seats',
    kind: EVENT_KINDS.CHOICE,
    title: '坐在哪儿看风景',
    bannerText: '它跑到窗边，一会儿看看近处的位置，一会儿看看远处的位置，好像在纠结坐哪儿看风景比较好。',
    characterLine: (name) => `${name}跑到窗边东看西看，一个位置近但视野一般，一个位置要爬高一点但看得更远，纠结半天也没拿定主意。`,
    probability: 0.04,
    check: () => true,
    options: [
      {
        id: 'near-seat',
        label: '坐近处的位置',
        outcomeText: (name) => `${name}选了近处的位置，窝在那儿舒舒服服地晒了会儿太阳，看着看着自己都快眯起眼睛了。`,
        reward: { mood: 5 },
      },
      {
        id: 'far-seat',
        label: '爬去远处的位置',
        outcomeText: (name) => `${name}费了点劲爬到远处的位置，结果正好看到天边一片很好看的晚霞，激动得一直拽着你的衣角让你也快看。`,
        reward: { mood: 12, hearts: 1 },
      },
    ],
  },
  // ↓↓↓ 新增 ↓↓↓
  {
    id: 'choice-two-lullabies',
    kind: EVENT_KINDS.CHOICE,
    title: '要听哪首小曲',
    bannerText: '它蹲在你旁边，摇头晃脑地哼着自己瞎编的两种调子，想让你帮忙选一个听听看。',
    characterLine: (name) => `${name}蹲在你旁边，摇头晃脑地哼着自己瞎编的两种调子，眼巴巴地等你选一个听听看。`,
    probability: 0.04,
    check: (ctx) => ctx.mood > 30,
    options: [
      {
        id: 'calm-tune',
        label: '选轻柔的那首',
        outcomeText: (name) => `${name}哼起了轻柔的那首调子，节奏慢悠悠的，听着听着自己都快眯起眼睛了，气氛很安静舒服。`,
        reward: { mood: 5 },
      },
      {
        id: 'lively-tune',
        label: '选热闹的那首',
        outcomeText: (name) => `${name}一下子来了精神，又唱又跳地表演热闹的那首，越唱越投入，到最后像开了场小型演唱会。`,
        reward: { mood: 11, hearts: 1 },
      },
    ],
  },
  {
    id: 'choice-two-nap-spots',
    kind: EVENT_KINDS.CHOICE,
    title: '午睡选哪个地方',
    bannerText: '它困得眼皮直打架，在晒着太阳的垫子和阴凉角落的小窝之间来回看，拿不定主意睡哪儿。',
    characterLine: (name) => `${name}困得眼皮直打架，在晒着太阳的垫子和阴凉角落的小窝之间来回看，好像想让你帮它挑个睡午觉的地方。`,
    probability: 0.045,
    check: (ctx) => ctx.satiety > 40,
    options: [
      {
        id: 'sunny-spot',
        label: '睡阳光下的垫子',
        outcomeText: (name) => `${name}窝在阳光下的垫子上，晒得暖烘烘的，没一会儿就打起了小呼噜，睡得很香甜。`,
        reward: { mood: 6 },
      },
      {
        id: 'shade-spot',
        label: '睡阴凉角落的小窝',
        outcomeText: (name) => `${name}钻进阴凉角落的小窝，睡得格外沉，醒来之后整只都精神了一大圈，伸着懒腰蹭了蹭你。`,
        reward: { mood: 9, satiety: 3 },
      },
    ],
  },
  {
    id: 'choice-two-new-toys',
    kind: EVENT_KINDS.CHOICE,
    title: '两个新玩具先玩哪个',
    bannerText: '它面前摆着一个毛线球和一个会响的铃铛，两个都还没拆，纠结该先玩哪个。',
    characterLine: (name) => `${name}面前摆着一个毛线球和一个会响的铃铛，看看这个又看看那个，想让你帮它决定先玩哪个。`,
    probability: 0.04,
    check: () => true,
    options: [
      {
        id: 'yarn-ball',
        label: '先玩毛线球',
        outcomeText: (name) => `${name}扑过去追着毛线球滚来滚去，玩得挺起劲，不过没多久线团就缠成了一团，它才意犹未尽地停下来。`,
        reward: { mood: 5 },
      },
      {
        id: 'jingle-bell',
        label: '先玩会响的铃铛',
        outcomeText: (name) => `${name}一碰铃铛就被清脆的响声吸引住了，追着铃铛声跑来跑去，开心得根本停不下来。`,
        reward: { mood: 11, hearts: 1 },
      },
    ],
  },
];

export const ALL_EVENT_DEFS = [
  ...FLAVOR_EVENTS,
  ...RARE_UNLOCK_EVENTS,
  ...LEGENDARY_GRANT_EVENTS,
  ...CHOICE_EVENTS,
];

export const findEventDef = (eventDefId) => (
  ALL_EVENT_DEFS.find((def) => def.id === eventDefId) || null
);