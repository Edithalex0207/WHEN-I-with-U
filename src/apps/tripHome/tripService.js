// src/apps/tripHome/tripService.js
//
// 「旅行小屋」的数据读写层。界面组件不直接碰 Dexie，全部经过这里。
//
// 数据放在哪里：
// - db.tripResidents：每个聊天角色一条居民记录（动物形象、行李、在家/外出）。
// - db.tripJourneys：每一趟旅行一条记录（目的地、出发/到站时间、车票状态）。
// - db.settings 里的单独一行 key = 'tripHomeState'：旅费、背包数量、签到记录。
//   这几样东西总是一起读一起改，放一行里用事务整体读改写最不容易算错，
//   不需要为它们单独建表。
//
// 所有会改旅费/背包/行李的操作都放在 db.transaction 里（先读再改再写），
// 避免连点两次造成重复扣款或物品凭空多出来。
//
// 本文件只导出命名导出，调用方一律用 import { ... } from './tripService'。

import db from '../../db';
import {
  TRIP_ANIMALS,
  TRIP_CHECKIN_REWARDS,
  TRIP_AUTO_DEPART,
  TRIP_MEMORY_GAME_MAX_PLAYS,
  TRIP_RAIN_CHANCE,
  TRIP_SLOTS,
  defaultAnimalIdFor,
  emptyLuggage,
  getTripItem,
  getTripMemoryGameReward,
  planTrip,
} from './tripCatalog';

export const TRIP_STATE_KEY = 'tripHomeState';

export const RESIDENT_STATUS = {
  HOME: 'home',
  AWAY: 'away',
};

export const JOURNEY_STATUS = {
  AWAY: 'away',
  ARRIVED: 'arrived',
  CLAIMED: 'claimed',
};

const HOUR_MS = 60 * 60 * 1000;
const MAX_TRIP_HOURS = 48;

/* ---------- 旅费 / 背包 / 签到 的状态行 ---------- */

const createDefaultState = () => ({
  coins: 0,
  inventory: {},
  checkinStreak: 0,
  lastCheckinDate: '',
  memoryGame: { playsToday: 0, lastPlayDate: '', bestMoves: 0 },
});

const toCount = (value) => Math.max(0, Math.floor(Number(value) || 0));

const normalizeMemoryGame = (raw) => {
  const base = { playsToday: 0, lastPlayDate: '', bestMoves: 0 };
  if (!raw || typeof raw !== 'object') return base;
  return {
    playsToday: toCount(raw.playsToday),
    lastPlayDate: typeof raw.lastPlayDate === 'string' ? raw.lastPlayDate : '',
    bestMoves: toCount(raw.bestMoves),
  };
};

const normalizeState = (raw) => {
  const base = createDefaultState();
  if (!raw || typeof raw !== 'object') return base;

  const inventory = {};
  if (raw.inventory && typeof raw.inventory === 'object') {
    Object.keys(raw.inventory).forEach((id) => {
      const count = toCount(raw.inventory[id]);
      if (count > 0) inventory[id] = count;
    });
  }

  return {
    coins: toCount(raw.coins),
    inventory,
    checkinStreak: toCount(raw.checkinStreak),
    lastCheckinDate: typeof raw.lastCheckinDate === 'string' ? raw.lastCheckinDate : '',
    memoryGame: normalizeMemoryGame(raw.memoryGame),
  };
};

// 下面两个只能在事务里调用（读和写要在同一个事务中完成）。
const readStateInTx = async () => {
  const row = await db.settings.get(TRIP_STATE_KEY);
  return normalizeState(row?.value);
};

const writeStateInTx = (state) => db.settings.put({ key: TRIP_STATE_KEY, value: state });

export const getTripState = async () => {
  const row = await db.settings.get(TRIP_STATE_KEY);
  return normalizeState(row?.value);
};

const takeFromInventory = (state, itemId) => {
  state.inventory[itemId] = (state.inventory[itemId] || 0) - 1;
  if (state.inventory[itemId] <= 0) delete state.inventory[itemId];
};

const addToInventory = (state, itemId) => {
  state.inventory[itemId] = (state.inventory[itemId] || 0) + 1;
};

/* ---------- 购买 ---------- */

export const purchaseTripItem = async (itemId) => {
  const item = getTripItem(itemId);
  if (!item) return { ok: false, reason: 'unknown_item' };

  return db.transaction('rw', db.settings, async () => {
    const state = await readStateInTx();

    if (state.coins < item.price) {
      return { ok: false, reason: 'not_enough_coins', state };
    }

    state.coins -= item.price;
    addToInventory(state, item.id);
    await writeStateInTx(state);
    return { ok: true, state };
  });
};

/* ---------- 每日签到 ---------- */

const pad2 = (value) => String(value).padStart(2, '0');

export const toLocalDateKey = (timestamp = Date.now()) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const toYesterdayKey = (timestamp = Date.now()) => {
  const date = new Date(timestamp);
  date.setDate(date.getDate() - 1);
  return toLocalDateKey(date.getTime());
};

// 界面用：把状态行换算成“今天签没签、连续几天、7 天格子点亮几个、今天能领多少”。
// 漏签一天连续天数就断了（lastCheckinDate 不是今天也不是昨天）。
export const getCheckinView = (state, now = Date.now()) => {
  const rewards = TRIP_CHECKIN_REWARDS;
  const cycle = rewards.length;
  const signedToday = state.lastCheckinDate === toLocalDateKey(now);
  const alive = signedToday || state.lastCheckinDate === toYesterdayKey(now);
  const streak = alive ? state.checkinStreak : 0;

  const lit = signedToday ? ((streak - 1) % cycle) + 1 : streak % cycle;
  const todayReward = rewards[signedToday ? (streak - 1) % cycle : streak % cycle];

  return { signedToday, streak, lit, todayReward, cycle, rewards };
};

export const claimDailyCheckin = async (now = Date.now()) =>
  db.transaction('rw', db.settings, async () => {
    const state = await readStateInTx();
    const view = getCheckinView(state, now);

    if (view.signedToday) {
      return { ok: false, reason: 'already_signed', state };
    }

    state.coins += view.todayReward;
    state.checkinStreak = view.streak + 1;
    state.lastCheckinDate = toLocalDateKey(now);
    await writeStateInTx(state);
    return { ok: true, reward: view.todayReward, state };
  });

/* ---------- 居民 ---------- */

let ensureResidentsPromise = null;

// 给还没有居民记录的聊天角色补一条。并发调用（比如 React 严格模式下
// 的两次 effect）共用同一个进行中的 promise，事务里再查一次已有的，
// 两层保险避免同一个角色出现两条居民。
export const ensureTripResidents = () => {
  if (ensureResidentsPromise) return ensureResidentsPromise;

  ensureResidentsPromise = (async () => {
    try {
      const characters = await db.characters.toArray();

      await db.transaction('rw', db.tripResidents, async () => {
        const existing = await db.tripResidents.toArray();
        const have = new Set(existing.map((resident) => resident.characterId));
        const now = Date.now();

        const rows = characters
          .filter((character) => character && character.id != null && !have.has(character.id))
          .map((character) => ({
            characterId: character.id,
            animalId: defaultAnimalIdFor(character.id),
            avatarUrl: '',
            luggage: emptyLuggage(),
            status: RESIDENT_STATUS.HOME,
            currentJourneyId: null,
            createdAt: now,
          }));

        if (rows.length > 0) {
          await db.tripResidents.bulkAdd(rows);
        }
      });
    } finally {
      ensureResidentsPromise = null;
    }
  })();

  return ensureResidentsPromise;
};

// 居民 + 角色的名字，按角色 id 排序。聊天角色被删掉后，对应居民不再显示
// （记录本身不删，万一以后角色又回来）。
export const listTripResidents = async () => {
  await ensureTripResidents();

  const [residents, characters] = await Promise.all([
    db.tripResidents.toArray(),
    db.characters.toArray(),
  ]);

  const characterMap = new Map(characters.map((character) => [character.id, character]));

  return residents
    .filter((resident) => characterMap.has(resident.characterId))
    .map((resident) => {
      const character = characterMap.get(resident.characterId);
      return {
        ...resident,
        luggage: { ...emptyLuggage(), ...(resident.luggage || {}) },
        name: character.name || '未命名',
      };
    })
    .sort((a, b) => a.characterId - b.characterId);
};

/* ---------- 居民自己的贴图 ---------- */

// 用户给某个居民上传的形象贴图，存在居民记录的 skinDataUrl 字段上（PNG 的
// data URL，上传时已经裁成正方形、压到 256 像素、烤好了白色贴纸描边）。
// skinDataUrl 不是索引字段，所以不需要升级数据库版本。
// 优先级：用户上传的贴图 > 动物预设图片 > 内置剪影（见 TripRoom 的
// ResidentSprite 和 TripParts 的 TripAvatar）。
export const saveResidentSkin = async (residentId, dataUrl) => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return { ok: false, reason: 'bad_image' };
  }
  const updated = await db.tripResidents.update(residentId, { skinDataUrl: dataUrl });
  return updated ? { ok: true } : { ok: false, reason: 'no_resident' };
};

export const clearResidentSkin = async (residentId) => {
  const updated = await db.tripResidents.update(residentId, { skinDataUrl: '' });
  return updated ? { ok: true } : { ok: false, reason: 'no_resident' };
};

/* ---------- 居民的动物种类和动物人设 ---------- */

// 用户手动给某个居民换动物（可选的动物见 tripCatalog.js 的 TRIP_ANIMALS）。
// animalId、animalPersona 都不是索引字段，所以不需要升级数据库版本。
export const setResidentAnimal = async (residentId, animalId) => {
  if (!TRIP_ANIMALS.some((animal) => animal.id === animalId)) {
    return { ok: false, reason: 'bad_animal' };
  }
  const updated = await db.tripResidents.update(residentId, { animalId });
  return updated ? { ok: true } : { ok: false, reason: 'no_resident' };
};

// 动物人设：一两句话，写这个角色变成动物后的样子和小习惯。目前只是存下来，
// 后面旅途故事、明信片（切片 C）会参考它。
export const ANIMAL_PERSONA_MAX = 120;

export const saveResidentAnimalPersona = async (residentId, text) => {
  const persona = String(text || '').trim().slice(0, ANIMAL_PERSONA_MAX);
  const updated = await db.tripResidents.update(residentId, { animalPersona: persona });
  return updated ? { ok: true, persona } : { ok: false, reason: 'no_resident' };
};

/* ---------- 行李 ---------- */

// 把背包里的物品放进某个居民的行李格，或者取出来（itemId 传 null）。
// 放进去时顺手把这个格子里原来的东西退回背包。居民在外面时不能改。
export const setLuggageSlot = async (residentId, slot, itemId) => {
  if (!TRIP_SLOTS.includes(slot)) return { ok: false, reason: 'bad_slot' };

  const item = itemId ? getTripItem(itemId) : null;
  if (itemId && (!item || item.cat !== slot)) return { ok: false, reason: 'bad_item' };

  return db.transaction('rw', db.settings, db.tripResidents, async () => {
    const resident = await db.tripResidents.get(residentId);
    if (!resident) return { ok: false, reason: 'no_resident' };
    if (resident.status === RESIDENT_STATUS.AWAY) return { ok: false, reason: 'away' };

    const state = await readStateInTx();
    const luggage = { ...emptyLuggage(), ...(resident.luggage || {}) };
    const previous = luggage[slot] || null;
    const next = item ? item.id : null;

    if (previous === next) return { ok: true, state, luggage };

    if (next) {
      if ((state.inventory[next] || 0) <= 0) {
        return { ok: false, reason: 'no_stock', state };
      }
      takeFromInventory(state, next);
    }
    if (previous) addToInventory(state, previous);

    luggage[slot] = next;
    await db.tripResidents.update(residentId, { luggage });
    await writeStateInTx(state);
    return { ok: true, state, luggage };
  });
};

/* ---------- 旅行（车票） ---------- */

// 出发：按行李预告抽目的地、定时长，创建一张车票。行李里的东西在出发时
// 全部用掉（行李清空，不退回背包）。
// options.hours 指定时长（小时，可以是小数，测试用）；不传则在行李预告
// 的时长范围里随机。options.rng 方便测试时传固定的随机函数。
export const startTripJourney = async (residentId, options = {}) => {
  const now = options.now != null ? options.now : Date.now();
  const rng = typeof options.rng === 'function' ? options.rng : Math.random;

  return db.transaction('rw', db.tripResidents, db.tripJourneys, async () => {
    const resident = await db.tripResidents.get(residentId);
    if (!resident) return { ok: false, reason: 'no_resident' };
    if (resident.status === RESIDENT_STATUS.AWAY) return { ok: false, reason: 'away' };
    if (resident.currentJourneyId) return { ok: false, reason: 'unclaimed' };

    const luggage = { ...emptyLuggage(), ...(resident.luggage || {}) };
    const plan = planTrip(luggage);
    const destination =
      plan.destination || plan.pool[Math.min(plan.pool.length - 1, Math.floor(rng() * plan.pool.length))];

    const rawHours =
      options.hours != null
        ? Number(options.hours)
        : plan.hours[0] + rng() * (plan.hours[1] - plan.hours[0]);
    const hours = Math.min(MAX_TRIP_HOURS, Math.max(1 / 60, rawHours));
    const arriveAt = now + Math.round(hours * HOUR_MS);
    const rainy = rng() < TRIP_RAIN_CHANCE;

    const journeyId = await db.tripJourneys.add({
      residentId,
      characterId: resident.characterId,
      destinationId: destination.id,
      destinationName: destination.name,
      destinationCode: destination.code,
      transport: destination.transport,
      departAt: now,
      arriveAt,
      luggage,
      rainy,
      status: JOURNEY_STATUS.AWAY,
      createdAt: now,
    });

    await db.tripResidents.update(residentId, {
      status: RESIDENT_STATUS.AWAY,
      currentJourneyId: journeyId,
      luggage: emptyLuggage(),
    });

    return { ok: true, journeyId, arriveAt, destinationName: destination.name };
  });
};

// 到站结算：把到点的车票标成“已到站”，对应居民回到家里（但
// currentJourneyId 先保留，直到这张车票被收起/领取才清掉）。
export const settleTripArrivals = async (now = Date.now()) =>
  db.transaction('rw', db.tripJourneys, db.tripResidents, async () => {
    const away = await db.tripJourneys.where('status').equals(JOURNEY_STATUS.AWAY).toArray();
    const due = away.filter((journey) => journey.arriveAt <= now);

    for (const journey of due) {
      await db.tripJourneys.update(journey.id, { status: JOURNEY_STATUS.ARRIVED });
      await db.tripResidents.update(journey.residentId, { status: RESIDENT_STATUS.HOME });
    }

    return due.length;
  });

// 已收好、带明信片的旅行记录（收藏册用），按到站时间倒序排（最新收到的在
// 最前面）。理论上 claimed 的车票都应该有明信片了，但以防万一（比如明信片
// 生成失败又没重试就被收起来了）还是过滤一下，不在册子里留空白卡片。
export const listClaimedJourneys = async () => {
  const rows = await db.tripJourneys.where('status').equals(JOURNEY_STATUS.CLAIMED).toArray();
  return rows.filter((journey) => journey.postcard).sort((a, b) => b.arriveAt - a.arriveAt);
};

// 还没收起的车票（外出中 + 已到站），按到站时间排序。
export const listActiveJourneys = async () => {
  const rows = await db.tripJourneys
    .where('status')
    .anyOf(JOURNEY_STATUS.AWAY, JOURNEY_STATUS.ARRIVED)
    .toArray();

  return rows.sort((a, b) => a.arriveAt - b.arriveAt);
};

// 领取（收起）一张已到站的车票：车票标成已领取，居民可以再次出发，并从
// 这一刻开始重新计算"在家待了多久"（自动出发用）。明信片留在这张车票记录
// 上，不会随着车票收起而消失。还没到站（状态不是 arrived）时不能领取。
export const dismissArrivedJourney = async (journeyId) =>
  db.transaction('rw', db.tripJourneys, db.tripResidents, async () => {
    const journey = await db.tripJourneys.get(journeyId);
    if (!journey) return { ok: false, reason: 'no_journey' };
    if (journey.status !== JOURNEY_STATUS.ARRIVED) return { ok: false, reason: 'not_arrived' };

    await db.tripJourneys.update(journeyId, { status: JOURNEY_STATUS.CLAIMED });

    const resident = await db.tripResidents.get(journey.residentId);
    if (resident && resident.currentJourneyId === journeyId) {
      await db.tripResidents.update(journey.residentId, { currentJourneyId: null, homeSince: Date.now() });
    }

    return { ok: true };
  });

/* ---------- 明信片存取 ---------- */

export const getJourney = (journeyId) => db.tripJourneys.get(journeyId);

// 明信片存在车票记录的 postcard 字段上（非索引字段，不需要升级数据库版本），
// 结构见 tripPostcardService.js 顶部的说明。
export const saveJourneyPostcard = async (journeyId, postcard) => {
  const updated = await db.tripJourneys.update(journeyId, { postcard });
  return updated ? { ok: true } : { ok: false, reason: 'no_journey' };
};

/* ---------- 自动出发 ---------- */

// 检查一次：哪些居民该出门了（规则见 tripCatalog.js 的 TRIP_AUTO_DEPART）。
// 在家、没有没领的车票、已经待够冷却时间的居民才会参与；每次最多出发一个。
// resident.homeSince 是"回到家"的时间（领取明信片时写入）；没有这个字段的
// 居民第一次被检查到时只记下当前时间，从那一刻开始计时，不会一打开就出发。
// 返回这次出发的居民 [{ residentId, name, journeyId, arriveAt, destinationName }]。
export const runAutoDeparture = async (options = {}) => {
  const now = options.now != null ? options.now : Date.now();
  const rng = typeof options.rng === 'function' ? options.rng : Math.random;
  const rule = TRIP_AUTO_DEPART;

  const residents = await listTripResidents();
  const candidates = [];

  for (const resident of residents) {
    if (resident.status !== RESIDENT_STATUS.HOME || resident.currentJourneyId) continue;

    if (resident.homeSince == null) {
      await db.tripResidents.update(resident.id, { homeSince: now });
      continue;
    }

    const homeHours = (now - resident.homeSince) / HOUR_MS;
    if (homeHours < rule.cooldownHours) continue;

    const packed = TRIP_SLOTS.some((slot) => resident.luggage && resident.luggage[slot]);
    const chance =
      homeHours >= rule.guaranteeAfterHours
        ? 1
        : Math.min(1, rule.chancePerCheck * (packed ? rule.packedMultiplier : 1));

    if (rng() < chance) candidates.push(resident);
  }

  if (candidates.length === 0) return [];

  const pick = candidates[Math.floor(rng() * candidates.length)];
  const result = await startTripJourney(pick.id, { now, rng });
  if (!result.ok) return [];

  return [
    {
      residentId: pick.id,
      name: pick.name,
      journeyId: result.journeyId,
      arriveAt: result.arriveAt,
      destinationName: result.destinationName,
    },
  ];
};

/* ---------- 小游戏：翻牌配对 ---------- */

// 今天还能玩几次、最佳步数（界面用，纯读不改数据）。跨天（本地日期变了）
// 自动当作还没玩过，不需要专门清零。
export const getMemoryGameView = (state, now = Date.now()) => {
  const today = toLocalDateKey(now);
  const memoryGame = state.memoryGame || { playsToday: 0, lastPlayDate: '', bestMoves: 0 };
  const playsToday = memoryGame.lastPlayDate === today ? memoryGame.playsToday : 0;

  return {
    playsToday,
    playsLeft: Math.max(0, TRIP_MEMORY_GAME_MAX_PLAYS - playsToday),
    maxPlays: TRIP_MEMORY_GAME_MAX_PLAYS,
    bestMoves: memoryGame.bestMoves > 0 ? memoryGame.bestMoves : null,
  };
};

// 结算一局：按步数发旅费，今天玩的次数 +1（跨天自动从 0 重新算）。今天的
// 次数已经用完时拒绝结算，不发钱也不计次数。
export const claimMemoryGameReward = async (moves, now = Date.now()) =>
  db.transaction('rw', db.settings, async () => {
    const state = await readStateInTx();
    const today = toLocalDateKey(now);
    const prev = state.memoryGame && state.memoryGame.lastPlayDate === today
      ? state.memoryGame
      : { playsToday: 0, lastPlayDate: today, bestMoves: state.memoryGame ? state.memoryGame.bestMoves : 0 };

    if (prev.playsToday >= TRIP_MEMORY_GAME_MAX_PLAYS) {
      return { ok: false, reason: 'memory_game_limit', state };
    }

    const reward = getTripMemoryGameReward(toCount(moves) || 1);
    const bestMoves = prev.bestMoves > 0 ? Math.min(prev.bestMoves, moves) : moves;
    const playsToday = prev.playsToday + 1;

    state.coins += reward;
    state.memoryGame = { playsToday, lastPlayDate: today, bestMoves };
    await writeStateInTx(state);

    return {
      ok: true,
      reward,
      state,
      playsLeft: Math.max(0, TRIP_MEMORY_GAME_MAX_PLAYS - playsToday),
    };
  });