/*
 * sweetWorkService.js —— 挂机打工的数据读写（第三片）。
 *
 * 打工的是这个聊天室的角色，赚到的心心加到这个聊天室的小伙伴（companion.hearts）上。
 * 不新建表，沿用第一片的 sweetWorkSessions（db.version(99)）：
 *   status：'working'（进行中，到点之后也仍然是 working，等玩家手动领取） | 'settled'（已领取）
 *   开工时多存几个字段：baseHearts（当时的心心基数）、workerName（角色名，日志文案用）
 *   领取时写：settledAt、hearts（实际到手）、reportText、dateStr（按领取当天）
 *
 * 规则：
 *   - 同一个小伙伴同一时间只能有一份工
 *   - 到点之后要手动领取，不过期，隔天领也行
 *   - 提前召回只拿「已干时长比例 × 50%」的心心
 *   - 每日 WORK_DAILY_HEART_CAP 上限，按领取当天算，超出的部分直接截断
 *   - 店铺每升一星，心心 +10%（STAR_HEART_BONUS_PER_STAR）
 */

import db from '../../db';
import {
  SWEET_SHOPS,
  WORK_TIERS,
  WORK_DAILY_HEART_CAP,
  STAR_HEART_BONUS_PER_STAR,
  DEFAULT_SHOP_STATE,
} from './sweetStreetData';
import {
  EARLY_RECALL_RATE,
  WORK_REPORT_TEMPLATES,
  WORK_EARLY_REPORT_TEMPLATES,
} from './sweetWorkData';
import { ensureShopState, getActiveWork } from './sweetStreetService';

const HOUR_MS = 60 * 60 * 1000;
const round1 = (n) => Math.round(n * 10) / 10;
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

const dateStrOf = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const starBonus = (star) => 1 + (Math.max(1, star) - 1) * STAR_HEART_BONUS_PER_STAR;

/** 某一档在某个星级下，干满能拿到的心心（还没算每日上限） */
export const getTierHearts = (tier, shopStar) => Math.round(tier.baseHearts * starBonus(shopStar));

/** 提前召回的话，现在能拿到的心心预估（还没算每日上限） */
export const getRecallHearts = (session, shopStar, now = Date.now()) => {
  const total = Math.max(1, session.endsAt - session.startedAt);
  const ratio = Math.max(0, Math.min(1, (now - session.startedAt) / total));
  return Math.round(session.baseHearts * ratio * EARLY_RECALL_RATE * starBonus(shopStar));
};

/** 干满时能拿到的心心预估（还没算每日上限） */
export const getFullHearts = (session, shopStar) => (
  Math.round(session.baseHearts * starBonus(shopStar))
);

const buildReport = (session, early) => {
  const shop = SWEET_SHOPS.find((s) => s.id === session.shopId);
  const pool = early
    ? WORK_EARLY_REPORT_TEMPLATES
    : (WORK_REPORT_TEMPLATES[session.tierId] || WORK_REPORT_TEMPLATES.h1);
  return pickOne(pool)
    .replace(/\{name\}/g, session.workerName || 'TA')
    .replace(/\{shop\}/g, shop?.name || '小店');
};

/** 聊天室角色的名字（取不到就叫 TA） */
const getWorkerName = async (chatId) => {
  try {
    const chat = await db.chats.get(chatId);
    const character = chat ? await db.characters.get(chat.characterId) : null;
    return character?.name || 'TA';
  } catch (error) {
    return 'TA';
  }
};

const sumSettledToday = (rows, today) => (
  rows.filter((r) => r.dateStr === today).reduce((sum, r) => sum + (r.hearts || 0), 0)
);

/**
 * 打工面板打开时需要的信息：角色名、今天已经领了多少、每日上限。
 */
export const getWorkOverview = async (companionId, chatId) => {
  const [workerName, settled] = await Promise.all([
    getWorkerName(chatId),
    db.sweetWorkSessions.where('[companionId+status]').equals([companionId, 'settled']).toArray(),
  ]);
  return {
    workerName,
    todayEarned: sumSettledToday(settled, dateStrOf(Date.now())),
    dailyCap: WORK_DAILY_HEART_CAP,
  };
};

/**
 * 派角色去打工。返回 { ok:true, session } 或 { ok:false, reason:'busy'|'tier' }
 */
export const startWork = async (companionId, chatId, tierId) => {
  const tier = WORK_TIERS.find((t) => t.id === tierId);
  if (!tier) return { ok: false, reason: 'tier' };

  const openShops = SWEET_SHOPS.filter((s) => s.status === 'open');
  const shop = pickOne(openShops);
  await ensureShopState(companionId, shop.id);
  const workerName = await getWorkerName(chatId);

  return db.transaction('rw', db.sweetWorkSessions, async () => {
    const existing = await getActiveWork(companionId);
    if (existing) return { ok: false, reason: 'busy' };

    const now = Date.now();
    const record = {
      companionId,
      chatId,
      shopId: shop.id,
      tierId: tier.id,
      hours: tier.hours,
      baseHearts: tier.baseHearts,
      workerName,
      status: 'working',
      startedAt: now,
      endsAt: now + tier.hours * HOUR_MS,
      settledAt: null,
      hearts: 0,
      reportText: '',
      dateStr: '',
    };
    const id = await db.sweetWorkSessions.add(record);
    return { ok: true, session: { ...record, id } };
  });
};

/**
 * 领取（到点了）或召回（还没到点，只拿一部分）。
 * 返回 { ok:true, early, hearts, rawHearts, truncated, reportText, companion } 或 { ok:false, reason:'missing' }
 */
export const settleWork = async (companionId, sessionId) => {
  return db.transaction(
    'rw',
    db.companions,
    db.companionLogs,
    db.sweetShopStates,
    db.sweetWorkSessions,
    async () => {
      const session = await db.sweetWorkSessions.get(sessionId);
      if (!session || session.companionId !== companionId || session.status !== 'working') {
        return { ok: false, reason: 'missing' };
      }
      const companion = await db.companions.get(companionId);
      if (!companion) return { ok: false, reason: 'missing' };

      const shopState = await db.sweetShopStates
        .where('[companionId+shopId]')
        .equals([companionId, session.shopId])
        .first();
      const star = shopState?.star ?? DEFAULT_SHOP_STATE.star;

      const now = Date.now();
      const early = now < session.endsAt;
      const rawHearts = early
        ? getRecallHearts(session, star, now)
        : getFullHearts(session, star);

      const settled = await db.sweetWorkSessions
        .where('[companionId+status]')
        .equals([companionId, 'settled'])
        .toArray();
      const today = dateStrOf(now);
      const room = Math.max(0, WORK_DAILY_HEART_CAP - sumSettledToday(settled, today));
      const hearts = Math.min(rawHearts, room);
      const truncated = hearts < rawHearts;
      const reportText = buildReport(session, early);

      await db.sweetWorkSessions.put({
        ...session,
        status: 'settled',
        settledAt: now,
        hearts,
        reportText,
        dateStr: today,
      });

      const nextCompanion = {
        ...companion,
        hearts: round1((companion.hearts || 0) + hearts),
        updatedAt: now,
      };
      await db.companions.put(nextCompanion);
      await db.companionLogs.add({
        companionId,
        logType: 'user_action',
        actionType: 'sweet_street_work',
        content: `${reportText}（带回 ${hearts} 颗心心）`,
        timestamp: now,
      });

      return { ok: true, early, hearts, rawHearts, truncated, reportText, companion: nextCompanion };
    },
  );
};
