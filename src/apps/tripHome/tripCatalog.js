// src/apps/tripHome/tripCatalog.js
//
// 「旅行小屋」的静态目录：动物预设、物品、目的地、签到奖励，以及几个
// 不碰数据库的纯函数（行程预告 planTrip、默认动物挑选）。
//
// 这个文件是给用户自己手动编辑的：
// - 所有 imageUrl 字段先留空。填上图片链接后界面会自动改用图片，留空或
//   链接失效时自动退回内置的占位图（动物剪影 / 分类图标），不会报错。
//   有些图床会拦截别的网站直接引用图片，填完链接后建议先确认能正常显示。
// - 加新物品/新目的地只需要在对应数组里追加一项，别的文件不用改。
//   特殊食品通过 destinationId 指向某个目的地，带上它才能去那里。
//
// 旅行小屋跟旧的「旅行」应用（src/apps/travels/）完全独立，互不引用。

export const TRIP_SLOTS = ['food', 'prop', 'gift'];

export const TRIP_SLOT_LABELS = {
  food: '食物',
  prop: '道具',
  gift: '小礼物',
};

// 连续签到 7 天一个循环，第 7 天奖励最多，之后从第 1 天重新开始。
export const TRIP_CHECKIN_REWARDS = [10, 10, 15, 15, 20, 20, 40];

// 没带食物时的默认行程时长（小时）。
export const TRIP_DEFAULT_HOURS = [3, 8];

// 动物预设。imageUrl 填了就用图片，没填用内置剪影（color 是剪影的主色）。
export const TRIP_ANIMALS = [
  { id: 'cat', name: '猫', color: '#f2b36e', imageUrl: '' },
  { id: 'bunny', name: '兔', color: '#fbe3ec', imageUrl: '' },
  { id: 'bear', name: '熊', color: '#b98a66', imageUrl: '' },
  { id: 'fox', name: '狐狸', color: '#f08a4b', imageUrl: '' },
  { id: 'frog', name: '青蛙', color: '#9ed7a3', imageUrl: '' },
];

// 目的地。special 为 true 的只有带对应特殊食品才能去；为 false 的是
// 没带特殊食品时随机抽的普通目的地。transport 决定车票是火车票还是机票。
export const TRIP_DESTINATIONS = [
  { id: 'park', name: '近郊公园', code: 'PRK', transport: 'train', special: false, sceneImageUrl: '' },
  { id: 'riverside', name: '河边小镇', code: 'RVR', transport: 'train', special: false, sceneImageUrl: '' },
  { id: 'snow-lake', name: '雪镇 · 浮冰湖畔', code: 'SNW', transport: 'train', special: true, sceneImageUrl: '' },
  { id: 'lighthouse', name: '海边灯塔', code: 'LTH', transport: 'plane', special: true, sceneImageUrl: '' },
  { id: 'chestnut-forest', name: '山间栗子林', code: 'CHN', transport: 'train', special: true, sceneImageUrl: '' },
  { id: 'rainy-konbini', name: '雨夜便利店', code: 'KNB', transport: 'plane', special: true, sceneImageUrl: '' },
];

// 物品。cat 对应行李的三个格子（food / prop / gift）。
// food 有 hours（行程时长范围，小时）；特殊食品另有 destinationId。
// prop / gift 的 effectKey 留给后面的旅行结算逻辑使用。
export const TRIP_ITEMS = [
  { id: 'rice', cat: 'food', name: '干粮饭团', price: 10, desc: '最长 16 小时，在附近转转', hours: [3, 16], imageUrl: '' },
  { id: 'cocoa', cat: 'food', name: '热可可', price: 45, desc: '能走很远，最长 48 小时', hours: [12, 48], destinationId: 'snow-lake', imageUrl: '' },
  { id: 'soda', cat: 'food', name: '椰子汽水', price: 45, desc: '能走很远，最长 48 小时', hours: [12, 48], destinationId: 'lighthouse', imageUrl: '' },
  { id: 'chestnut', cat: 'food', name: '烤栗子', price: 45, desc: '能走很远，最长 48 小时', hours: [12, 48], destinationId: 'chestnut-forest', imageUrl: '' },
  { id: 'oden', cat: 'food', name: '关东煮', price: 45, desc: '能走很远，最长 48 小时', hours: [12, 48], destinationId: 'rainy-konbini', imageUrl: '' },
  { id: 'camera', cat: 'prop', name: '一次性相机', price: 35, desc: '多带回一张旅途照片', effectKey: 'extra_photo', imageUrl: '' },
  { id: 'umbrella', cat: 'prop', name: '小雨伞', price: 25, desc: '雨天也能多写一段旅途小故事', effectKey: 'rain_story', imageUrl: '' },
  { id: 'guide', cat: 'prop', name: '旅行指南', price: 40, desc: '更容易遇到新朋友', effectKey: 'more_friends', imageUrl: '' },
  { id: 'cookie', cat: 'gift', name: '手工饼干', price: 15, desc: '送给路上的朋友，关系升得更快', effectKey: 'friend_affinity', imageUrl: '' },
  { id: 'sticker', cat: 'gift', name: '星星贴纸', price: 10, desc: '送给路上的朋友，关系升得更快', effectKey: 'friend_affinity', imageUrl: '' },
  { id: 'honey', cat: 'gift', name: '蜂蜜罐', price: 20, desc: '送给路上的朋友，关系升得更快', effectKey: 'friend_affinity', imageUrl: '' },
];

// 界面上给用户看的失败原因。
export const TRIP_REASON_TEXT = {
  not_enough_coins: '旅费不够，去签到或玩小游戏攒一攒',
  no_stock: '背包里没有这件东西了',
  away: 'TA 正在旅行，回来之前不能这样做',
  unclaimed: '上一趟的车票还没有收起',
  already_signed: '今天已经签到过了',
};

export const TRIP_REASON_FALLBACK = '出了点小问题，请刷新后再试';

export const getTripReasonText = (reason) => TRIP_REASON_TEXT[reason] || TRIP_REASON_FALLBACK;

const ITEM_MAP = new Map(TRIP_ITEMS.map((item) => [item.id, item]));
const DESTINATION_MAP = new Map(TRIP_DESTINATIONS.map((dest) => [dest.id, dest]));
const ANIMAL_MAP = new Map(TRIP_ANIMALS.map((animal) => [animal.id, animal]));

export const getTripItem = (id) => (id ? ITEM_MAP.get(id) || null : null);
export const getTripDestination = (id) => (id ? DESTINATION_MAP.get(id) || null : null);
export const getTripAnimal = (id) => ANIMAL_MAP.get(id) || TRIP_ANIMALS[0];

// 用角色 id 稳定地挑一个默认动物（同一个角色每次都是同一只）。
export const defaultAnimalIdFor = (characterId) => {
  const text = String(characterId);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return TRIP_ANIMALS[hash % TRIP_ANIMALS.length].id;
};

export const emptyLuggage = () => ({ food: null, prop: null, gift: null });

// 根据行李预告这一趟的情况。纯函数，不碰数据库，界面预告和真正出发
// 时都用它，保证“预告的”和“实际的”是同一套规则。
// destination 为 null 表示没有特殊食品，出发时从 pool 里随机抽一个。
export const planTrip = (luggage = {}) => {
  const food = getTripItem(luggage.food);
  const prop = getTripItem(luggage.prop);
  const gift = getTripItem(luggage.gift);

  const pool = TRIP_DESTINATIONS.filter((dest) => !dest.special);
  const destination = food && food.destinationId ? getTripDestination(food.destinationId) : null;
  const hours = food && Array.isArray(food.hours) ? food.hours : TRIP_DEFAULT_HOURS;

  let destinationLabel = '只在附近转转';
  if (destination) {
    destinationLabel = destination.name;
  } else if (food) {
    destinationLabel = pool.map((dest) => dest.name).join(' / ') + '，随机';
  }

  return {
    destination,
    pool,
    hours: [hours[0], hours[1]],
    destinationLabel,
    effects: [prop, gift].filter(Boolean).map((item) => item.desc),
  };
};