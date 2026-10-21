/*
 * sweetPlayData.js —— 「小蛋糕店」主动玩法的规则数据（第二片，纯数据，没有逻辑）。
 *
 * 一局的流程：
 *   前台（顾客进店、说想要什么）-> 点单（在平板上选蛋糕和装饰顺序）
 *   -> 后厨五步里的四步（选料、烘焙、打奶油、装饰）-> 回前台出餐（顾客给 1~3 颗星）
 *
 * 所有数值都是占位值，实玩后再调。调数值只改这个文件和 sweetStreetData.js。
 * 图片 url 不放在这里，统一在 sweetStreetData.js 的几张图片表里（留空用内置图形兜底），
 * 这里只放 id 和兜底颜色。
 */

import {
  SWEET_CAKE_IMAGES,
  SWEET_INGREDIENT_IMAGES,
  SWEET_DECO_IMAGES,
  SWEET_CUSTOMER_IMAGES,
} from './sweetStreetData';

// ---------------------------------------------------------------
// 一局的节奏
// ---------------------------------------------------------------

// 一局总时长（秒）
export const RUN_DURATION_SEC = 180;
// 开局后第一位顾客多久进店
export const FIRST_CUSTOMER_DELAY_SEC = 2;
// 柜台前有空位后，下一位顾客多久进来
export const CUSTOMER_REFILL_GAP_SEC = 3;
// 最后这么多秒不再来新顾客
export const RUN_SPAWN_CUTOFF_SEC = 20;

// 按店铺星级：同屏顾客数、每位顾客的耐心（秒）。星级越高客人越多、越没耐心。
export const SHOP_STAR_RULES = {
  1: { maxCustomers: 2, patienceSec: 100 },
  2: { maxCustomers: 3, patienceSec: 90 },
  3: { maxCustomers: 3, patienceSec: 80 },
  4: { maxCustomers: 4, patienceSec: 70 },
  5: { maxCustomers: 4, patienceSec: 60 },
};

// ---------------------------------------------------------------
// 判定
// ---------------------------------------------------------------

// 选料、装饰这类「按顺序点」的步骤：点错一次直接失误；一次没错时，
// 在这个秒数内完成算完美，慢了算普通。
export const SEQUENCE_STEP_FAST_SEC = {
  ingredients: 8,
  decoration: 6,
};

// 每步三档的得分，四步加起来得到这块蛋糕的分数（0~8）
export const GRADE_POINTS = { perfect: 2, normal: 1, miss: 0 };

// 蛋糕分数 -> 顾客星数（从上往下匹配第一个满足的）
export const CAKE_STAR_BY_POINTS = [
  { minPoints: 7, stars: 3 },
  { minPoints: 4, stars: 2 },
  { minPoints: 0, stars: 1 },
];

// 点单点错时星数的上限：
//   ok         点对了，不限制
//   wrongDeco  装饰顺序点错了，最多 2 星
//   wrongCake  蛋糕点错了（做出来的不是顾客想要的），最多 1 星
export const TICKET_STAR_CAP = { ok: 3, wrongDeco: 2, wrongCake: 1 };

// 上菜时顾客剩余耐心低于这个比例，星数减 1（最低保留 1 星）
export const LOW_PATIENCE_RATIO = 0.2;

// ---------------------------------------------------------------
// 奖励（心心沿用小伙伴自己的 companion.hearts）
// ---------------------------------------------------------------

// 一位顾客给几颗星，这块蛋糕出几颗心心
export const HEARTS_PER_CUSTOMER_STAR = { 1: 1, 2: 2, 3: 3 };
// 一位顾客给几颗星，店铺得多少经验
export const EXP_PER_CUSTOMER_STAR = { 1: 10, 2: 20, 3: 30 };

// 连击奖励：一局里打出的最高连击，每 everyCombo 连击加 heartsPerStep 颗心心，最多 maxHearts
export const COMBO_BONUS = { everyCombo: 4, heartsPerStep: 1, maxHearts: 5 };

// 整局全满意奖励：接待至少 minServed 位、没有顾客走掉、且每位都是 3 星
export const ALL_HAPPY_BONUS = { minServed: 2, hearts: 3, exp: 10 };

// ---------------------------------------------------------------
// 升级店面（花心心手动升星）
// 条件：累计经验 >= expNeeded，并且心心 >= heartCost。经验是累计值，升星后不清零。
// ---------------------------------------------------------------
export const SHOP_UPGRADES = [
  { fromStar: 1, expNeeded: 100, heartCost: 80 },
  { fromStar: 2, expNeeded: 300, heartCost: 160 },
  { fromStar: 3, expNeeded: 600, heartCost: 300 },
  { fromStar: 4, expNeeded: 1000, heartCost: 500 },
];

// ---------------------------------------------------------------
// 材料和装饰（id、名字、兜底颜色）
// ---------------------------------------------------------------

export const SWEET_INGREDIENTS = {
  flour: { id: 'flour', name: '面粉', color: '#FFF3D6' },
  egg: { id: 'egg', name: '鸡蛋', color: '#FFE7B0' },
  milk: { id: 'milk', name: '牛奶', color: '#F4F9FF' },
  strawberryJam: { id: 'strawberryJam', name: '草莓酱', color: '#E94F6F' },
  matchaPowder: { id: 'matchaPowder', name: '抹茶粉', color: '#9CCB7A' },
  redBean: { id: 'redBean', name: '红豆', color: '#9B3B4A' },
  lemon: { id: 'lemon', name: '柠檬', color: '#F7D84A' },
  honey: { id: 'honey', name: '蜂蜜', color: '#E6A23C' },
  cocoa: { id: 'cocoa', name: '可可粉', color: '#7A4A3A' },
  hazelnut: { id: 'hazelnut', name: '榛果', color: '#C99A6B' },
  cookieBase: { id: 'cookieBase', name: '饼干底', color: '#D9A86C' },
  creamCheese: { id: 'creamCheese', name: '奶油奶酪', color: '#FFF1D0' },
  sugar: { id: 'sugar', name: '糖', color: '#FFFFFF' },
  blueberry: { id: 'blueberry', name: '蓝莓', color: '#5B6FD6' },
};

export const SWEET_DECORATIONS = {
  strawberry: { id: 'strawberry', name: '草莓', color: '#E94F6F' },
  sprinkles: { id: 'sprinkles', name: '糖珠', color: '#FFC857' },
  redBean: { id: 'redBean', name: '红豆', color: '#9B3B4A' },
  mintLeaf: { id: 'mintLeaf', name: '薄荷叶', color: '#6DBE8D' },
  lemonSlice: { id: 'lemonSlice', name: '柠檬片', color: '#F7D84A' },
  honeyDrop: { id: 'honeyDrop', name: '蜂蜜滴', color: '#E6A23C' },
  chocoChip: { id: 'chocoChip', name: '巧克力片', color: '#7A4A3A' },
  hazelnutCrumb: { id: 'hazelnutCrumb', name: '榛果碎', color: '#C99A6B' },
  blueberry: { id: 'blueberry', name: '蓝莓', color: '#5B6FD6' },
  powderedSugar: { id: 'powderedSugar', name: '糖粉', color: '#FFFFFF' },
};

// ---------------------------------------------------------------
// 招牌蛋糕（订单就是从这里挑）
//   ingredients   选料步骤要按这个顺序点
//   decorations   顾客会按这个顺序说出装饰，装饰步骤也按这个顺序点
//   decoSlots     装饰叠在蛋糕图上的位置（占蛋糕图宽高的百分比，和 decorations 一一对应）
//   bake          烘焙：进度条每秒走 speed（0~1），指针停在 perfect 区间算完美，
//                 停在 ok 区间算普通，其余算失误；走到头 1 还没停算失误（烤焦）
//   cream         打奶油：按住时每秒灌 fillPerSec（0~1），松手时的位置同上判定
//   fallback      没有蛋糕图时的内置图形颜色
// 以后加新配方，往这个数组末尾添一项就行；加奶茶店时订单会做成「物品列表」，
// 蛋糕只是其中一种，这里的结构可以直接复用。
// ---------------------------------------------------------------
export const SWEET_RECIPES = [
  {
    id: 'strawberry',
    name: '草莓奶油蛋糕',
    unlockStar: 1,
    ingredients: ['flour', 'egg', 'milk', 'strawberryJam'],
    decorations: ['strawberry', 'sprinkles'],
    decoSlots: [{ x: 50, y: 24 }, { x: 30, y: 38 }],
    bake: { speed: 0.35, perfect: [0.7, 0.85], ok: [0.58, 0.92] },
    cream: { fillPerSec: 0.5, perfect: [0.7, 0.86], ok: [0.56, 0.96] },
    fallback: { body: '#FBD9A6', cream: '#FFFFFF', accent: '#E94F6F' },
  },
  {
    id: 'matcha',
    name: '抹茶红豆卷',
    unlockStar: 1,
    ingredients: ['flour', 'egg', 'matchaPowder', 'redBean'],
    decorations: ['redBean', 'mintLeaf'],
    decoSlots: [{ x: 50, y: 24 }, { x: 68, y: 38 }],
    bake: { speed: 0.4, perfect: [0.72, 0.86], ok: [0.6, 0.92] },
    cream: { fillPerSec: 0.5, perfect: [0.7, 0.85], ok: [0.56, 0.95] },
    fallback: { body: '#B9DDA0', cream: '#FFFFFF', accent: '#9B3B4A' },
  },
  {
    id: 'lemon',
    name: '柠檬蜂蜜蛋糕',
    unlockStar: 1,
    ingredients: ['flour', 'egg', 'lemon', 'honey'],
    decorations: ['lemonSlice', 'honeyDrop'],
    decoSlots: [{ x: 50, y: 24 }, { x: 36, y: 40 }],
    bake: { speed: 0.4, perfect: [0.7, 0.84], ok: [0.58, 0.91] },
    cream: { fillPerSec: 0.55, perfect: [0.72, 0.86], ok: [0.58, 0.95] },
    fallback: { body: '#FFE59A', cream: '#FFFFFF', accent: '#F7D84A' },
  },
  {
    id: 'choco',
    name: '巧克力榛果蛋糕',
    unlockStar: 2,
    ingredients: ['flour', 'egg', 'cocoa', 'hazelnut'],
    decorations: ['chocoChip', 'hazelnutCrumb'],
    decoSlots: [{ x: 50, y: 24 }, { x: 66, y: 40 }],
    bake: { speed: 0.45, perfect: [0.72, 0.84], ok: [0.6, 0.9] },
    cream: { fillPerSec: 0.55, perfect: [0.72, 0.85], ok: [0.58, 0.94] },
    fallback: { body: '#7A4A3A', cream: '#F0D8C8', accent: '#C99A6B' },
  },
  {
    id: 'blueberry',
    name: '蓝莓芝士蛋糕',
    unlockStar: 2,
    ingredients: ['cookieBase', 'creamCheese', 'sugar', 'blueberry'],
    decorations: ['blueberry', 'powderedSugar'],
    decoSlots: [{ x: 50, y: 24 }, { x: 32, y: 40 }],
    bake: { speed: 0.45, perfect: [0.72, 0.85], ok: [0.6, 0.9] },
    cream: { fillPerSec: 0.55, perfect: [0.72, 0.85], ok: [0.58, 0.94] },
    fallback: { body: '#FFF1D0', cream: '#FFFFFF', accent: '#5B6FD6' },
  },
];

// 订单说话的模板池，{cake} 是蛋糕名，{decos} 是按顺序说出的装饰。
// 你可以随时往里添模板，不用改别的文件。
export const SWEET_ORDER_LINE_TEMPLATES = [
  '我想要一块{cake}，{decos}。',
  '来一份{cake}吧，{decos}。',
  '麻烦做一块{cake}，{decos}，谢谢。',
  '今天想吃{cake}，{decos}。',
];

// ---------------------------------------------------------------
// 顾客（可以整套换成贴图）
//   图片在 sweetStreetData.js 的 SWEET_CUSTOMER_IMAGES[id] = { normal, happy, sad }
//   没有图时用 fallback 的颜色画一个简单的小人
// ---------------------------------------------------------------
export const SWEET_CUSTOMERS = [
  { id: 'customer1', name: '客人一', fallback: { skin: '#FFD9A8', hair: '#8B5E4A', shirt: '#9CC8F0' } },
  { id: 'customer2', name: '客人二', fallback: { skin: '#FFE0C2', hair: '#5B3A44', shirt: '#F7B6C8' } },
  { id: 'customer3', name: '客人三', fallback: { skin: '#F3C9A0', hair: '#C9893A', shirt: '#B9DDA0' } },
  { id: 'customer4', name: '客人四', fallback: { skin: '#FFD3B8', hair: '#3E2C3A', shirt: '#CDB4F0' } },
];

// ---------------------------------------------------------------
// 取图小工具：返回 url 字符串，没填就返回空串（页面见到空串就用兜底图形）
// ---------------------------------------------------------------
export const getCakeImage = (recipeId) => SWEET_CAKE_IMAGES[recipeId] || '';
export const getIngredientImage = (ingredientId) => SWEET_INGREDIENT_IMAGES[ingredientId] || '';
export const getDecoImage = (decoId) => SWEET_DECO_IMAGES[decoId] || '';
// mood：'normal' | 'happy' | 'sad'；这一款的这个表情没图时退回 normal，再没有就返回空串
export const getCustomerImage = (customerId, mood = 'normal') => {
  const set = SWEET_CUSTOMER_IMAGES[customerId];
  if (!set) return '';
  return set[mood] || set.normal || '';
};