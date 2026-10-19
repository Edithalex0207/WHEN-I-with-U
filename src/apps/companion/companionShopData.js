/*
 * "小伙伴"（#6 聊天窗宠物）静态数据：默认形态图 + 商店目录（食物/衣服/场景）。
 *
 * 这里不是数据库表——商店本身没有"库存"概念，除了：
 *   - 稀有食物：需要先触发对应的解锁事件（见 companionEventData.js），
 *     解锁后才允许购买，解锁状态记在 companion.unlockedRareFoodIds。
 *   - 传说食物：不能用心心购买，只能靠事件触发获得（每次给 1 份），
 *     存量记在 companion.legendaryStock，吃一份少一份。
 * 需要持久化的"买过/穿着哪件衣服""解锁了哪个场景"存在 companionInventory
 * 表里（见 companionService.js）。
 *
 * 【用户后续替换占位图】：所有 url 目前是占位 SVG（内联 data URI）或你
 * 自己放的图床链接。等你出好图之后，把对应条目的 url 换成图床链接即可，
 * 不用改别的代码——数值/价格也是一样，随时在这个文件里调整。
 */

const placeholderAvatarSvg = (fill) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="92" fill="${fill}" opacity="0.18" />
      <circle cx="100" cy="112" r="58" fill="${fill}" opacity="0.55" />
      <circle cx="72" cy="86" r="10" fill="${fill}" />
      <circle cx="128" cy="86" r="10" fill="${fill}" />
      <path d="M78 132 Q100 148 122 132" stroke="${fill}" stroke-width="6" fill="none" stroke-linecap="round" />
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// 三个占位形态，用不同颜色区分；替换成真实图片前，先能选、能领养、能看见。
export const DEFAULT_AVATARS = [
  { id: 'preset-a', label: '形态 A', url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/rAW5/1428X1971/1_%285%29.jpg/webp' },
  { id: 'preset-b', label: '形态 B', url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/pkSb/1635X1915/1_%284%29.jpg/webp' },
  { id: 'preset-c', label: '形态 C', url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/eAXF/1595X1823/1_%281%29.jpg/webp' },
];

/*
 * 数值效果的展示文案——商店卡片、事件弹窗都靠这张表把 effects 对象里的
 * key 翻译成人看得懂的标签。以后新增属性（比如"清洁度"）只需要在这里
 * 加一行、在下面某个食物的 effects 里加一个字段，UI 会自动显示，
 * 不需要改任何渲染逻辑。
 */
export const COMPANION_STAT_LABELS = {
  satiety: '饱食',
  mood: '心情',
  cleanliness: '清洁',
};

export const FOOD_TIERS = {
  COMMON: 'common',
  RARE: 'rare',
  LEGENDARY: 'legendary',
};

/*
 * 食物：
 *   - common：心心直接买，买 = 立即喂。
 *   - rare：心心买，但要先在 companion.unlockedRareFoodIds 里解锁
 *     （见 companionEventService.js 的 unlockEventId 对应关系）。
 *   - legendary：不能用心心买（price 不生效），只能靠传说事件触发获得，
 *     每次给 1 份，存在 companion.legendaryStock 里，吃一份少一份——
 *     走 companionService.js 的 useLegendaryFood，不走 buyShopItem。
 *
 * effects 是"买下/吃下立即生效"的加成，key 对应 COMPANION_STAT_LABELS。
 */
export const SHOP_FOOD_ITEMS = [
   // ---- 普通 ----
  // 1-3 心心的小零食：效果小，图片还没有（url 留空会显示图标占位，等你出图后填上）
  { id: 'food-mini-cookie', name: '小饼干', category: 'food', tier: FOOD_TIERS.COMMON, price: 1, effects: { satiety: 2 }, url: '' },
  { id: 'food-candy-bean', name: '彩色糖豆', category: 'food', tier: FOOD_TIERS.COMMON, price: 1, effects: { mood: 2 }, url: '' },
  { id: 'food-mini-bun', name: '迷你小面包', category: 'food', tier: FOOD_TIERS.COMMON, price: 2, effects: { satiety: 4 }, url: '' },
  { id: 'food-milk-candy', name: '牛奶糖', category: 'food', tier: FOOD_TIERS.COMMON, price: 2, effects: { mood: 4 }, url: '' },
  { id: 'food-crispy-rice', name: '脆米花', category: 'food', tier: FOOD_TIERS.COMMON, price: 3, effects: { satiety: 4, mood: 2 }, url: '' },
  { id: 'food-rice-ball', name: '小饭团', category: 'food', tier: FOOD_TIERS.COMMON, price: 8, effects: { satiety: 15 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/kdb2/1292X1292/food_%282%29.png/webp' },
  { id: 'food-boiled-egg', name: '白水煮蛋', category: 'food', tier: FOOD_TIERS.COMMON, price: 6, effects: { satiety: 12 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/7jcJ/1257X1234/food_%283%29.png/webp' },
  { id: 'food-sweet-tofu', name: '甜豆花', category: 'food', tier: FOOD_TIERS.COMMON, price: 7, effects: { mood: 12 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/SZGx/1343X1230/food_%284%29.png/webp' },
  { id: 'food-pumpkin-porridge', name: '南瓜粥', category: 'food', tier: FOOD_TIERS.COMMON, price: 12, effects: { satiety: 20 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/8ByB/1479X1203/food_%285%29.png/webp' },
  { id: 'food-strawberry-jelly', name: '草莓果冻', category: 'food', tier: FOOD_TIERS.COMMON, price: 10, effects: { mood: 15 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/Zy3L/890X830/food_%2817%29.png/webp' },
  { id: 'food-honey-toast', name: '蜂蜜吐司', category: 'food', tier: FOOD_TIERS.COMMON, price: 11, effects: { satiety: 18, mood: 8 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/lDBZ/1376X1292/food_%287%29.png/webp' },
  { id: 'food-apple-slice', name: '苹果片', category: 'food', tier: FOOD_TIERS.COMMON, price: 5, effects: { satiety: 8 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/FF5O/1420X1569/food_%288%29.png/webp' },
  { id: 'food-matcha-cookie', name: '抹茶饼干', category: 'food', tier: FOOD_TIERS.COMMON, price: 8, effects: { mood: 10, satiety: 6 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/eUWE/1311X1050/food_%289%29.png/webp' },
  // ---- 稀有（需事件解锁）----
  { id: 'food-sakura-mochi', name: '樱花年糕', category: 'food', tier: FOOD_TIERS.RARE, price: 35, effects: { mood: 30 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/XrqL/803X702/food_%2810%29.png/webp' },
  { id: 'food-cream-puff', name: '奶油泡芙', category: 'food', tier: FOOD_TIERS.RARE, price: 40, effects: { satiety: 35, mood: 20 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/tXIj/762X827/food_%2811%29.png/webp' },
  { id: 'food-onsen-egg', name: '溏心温泉蛋', category: 'food', tier: FOOD_TIERS.RARE, price: 45, effects: { satiety: 20, mood: 20 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/SEsl/800X756/food_%2812%29.png/webp' },
  { id: 'food-mint-lemon-tart', name: '薄荷柠檬挞', category: 'food', tier: FOOD_TIERS.RARE, price: 38, effects: { mood: 25 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/Tbcy/841X1036/food_%2813%29.png/webp' },
  { id: 'food-matcha-millefeuille', name: '抹茶千层', category: 'food', tier: FOOD_TIERS.RARE, price: 42, effects: { satiety: 30, mood: 25 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/sPsK/817X745/food_%2814%29.png/webp' },
  { id: 'food-cheese-sweet-potato', name: '芝士焗红薯', category: 'food', tier: FOOD_TIERS.RARE, price: 48, effects: { satiety: 40, mood: 20 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/I6Za/838X735/food_%2815%29.png/webp' },
  { id: 'food-strawberry-daifuku', name: '草莓大福', category: 'food', tier: FOOD_TIERS.RARE, price: 40, effects: { satiety: 15, mood: 35 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/gJ4G/844X803/food_%2816%29.png/webp' },
  { id: 'food-rose-pudding', name: '玫瑰奶冻', category: 'food', tier: FOOD_TIERS.RARE, price: 50, effects: { mood: 40 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/zfZT/1626X1283/food_%286%29.png/webp' },
  { id: 'food-honey-black-tea-cake', name: '蜂蜜红茶蛋糕', category: 'food', tier: FOOD_TIERS.RARE, price: 40, effects: { satiety: 25, mood: 20 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/sKcZ/1280X1280/1_%282%29.png/webp' },
  { id: 'food-peach-blossom-cake', name: '蜜桃樱花糕', category: 'food', tier: FOOD_TIERS.RARE, price: 45, effects: { mood: 35 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/p4Lr/1499X1237/2026-10-06_154036.png/webp' },
  { id: 'food-earl-grey-pudding', name: '伯爵红茶布丁', category: 'food', tier: FOOD_TIERS.RARE, price: 38, effects: { satiety: 15, mood: 22 }, url: '' },
  { id: 'food-mango-sticky-rice', name: '芒果糯米饭', category: 'food', tier: FOOD_TIERS.RARE, price: 44, effects: { satiety: 35, mood: 15 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/0S0L/1872X1411/2026-10-06_154004.png/webp' },

  // ---- 传说（只能靠事件获得，不能用心心买）----
  { id: 'food-starry-jelly', name: '星空果冻', category: 'food', tier: FOOD_TIERS.LEGENDARY, price: 0, effects: { satiety: 40, mood: 40 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/IhXA/923X1103/food_%2818%29.png/webp' },
  { id: 'food-golden-chestnut-rice', name: '黄金栗子饭', category: 'food', tier: FOOD_TIERS.LEGENDARY, price: 0, effects: { satiety: 100 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/yiGN/782X792/food_%281%29.png/webp' },
  { id: 'food-dream-macaron', name: '梦境马卡龙', category: 'food', tier: FOOD_TIERS.LEGENDARY, price: 0, effects: { mood: 100 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/7UFe/678X934/food_%2819%29.png/webp' },
  { id: 'food-shooting-star-candy', name: '流星糖葫芦', category: 'food', tier: FOOD_TIERS.LEGENDARY, price: 0, effects: { satiety: 30, mood: 30 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/U6rw/681X1175/food_%2820%29.png/webp' },
  { id: 'food-first-snow-matcha-roll', name: '初雪抹茶卷', category: 'food', tier: FOOD_TIERS.LEGENDARY, price: 0, effects: { mood: 50 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/Wt4r/900X938/food_%2821%29.png/webp' },
  { id: 'food-rainbow-honey-cake', name: '彩虹蜂蜜蛋糕', category: 'food', tier: FOOD_TIERS.LEGENDARY, price: 0, effects: { satiety: 30, mood: 30 }, grantHearts: 20, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/BiQ0/889X986/food_%2822%29.png/webp' },
  { id: 'food-time-cream-pudding', name: '时光奶油冻', category: 'food', tier: FOOD_TIERS.LEGENDARY, price: 0, effects: { satiety: 50, mood: 50 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/1tRj/1395X1567/2026-10-06_154020.png/webp' },
  { id: 'food-lucky-cookie', name: '幸运饼干', category: 'food', tier: FOOD_TIERS.LEGENDARY, price: 0, effects: { mood: 15 }, triggersRandomEvent: true, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/xdZZ/986X687/food_%2824%29.png/webp' },
  { id: 'food-moonlight-pudding', name: '月光布丁', category: 'food', tier: FOOD_TIERS.LEGENDARY, price: 0, effects: { satiety: 20, mood: 45 }, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/nCe5/1778X1712/2026-10-06_153927.png/webp' },
  { id: 'food-anniversary-tart', name: '周年纪念挞', category: 'food', tier: FOOD_TIERS.LEGENDARY, price: 0, effects: { satiety: 40, mood: 40 }, grantHearts: 15, url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/c7zH/1297X1254/2026-10-06_153945.png/webp' },
];



/*
 * 衣服：纯文字，买下后永久拥有，可在"穿着"里选择要不要穿上；
 * 不做换装视觉，宠物形象图本身不会因为穿了什么而改变。
 */
export const SHOP_CLOTHING_ITEMS = [
  { id: 'outfit-sweater', name: '藏青色小毛衣', category: 'clothing', price: 25 },
  { id: 'outfit-scarf', name: '格纹小围巾', category: 'clothing', price: 18 },
  { id: 'outfit-bowtie', name: '绅士领结', category: 'clothing', price: 15 },
  { id: 'outfit-cap', name: '毛线小帽', category: 'clothing', price: 15 },
];

/*
 * 分级规则跟 FOOD_TIERS 完全一致：
 *   - common：心心直接买，买 = 放进背包，之后点击使用。
 *   - rare：心心买，但要先在 companion.unlockedRareCleanIds /
 *     unlockedRareToyIds 里解锁才能买。
 * 道具不做 legendary 档——目前没有对应的事件设计，先不加。
 *
 * 清洁道具 effects.cleanliness 是使用时的即时加成；
 * 玩具 effects.mood 是使用时的即时加成，同时跟免费玩耍一样会扣
 * 清洁度（固定 -5，走 companionBackpackService.js 里的统一逻辑，
 * 不需要每个玩具自己写一遍）。
 *
 * useLine：每个道具自己专属的"使用后"气泡文案，不传就在
 * companionBackpackService.js 里退回通用兜底文案。
 */
export const SHOP_CLEAN_ITEMS = [
  { 
    id: 'clean-bubble-soap', 
    name: '泡泡沐浴液', 
    category: 'clean', 
    tier: FOOD_TIERS.COMMON, 
    price: 10, 
    effects: { cleanliness: 35 }, 
    useLine: '洗得干干净净，闻起来泡泡香香的。', 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261009/SR9Q/1173X1903/daoju_%284%29.jpg/webp' 
  },
  { 
    id: 'clean-soft-towel', 
    name: '柔软小毛巾', 
    category: 'clean', 
    tier: FOOD_TIERS.COMMON, 
    price: 8, 
    effects: { cleanliness: 25 }, 
    useLine: '被轻轻擦干了，舒服地眯起眼睛。', 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261009/gq7K/1642X1521/daoju_%285%29.jpg/webp' 
  },
  { 
    id: 'clean-mint-spray', 
    name: '薄荷清新喷雾', 
    category: 'clean', 
    tier: FOOD_TIERS.RARE, 
    price: 30, 
    effects: { cleanliness: 50, mood: 10 }, 
    useLine: '喷上去凉凉的，整只都清爽了起来。', 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261009/6lVa/765X1816/daoju_%283%29.jpg/webp' 
  },
  { 
    id: 'clean-golden-comb', 
    name: '黄金顺毛梳', 
    category: 'clean', 
    tier: FOOD_TIERS.RARE, 
    price: 35, 
    effects: { cleanliness: 45, mood: 15 }, 
    useLine: '梳理得毛发顺顺的，自己还蹭了蹭梳子。', 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261009/ksx5/1371X1841/daoju_%282%29.jpg/webp' 
  },
];

export const SHOP_TOY_ITEMS = [
  { 
    id: 'toy-yarn-ball', 
    name: '毛线球', 
    category: 'toy', 
    tier: FOOD_TIERS.COMMON, 
    price: 10, 
    effects: { mood: 15 }, 
    useLine: '追着毛线球滚来滚去，怎么都玩不腻。', 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261009/emVL/1978X1938/daoju_%288%29.jpg/webp' 
  },
  { 
    id: 'toy-feather-stick', 
    name: '逗逗羽毛棒', 
    category: 'toy', 
    tier: FOOD_TIERS.COMMON, 
    price: 9, 
    effects: { mood: 12 }, 
    useLine: '扑来扑去地追着羽毛棒，兴奋得不行。', 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261009/CR1R/1919X2009/daoju_%287%29.jpg/webp' 
  },
  { 
    id: 'toy-squeaky-mouse', 
    name: '会叫的小老鼠', 
    category: 'toy', 
    tier: FOOD_TIERS.RARE, 
    price: 32, 
    effects: { mood: 30 }, 
    useLine: '咬一下就会叫，吓了自己一跳，接着又继续咬。', 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261009/WFq9/1812X1772/daoju_%281%29.jpg/webp' 
  },
  { 
    id: 'toy-puzzle-box', 
    name: '益智解谜盒', 
    category: 'toy', 
    tier: FOOD_TIERS.RARE, 
    price: 38, 
    effects: { mood: 35 }, 
    useLine: '琢磨了好一会儿才打开，开心得直转圈。', 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261009/m3Ma/1912X1970/daoju_%286%29.jpg/webp' 
  },
];

export const findShopItem = (itemId) => (
  SHOP_FOOD_ITEMS.find((item) => item.id === itemId)
  || SHOP_CLOTHING_ITEMS.find((item) => item.id === itemId)
  || SHOP_SCENE_ITEMS.find((item) => item.id === itemId)
  || SHOP_CLEAN_ITEMS.find((item) => item.id === itemId)
  || SHOP_TOY_ITEMS.find((item) => item.id === itemId)
  || null
);

// ---- 场景背景 ----

const placeholderSceneSvg = (from, to, label) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${from}" />
          <stop offset="100%" stop-color="${to}" />
        </linearGradient>
      </defs>
      <rect width="400" height="600" fill="url(#g)" />
      <circle cx="320" cy="90" r="46" fill="#ffffff" opacity="0.18" />
      <circle cx="60" cy="480" r="70" fill="#ffffff" opacity="0.12" />
      <text x="200" y="300" font-family="sans-serif" font-size="22" fill="#ffffff" opacity="0.55" text-anchor="middle">${label}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// 免费场景：领养之后就可以直接四选一，不需要解锁/购买。
export const COMPANION_SCENES = [
  { 
    id: 'scene-a', 
    label: '场景 A', 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/rwkG/960X1280/beij_%288%29.png/webp' 
  },
  { 
    id: 'scene-b', 
    label: '场景 B', 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/xXZu/960X1280/beij_%287%29.png/webp' 
  },
  { 
    id: 'scene-c', 
    label: '场景 C', 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/w3tg/960X1280/beij_%286%29.png/webp' 
  },
  { 
    id: 'scene-d', 
    label: '场景 D', 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/3ZRt/960X1280/beij_%2815%29.png/webp' 
  },
];

/*
 * 付费场景：用心心解锁（买一次，永久拥有），解锁状态存在
 * companionInventory 里（category:'scene'），跟衣服走同一张表、
 * 同一套"买过就不用再买"判断逻辑。
 */
export const SHOP_SCENE_ITEMS = [
  { 
    id: 'scene-e', 
    label: '场景 E', 
    category: 'scene', 
    price: 30, 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/2Ebq/960X1280/beij_%284%29.png/webp' 
  },
  { 
    id: 'scene-f', 
    label: '场景 F', 
    category: 'scene', 
    price: 35, 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/HQts/960X1280/beij_%283%29.png/webp' 
  },
  { 
    id: 'scene-g', 
    label: '场景 G', 
    category: 'scene', 
    price: 35, 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/nded/960X1280/beij_%282%29.png/webp' 
  },
  { 
    id: 'scene-h', 
    label: '场景 H', 
    category: 'scene', 
    price: 40, 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/4kfB/960X1280/beij_%2814%29.png/webp' 
  },
  { 
    id: 'scene-i', 
    label: '场景 I', 
    category: 'scene', 
    price: 40, 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/Zztv/960X1280/beij_%2813%29.png/webp' 
  },
  { 
    id: 'scene-j', 
    label: '场景 J', 
    category: 'scene', 
    price: 45, 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/GPuz/960X1280/beij_%2812%29.png/webp' 
  },
  { 
    id: 'scene-k', 
    label: '场景 K', 
    category: 'scene', 
    price: 45, 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/3w94/960X1280/beij_%2811%29.png/webp' 
  },
  { 
    id: 'scene-l', 
    label: '场景 L', 
    category: 'scene', 
    price: 50, 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/MIQ9/960X1280/beij_%289%29.png/webp' 
  },
  { 
    id: 'scene-m', 
    label: '场景 M', 
    category: 'scene', 
    price: 50, 
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/G1CS/960X1280/beij_%2810%29.png/webp' 
  },
];


/* ------------------------------------------------------------------ */
/* 道具区：火花冻结卡                                                       */
/* ------------------------------------------------------------------ */

/**
 * 冻结卡：5 心心一张，用于保住连续打卡 streak 一天不衰减。
 * category: 'freeze-card'，购买不走 buyShopItem，
 * 而是走 streakService.buyFreezeCard(chatId, companionId)。
 */
export const SHOP_TOOL_ITEMS = [
  {
    id: 'tool-freeze-card',
    name: '火花冻结卡',
    category: 'freeze-card',
    price: 5,
    description: '用一张就能让火花连续天数暂停衰减一天，就算忘了聊天也不怕断签。',
    url: 'https://img.pagehost.cn/autoupload/amqnh/20261006/OdQ2/960X1280/80dd4e87cba0456798efe0375454695c.png/webp',
  },
];

export const findScene = (sceneId) => (
  COMPANION_SCENES.find((scene) => scene.id === sceneId)
  || SHOP_SCENE_ITEMS.find((scene) => scene.id === sceneId)
  || null
);

// 场景选择弹窗要同时展示"免费的 + 已解锁的付费的 + 还没解锁的（显示价格）"，
// 这个函数不做解锁过滤，纯粹把两份列表按展示用的形状合并，解锁判断交给
// 调用方（CompanionSceneModal 拿着 ownedSceneIds 自己过滤）。
export const getAllSceneOptions = () => ([
  ...COMPANION_SCENES.map((scene) => ({ ...scene, free: true, price: 0 })),
  ...SHOP_SCENE_ITEMS.map((scene) => ({ ...scene, free: false })),
]);