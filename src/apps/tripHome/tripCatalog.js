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

// 自动出发规则。只在「旅行小屋」打开期间检查（关着的时候不会出发，下次
// 打开时才接着算）。居民回到家（收下明信片）之后，先待够 cooldownHours；
// 之后每次检查（每 checkSeconds 秒一次）有 chancePerCheck 的概率出发，
// 行李里放了东西时概率乘 packedMultiplier；待够 guaranteeAfterHours 就
// 一定出发。每次检查最多出发一个居民。想让 TA 们出门更勤或更懒，改这里。
export const TRIP_AUTO_DEPART = {
  checkSeconds: 60,
  cooldownHours: 2,
  chancePerCheck: 0.03,
  packedMultiplier: 3,
  guaranteeAfterHours: 12,
};

// 每趟旅行遇到雨天的概率（出发时就定下来；带了小雨伞会多写一段雨中小故事）。
export const TRIP_RAIN_CHANCE = 0.3;

// 路上遇到新朋友的概率：带了旅行指南更容易遇到。
export const TRIP_FRIEND_CHANCE = 0.35;
export const TRIP_FRIEND_CHANCE_WITH_GUIDE = 0.85;

// 动物预设。imageUrl 填了就用图片，没填用内置剪影（color 是剪影的主色）。
export const TRIP_ANIMALS = [
  { id: 'cat', name: '猫', color: '#f2b36e', imageUrl: '' },
  { id: 'bunny', name: '兔', color: '#fbe3ec', imageUrl: '' },
  { id: 'bear', name: '熊', color: '#b98a66', imageUrl: '' },
  { id: 'fox', name: '狐狸', color: '#f08a4b', imageUrl: '' },
  { id: 'frog', name: '青蛙', color: '#9ed7a3', imageUrl: '' },
];

// 房间。bgImageUrl 留给用户自己填背景图链接；没填之前界面显示一个朴素的
// 占位色块（不是手绘房间），提示还没填图。房间页下面那排"切换房间"的按钮
// 只在至少两个房间有图（填了 bgImageUrl，或用户给这个房间传过自己的图）
// 时才显示；只有一个房间有图时不显示，免得出现点了也用不了的按钮。
// 名字是通用名，想改成有主题的名字直接改这里。unlockCost 为 0 表示一开始就
// 解锁；其余房间要花旅费解锁，解锁后永久保留，不会再次收费。地板/障碍物
// 的标定数据不放在这里——那是运行时在设置里按房间 id 存一份，标定工具
// 标完直接生效，不需要改这个文件。
export const TRIP_ROOMS = [
  { id: 'pink', name: '我的小屋', unlockCost: 0, bgImageUrl: '' },
  { id: 'mint', name: '第二间小屋', unlockCost: 0, bgImageUrl: '' },
  { id: 'dusk', name: '第三间小屋', unlockCost: 120, bgImageUrl: '' },
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
  memory_game_limit: '今天的翻牌配对次数用完了，明天再来',
};

// ---------- 小游戏：翻牌配对 ----------
// 商店页"小游戏赚旅费"入口的第一个小游戏。6 对共 12 张牌，配完按用了
// 多少步结算：步数越少奖励越高。每天能玩的次数有上限，防止靠反复刷它
// 无限赚旅费；次数和最佳步数记在 tripHomeState 里（见 tripService.js），
// 不是单独的表，不需要升级数据库版本。

// 每天最多玩几次，过了本地日期的 0 点重新计数。
export const TRIP_MEMORY_GAME_MAX_PLAYS = 3;

// 6 对最少 6 步就能配完。按本局用了多少步，从上到下找第一个
// "步数 <= maxMoves" 的档位用它的奖励；超过最后一档都按 TRIP_MEMORY_GAME_FALLBACK_REWARD
// 结算。想改奖励曲线直接改这个数组。
export const TRIP_MEMORY_GAME_REWARDS = [
  { maxMoves: 7, reward: 30 },
  { maxMoves: 9, reward: 22 },
  { maxMoves: 12, reward: 16 },
  { maxMoves: 16, reward: 10 },
];
export const TRIP_MEMORY_GAME_FALLBACK_REWARD = 6;

export const getTripMemoryGameReward = (moves) => {
  const found = TRIP_MEMORY_GAME_REWARDS.find((row) => moves <= row.maxMoves);
  return found ? found.reward : TRIP_MEMORY_GAME_FALLBACK_REWARD;
};

// 卡片主题：6 对，每对一个图标 id（图标画在 TripMemoryGame.jsx 里）+ 一个
// 糖板色（复用 tripHome.css 里已有的 6 个色相类 trip-c-xxx，跟其它"糖果
// 按钮"是同一套配色，不用再定义新颜色）。想换主题图案，加/改这个数组，
// 同时在 TripMemoryGame.jsx 的 ICONS 里补上同名图标就行。
export const TRIP_MEMORY_GAME_PAIRS = [
  { id: 'ticket', label: '车票', colorClass: 'trip-c-sun' },
  { id: 'suitcase', label: '行李箱', colorClass: 'trip-c-peach' },
  { id: 'postcard', label: '明信片', colorClass: 'trip-c-mint' },
  { id: 'coin', label: '旅行币', colorClass: 'trip-c-rose' },
  { id: 'camera', label: '相机', colorClass: 'trip-c-sky' },
  { id: 'home', label: '小屋', colorClass: 'trip-c-lilac' },
];


export const TRIP_REASON_FALLBACK = '出了点小问题，请刷新后再试';

export const getTripReasonText = (reason) => TRIP_REASON_TEXT[reason] || TRIP_REASON_FALLBACK;

const ITEM_MAP = new Map(TRIP_ITEMS.map((item) => [item.id, item]));
const DESTINATION_MAP = new Map(TRIP_DESTINATIONS.map((dest) => [dest.id, dest]));
const ANIMAL_MAP = new Map(TRIP_ANIMALS.map((animal) => [animal.id, animal]));
const ROOM_MAP = new Map(TRIP_ROOMS.map((room) => [room.id, room]));

export const getTripItem = (id) => (id ? ITEM_MAP.get(id) || null : null);
export const getTripDestination = (id) => (id ? DESTINATION_MAP.get(id) || null : null);
export const getTripAnimal = (id) => ANIMAL_MAP.get(id) || TRIP_ANIMALS[0];
export const getTripRoom = (id) => ROOM_MAP.get(id) || TRIP_ROOMS[0];

// 项目放在 public/ 里的静态图片的地址（会带上部署的 base 路径）。
export const tripAsset = (path) => {
  let base = '/';
  try {
    base = (import.meta.env && import.meta.env.BASE_URL) || '/';
  } catch (error) {
    base = '/';
  }
  return `${base}${String(path).replace(/^\//, '')}`;
};

// 目的地的风景图：目录里填了 sceneImageUrl 就用它；没填就按约定去
// public/trip/scenes/{目的地 id}.jpg 找。文件不存在时界面自动退回占位色块。
export const getTripSceneUrl = (destination) => {
  if (!destination) return '';
  return destination.sceneImageUrl || tripAsset(`trip/scenes/${destination.id}.jpg`);
};

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