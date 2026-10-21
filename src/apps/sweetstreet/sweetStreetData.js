/*
 * sweetStreetData.js —— 「甜品小街」的静态配置。
 *
 * 图片 url 都集中放在这个文件里：
 *   - SWEET_STREET_IMAGES：整条街的通用图片
 *   - SWEET_SHOPS 里每家店自己的 imageUrl / signUrl
 * url 留空 ('') 时，页面会自动用内置的小图形兜底，不会出现裂图。
 * 想换图只改这里的字符串，别的文件不用动。
 *
 * 下面所有数值（时长档位、心心、星级系数、每日上限）都是占位值，
 * 之后实玩再调，调的时候只改这个文件。
 */

export const SWEET_STREET_IMAGES = {
  // 整页背景图（留空则用页面自带的粉色渐变）
  background: 'https://img.pagehost.cn/autoupload/amqnh/20261021/06cq/1056X1408/gi2-e1792542172.png/webp',
  // 页面顶部「甜品小街」标题处的招牌图（留空则用文字标题）
  streetSign: '',
  // 打工小日志为空时的小插图（留空则不显示插图）
    emptyLogIllustration: '',
  // 前台背景（竖版，只有店内墙、门、窗、桌椅，不含柜台和人）
  frontBackground: 'https://img.pagehost.cn/autoupload/amqnh/20261021/dW3N/1086X1448/gi2-e1792544131.png/webp',
  // 前台柜台前景（透明 PNG，盖在画面下半部分，中间留位置给平板）
  frontCounter: '',
  // 后厨背景（竖版）
  kitchenBackground: 'https://img.pagehost.cn/autoupload/amqnh/20261021/VfWz/1086X1448/gi2-e1792553513.png/webp',
  // 烤箱（透明 PNG，正面，门是半透明玻璃窗）
  oven: '',
  // 奶油挤袋（透明 PNG）
  pipingBag: '',
};

/*
 * 店铺列表。status：
 *   'open' 营业中，可以进入
 *   'soon' 筹备中，只占位
 * 以后加奶茶店开业，只需要把它的 status 改成 'open'，并补上玩法。
 */
export const SWEET_SHOPS = [
  {
    id: 'cake',
    name: '小蛋糕店',
    tagline: '选料、烘焙、装饰、出餐，做出好吃的小蛋糕',
    status: 'open',
    // 卡片左侧的圆形插图（留空则用内置纸杯蛋糕图形）
    imageUrl: '',
    // 卡片顶部的店招图（留空则用粉白遮阳棚）
    signUrl: '',
  },
  {
    id: 'milktea',
    name: '奶茶店',
    tagline: '以后会和蛋糕店连在一起玩，先留个位置',
    status: 'soon',
    imageUrl: '',
    signUrl: '',
  },
];

/*
 * 主动玩法用到的图片，key 是 sweetPlayData.js 里对应的 id。
 * 留空 ('') 时用内置图形兜底。
 */

// 蛋糕本体：涂好奶油、顶部留空、不画装饰（装饰由代码按订单叠上去）
export const SWEET_CAKE_IMAGES = {
  strawberry: 'https://img.pagehost.cn/autoupload/amqnh/20261021/15nr/1657X1810/cai_%281%29.jpg/webp',
  matcha: 'https://img.pagehost.cn/autoupload/amqnh/20261021/6X5E/1863X1999/cai_%2819%29.jpg/webp',
  lemon: 'https://img.pagehost.cn/autoupload/amqnh/20261021/15nr/1657X1810/cai_%281%29.jpg/webp',
  choco: 'https://img.pagehost.cn/autoupload/amqnh/20261021/QU7N/1765X1826/cai_%2817%29.jpg/webp',
  blueberry: 'https://img.pagehost.cn/autoupload/amqnh/20261021/15nr/1657X1810/cai_%281%29.jpg/webp',
};

// 材料图标
export const SWEET_INGREDIENT_IMAGES = {
  flour: 'https://img.pagehost.cn/autoupload/amqnh/20261021/77WB/1729X1998/cai_%286%29.jpg/webp',
  egg: 'https://img.pagehost.cn/autoupload/amqnh/20261021/h7F4/1625X2049/cai_%287%29.jpg/webp',
  milk: 'https://img.pagehost.cn/autoupload/amqnh/20261021/PicG/1539X2049/cai_%284%29.jpg/webp',
  strawberryJam: 'https://img.pagehost.cn/autoupload/amqnh/20261021/57gf/1477X1764/cai_%285%29.jpg/webp',
  matchaPowder: 'https://img.pagehost.cn/autoupload/amqnh/20261021/n6GE/1852X1986/cai_%283%29.jpg/webp',
  redBean: 'https://img.pagehost.cn/autoupload/amqnh/20261021/6PRT/1623X1522/cai_%282%29.jpg/webp',
  lemon: 'https://img.pagehost.cn/autoupload/amqnh/20261021/NZOs/2049X2043/cai_%2814%29.jpg/webp',
  honey: 'https://img.pagehost.cn/autoupload/amqnh/20261021/Rf5R/2048X1740/cai_%2812%29.jpg/webp',
  cocoa: 'https://img.pagehost.cn/autoupload/amqnh/20261021/3i3z/1941X1704/cai_%2811%29.jpg/webp',
  hazelnut: 'https://img.pagehost.cn/autoupload/amqnh/20261021/Imy8/2046X1603/cai_%2810%29.jpg/webp',
  cookieBase: 'https://img.pagehost.cn/autoupload/amqnh/20261021/mxUf/2046X1580/cai_%289%29.jpg/webp',
  creamCheese: 'https://img.pagehost.cn/autoupload/amqnh/20261021/8VW6/1955X1647/shi_%282%29.jpg/webp',
  sugar: 'https://img.pagehost.cn/autoupload/amqnh/20261021/6tQW/1770X2049/shi_%281%29.jpg/webp',
  blueberry: 'https://img.pagehost.cn/autoupload/amqnh/20261021/pKit/1868X1581/cai_%288%29.jpg/webp',
};

// 装饰图标
export const SWEET_DECO_IMAGES = {
  strawberry: '',
  sprinkles: '',
  redBean: '',
  mintLeaf: '',
  lemonSlice: '',
  honeyDrop: '',
  chocoChip: '',
  hazelnutCrumb: '',
  blueberry: '',
  powderedSugar: '',
};

// 顾客贴图：每位顾客三个表情，缺哪个就自动退回 normal，都没有就用内置小人
export const SWEET_CUSTOMER_IMAGES = {
  customer1: { normal: 'https://img.pagehost.cn/autoupload/amqnh/20261021/MSyG/1254X1254/gi2-e1792566489.png/webp', happy: '', sad: '' },
  customer2: { normal: 'https://img.pagehost.cn/autoupload/amqnh/20261021/TPS2/1254X1254/gi2-e1792567118.png/webp', happy: '', sad: '' },
  customer3: { normal: 'https://img.pagehost.cn/autoupload/amqnh/20261021/X3ak/1254X1254/gi2-e1792567480.png/webp', happy: '', sad: '' },
  customer4: { normal: 'https://img.pagehost.cn/autoupload/amqnh/20261021/XDmE/1024X1024/gi2-e1792589423.png/webp', happy: '', sad: '' },
};

export const SHOP_STAR_MIN = 1;
export const SHOP_STAR_MAX = 5;

// 每家店刚开业的初始状态
export const DEFAULT_SHOP_STATE = {
  star: 1,
  exp: 0,
};

// ---- 挂机打工（占位值） ----
export const WORK_TIERS = [
  { id: 'h1', hours: 1, baseHearts: 3 },
  { id: 'h4', hours: 4, baseHearts: 14 },
  { id: 'h8', hours: 8, baseHearts: 32 },
];

// 打工每日心心上限（只限打工，主动玩不限）
export const WORK_DAILY_HEART_CAP = 60;

// 店铺每升一星，打工和主动玩的心心加成（占位：每星 +10%）
export const STAR_HEART_BONUS_PER_STAR = 0.1;