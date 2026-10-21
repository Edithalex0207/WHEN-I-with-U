/*
 * sweetPlayEngine.js —— 「小蛋糕店」主动玩法的规则引擎（纯函数，不碰数据库、不碰界面）。
 *
 * 界面层只做三件事：
 *   1) 用 setInterval 每隔一小段时间调 tickRun，推进计时和顾客耐心
 *   2) 玩家点单、做蛋糕时，调下面的 submitTicket / judge* / recordStepGrade / serveCustomer
 *   3) 时间到后调 finishRun 得到结算，再交给 sweetPlayService.submitRunResult 写库
 *
 * 所有函数都不修改传进来的对象，而是返回新对象（React 里直接 setRun 就能用）。
 * 需要随机数的函数都有可选的 rng 参数（默认 Math.random），方便以后测试。
 *
 * 一位顾客的状态（customer.status）：
 *   'waiting'  刚进店，还没点单
 *   'cooking'  已点单，蛋糕在后厨做
 *   'served'   已出餐（从 run.customers 移到 run.served）
 *   'lost'     耐心用完走掉了（从 run.customers 移到 run.lost）
 */

import { STAR_HEART_BONUS_PER_STAR } from './sweetStreetData';
import {
  RUN_DURATION_SEC,
  FIRST_CUSTOMER_DELAY_SEC,
  CUSTOMER_REFILL_GAP_SEC,
  RUN_SPAWN_CUTOFF_SEC,
  SHOP_STAR_RULES,
  SEQUENCE_STEP_FAST_SEC,
  GRADE_POINTS,
  CAKE_STAR_BY_POINTS,
  TICKET_STAR_CAP,
  LOW_PATIENCE_RATIO,
  HEARTS_PER_CUSTOMER_STAR,
  EXP_PER_CUSTOMER_STAR,
  COMBO_BONUS,
  ALL_HAPPY_BONUS,
  SWEET_RECIPES,
  SWEET_ORDER_LINE_TEMPLATES,
  SWEET_CUSTOMERS,
  SWEET_INGREDIENTS,
  SWEET_DECORATIONS,
} from './sweetPlayData';

const clampStar = (star) => Math.max(1, Math.min(5, Math.round(star) || 1));
const randInt = (max, rng) => Math.floor(rng() * max);
const pickOne = (list, rng) => list[randInt(list.length, rng)];

const shuffle = (list, rng = Math.random) => {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randInt(i + 1, rng);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const getStarRules = (shopStar) => SHOP_STAR_RULES[clampStar(shopStar)];

export const getRecipe = (recipeId) => SWEET_RECIPES.find((r) => r.id === recipeId) || null;

/** 这个星级已解锁的蛋糕 */
export const getUnlockedRecipes = (shopStar) => (
  SWEET_RECIPES.filter((r) => r.unlockStar <= clampStar(shopStar))
);

/** 这个星级已解锁的装饰 id（点单时「装饰顺序」那一排备选的来源，去重） */
export const getUnlockedDecoIds = (shopStar) => {
  const ids = [];
  getUnlockedRecipes(shopStar).forEach((recipe) => {
    recipe.decorations.forEach((id) => {
      if (!ids.includes(id)) ids.push(id);
    });
  });
  return ids;
};

// ---------------------------------------------------------------
// 顾客说的话
// ---------------------------------------------------------------

/** 把装饰按顺序说成一句话：先放A，再放B，最后放C */
export const buildDecoPhrase = (decoIds) => {
  const names = decoIds.map((id) => SWEET_DECORATIONS[id]?.name || id);
  if (names.length === 0) return '不用装饰';
  if (names.length === 1) return `放${names[0]}`;
  return names
    .map((name, index) => {
      if (index === 0) return `先放${name}`;
      if (index === names.length - 1) return `${names.length > 2 ? '最后' : '再'}放${name}`;
      return `再放${name}`;
    })
    .join('，');
};

export const buildOrderLine = (recipe, rng = Math.random) => {
  const template = pickOne(SWEET_ORDER_LINE_TEMPLATES, rng);
  return template
    .replace('{cake}', recipe.name)
    .replace('{decos}', buildDecoPhrase(recipe.decorations));
};

// ---------------------------------------------------------------
// 一局的状态
// ---------------------------------------------------------------

export const createRun = (shopStar) => {
  const star = clampStar(shopStar);
  const rules = getStarRules(star);
  return {
    shopStar: star,
    durationSec: RUN_DURATION_SEC,
    elapsedSec: 0,
    maxCustomers: rules.maxCustomers,
    patienceMaxSec: rules.patienceSec,
    nextSpawnAtSec: FIRST_CUSTOMER_DELAY_SEC,
    nextCustomerId: 1,
    customers: [], // 柜台前的顾客（waiting / cooking）
    served: [], // 已出餐的顾客记录
    lost: [], // 耐心用完走掉的顾客记录
    unfinished: [], // 时间到时还没出餐的顾客记录
    combo: 0,
    bestCombo: 0,
    over: false,
  };
};

const makeCustomer = (run, rng) => {
  const recipes = getUnlockedRecipes(run.shopStar);
  const recipe = pickOne(recipes, rng);

  // 尽量不和柜台前已有的顾客长得一样
  const usedDesigns = run.customers.map((c) => c.designId);
  const freshDesigns = SWEET_CUSTOMERS.filter((d) => !usedDesigns.includes(d.id));
  const design = pickOne(freshDesigns.length ? freshDesigns : SWEET_CUSTOMERS, rng);

  return {
    id: run.nextCustomerId,
    designId: design.id,
    recipeId: recipe.id, // 顾客真正想要的蛋糕
    line: buildOrderLine(recipe, rng),
    patienceMaxSec: run.patienceMaxSec,
    patienceLeftSec: run.patienceMaxSec,
    arrivedAtSec: run.elapsedSec,
    status: 'waiting',
    ticket: null, // { recipeId, decoIds }，玩家在平板上点的单
    ticketGrade: null, // 'ok' | 'wrongDeco' | 'wrongCake'
    grades: [], // 后厨每一步的结果，最多 4 个
  };
};

/**
 * 推进时间：减顾客耐心、耐心用完的走掉、有空位就进新顾客、时间到就结束。
 * @returns {{ run: object, events: Array<{type:string, customerId?:number}> }}
 *   events 的 type：'customerArrived' | 'customerLeft' | 'timeUp'
 */
export const tickRun = (run, dtSec, rng = Math.random) => {
  if (run.over) return { run, events: [] };

  const events = [];
  const elapsedSec = Math.min(run.durationSec, run.elapsedSec + Math.max(0, dtSec));
  let combo = run.combo;
  const lost = [...run.lost];
  const stillHere = [];

  run.customers.forEach((customer) => {
    const patienceLeftSec = customer.patienceLeftSec - dtSec;
    if (patienceLeftSec <= 0) {
      lost.push({
        id: customer.id,
        designId: customer.designId,
        recipeId: customer.recipeId,
        stars: 0,
      });
      combo = 0; // 顾客走掉会断连击
      events.push({ type: 'customerLeft', customerId: customer.id });
    } else {
      stillHere.push({ ...customer, patienceLeftSec });
    }
  });

  let next = {
    ...run,
    elapsedSec,
    customers: stillHere,
    lost,
    combo,
  };

  const canSpawnUntil = run.durationSec - RUN_SPAWN_CUTOFF_SEC;
  if (
    elapsedSec < run.durationSec
    && elapsedSec <= canSpawnUntil
    && elapsedSec >= next.nextSpawnAtSec
    && next.customers.length < next.maxCustomers
  ) {
    const customer = makeCustomer(next, rng);
    next = {
      ...next,
      customers: [...next.customers, customer],
      nextCustomerId: next.nextCustomerId + 1,
      nextSpawnAtSec: elapsedSec + CUSTOMER_REFILL_GAP_SEC,
    };
    events.push({ type: 'customerArrived', customerId: customer.id });
  }

  if (elapsedSec >= run.durationSec) {
    next = {
      ...next,
      over: true,
      unfinished: next.customers.map((c) => ({
        id: c.id, designId: c.designId, recipeId: c.recipeId, stars: 0,
      })),
      customers: [],
    };
    events.push({ type: 'timeUp' });
  }

  return { run: next, events };
};

// ---------------------------------------------------------------
// 点单
// ---------------------------------------------------------------

/** 对一下点的单和顾客说的是不是一回事 */
export const gradeTicket = (customer, recipeId, decoIds) => {
  if (recipeId !== customer.recipeId) return 'wrongCake';
  const wanted = getRecipe(customer.recipeId)?.decorations || [];
  const sameLength = wanted.length === decoIds.length;
  const sameOrder = sameLength && wanted.every((id, index) => decoIds[index] === id);
  return sameOrder ? 'ok' : 'wrongDeco';
};

/** 提交点单：这位顾客的订单送进后厨。后厨照 ticket 里的蛋糕做，不管点得对不对。 */
export const submitTicket = (run, customerId, recipeId, decoIds) => {
  const customers = run.customers.map((customer) => {
    if (customer.id !== customerId || customer.status !== 'waiting') return customer;
    return {
      ...customer,
      status: 'cooking',
      ticket: { recipeId, decoIds: [...decoIds] },
      ticketGrade: gradeTicket(customer, recipeId, decoIds),
    };
  });
  return { ...run, customers };
};

/** 后厨实际要做的蛋糕配方（按点的单，不是按顾客想要的） */
export const getCookRecipe = (customer) => (
  customer?.ticket ? getRecipe(customer.ticket.recipeId) : null
);

// ---------------------------------------------------------------
// 后厨各步的判定（返回 'perfect' | 'normal' | 'miss'）
// ---------------------------------------------------------------

/** 选料或装饰：点的这一下对不对（必须按顺序）。expectedIds 是要点的顺序，doneCount 是已点对几个 */
export const checkSequencePick = (expectedIds, doneCount, pickedId) => {
  const correct = expectedIds[doneCount] === pickedId;
  return {
    correct,
    finished: correct && doneCount + 1 >= expectedIds.length,
  };
};

/** 选料或装饰整步的结果。stepKey：'ingredients' | 'decoration' */
export const judgeSequenceStep = ({ wrongCount, elapsedSec, stepKey }) => {
  if (wrongCount > 0) return 'miss';
  const fastSec = SEQUENCE_STEP_FAST_SEC[stepKey] ?? 8;
  return elapsedSec <= fastSec ? 'perfect' : 'normal';
};

const judgeZone = (value, zone) => {
  const inRange = (range) => value >= range[0] && value <= range[1];
  if (inRange(zone.perfect)) return 'perfect';
  if (inRange(zone.ok)) return 'normal';
  return 'miss';
};

/** 烘焙：玩家点停时的进度（0~1）。走到头 1 还没点算烤焦，直接传 1 进来即可 */
export const judgeBake = (recipe, position) => judgeZone(position, recipe.bake);

/** 打奶油：玩家松手时的灌入量（0~1） */
export const judgeCream = (recipe, level) => judgeZone(level, recipe.cream);

// ---------------------------------------------------------------
// 记录步骤结果、连击、出餐
// ---------------------------------------------------------------

/**
 * 记下这位顾客的蛋糕又完成了一步，同时更新连击：
 * 完美 +1；普通不变；失误清零。
 */
export const recordStepGrade = (run, customerId, grade) => {
  let combo = run.combo;
  if (grade === 'perfect') combo += 1;
  else if (grade === 'miss') combo = 0;

  const customers = run.customers.map((customer) => (
    customer.id === customerId
      ? { ...customer, grades: [...customer.grades, grade] }
      : customer
  ));
  return {
    ...run,
    customers,
    combo,
    bestCombo: Math.max(run.bestCombo, combo),
  };
};

/** 一块蛋糕的最终星数（1~3） */
export const computeCakeStars = ({ grades, ticketGrade, patienceRatio }) => {
  const points = [0, 1, 2, 3].reduce(
    (sum, index) => sum + (GRADE_POINTS[grades[index]] ?? GRADE_POINTS.miss),
    0,
  );
  const base = CAKE_STAR_BY_POINTS.find((row) => points >= row.minPoints)?.stars || 1;
  let stars = Math.min(base, TICKET_STAR_CAP[ticketGrade] ?? 3);
  if (patienceRatio < LOW_PATIENCE_RATIO) stars = Math.max(1, stars - 1);
  return { stars, points };
};

/** 出餐：算出顾客给几颗星，把他从柜台移到 run.served */
export const serveCustomer = (run, customerId) => {
  const customer = run.customers.find((c) => c.id === customerId);
  if (!customer || customer.status !== 'cooking') return { run, stars: 0 };

  const patienceRatio = customer.patienceMaxSec > 0
    ? customer.patienceLeftSec / customer.patienceMaxSec
    : 0;
  const { stars, points } = computeCakeStars({
    grades: customer.grades,
    ticketGrade: customer.ticketGrade,
    patienceRatio,
  });

  const record = {
    id: customer.id,
    designId: customer.designId,
    recipeId: customer.recipeId,
    cookedRecipeId: customer.ticket?.recipeId || customer.recipeId,
    ticketGrade: customer.ticketGrade,
    grades: customer.grades,
    points,
    stars,
  };

  return {
    run: {
      ...run,
      customers: run.customers.filter((c) => c.id !== customerId),
      served: [...run.served, record],
    },
    stars,
  };
};

// ---------------------------------------------------------------
// 整局结算
// ---------------------------------------------------------------

export const finishRun = (run) => {
  const servedCount = run.served.length;
  const lostCount = run.lost.length;
  const unfinishedCount = run.unfinished.length;

  const cakeHearts = run.served.reduce((sum, s) => sum + (HEARTS_PER_CUSTOMER_STAR[s.stars] || 0), 0);
  const cakeExp = run.served.reduce((sum, s) => sum + (EXP_PER_CUSTOMER_STAR[s.stars] || 0), 0);

  const comboHearts = Math.min(
    COMBO_BONUS.maxHearts,
    Math.floor(run.bestCombo / COMBO_BONUS.everyCombo) * COMBO_BONUS.heartsPerStep,
  );

  const allHappy = servedCount >= ALL_HAPPY_BONUS.minServed
    && lostCount === 0
    && run.served.every((s) => s.stars === 3);
  const allHappyHearts = allHappy ? ALL_HAPPY_BONUS.hearts : 0;
  const allHappyExp = allHappy ? ALL_HAPPY_BONUS.exp : 0;

  const starBonusRate = (clampStar(run.shopStar) - 1) * STAR_HEART_BONUS_PER_STAR;
  const rawHearts = cakeHearts + comboHearts + allHappyHearts;
  const totalHearts = Math.max(0, Math.round(rawHearts * (1 + starBonusRate)));

  return {
    shopStar: run.shopStar,
    servedCount,
    lostCount,
    unfinishedCount,
    served: run.served,
    bestCombo: run.bestCombo,
    cakeHearts,
    comboHearts,
    allHappy,
    allHappyHearts,
    starBonusRate,
    totalHearts,
    expGain: cakeExp + allHappyExp,
  };
};

// ---------------------------------------------------------------
// 后厨货架
// ---------------------------------------------------------------

/**
 * 选料货架：这块蛋糕要的材料 + 若干干扰材料，打乱顺序。size 是货架总格数。
 * 干扰材料从「当前星级已解锁的蛋糕」会用到的材料里抽。
 */
export const buildIngredientShelf = (recipe, shopStar, size = 8, rng = Math.random) => {
  const pool = [];
  getUnlockedRecipes(shopStar).forEach((r) => {
    r.ingredients.forEach((id) => {
      if (!pool.includes(id) && !recipe.ingredients.includes(id)) pool.push(id);
    });
  });
  const extra = shuffle(pool, rng).slice(0, Math.max(0, size - recipe.ingredients.length));
  return shuffle([...recipe.ingredients, ...extra], rng).map((id) => SWEET_INGREDIENTS[id]);
};

/** 装饰托盘：这块蛋糕要的装饰 + 若干干扰装饰，打乱顺序 */
export const buildDecoTray = (recipe, shopStar, size = 4, rng = Math.random) => {
  const pool = getUnlockedDecoIds(shopStar).filter((id) => !recipe.decorations.includes(id));
  const extra = shuffle(pool, rng).slice(0, Math.max(0, size - recipe.decorations.length));
  return shuffle([...recipe.decorations, ...extra], rng).map((id) => SWEET_DECORATIONS[id]);
};