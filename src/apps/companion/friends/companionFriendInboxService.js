/*
 * companionFriendInboxService.js —— "小伙伴收到的申请"（信箱）核心逻辑。
 *
 * 数据：全部是 db.companions 上"不建索引"的新字段，不升级 schema 版本：
 *   companion.friendInbox      收到的信数组，见 InboxRequest 的注释
 *   companion.friendInboxMeta  { lastRollAt, dailyDate, dailyCount }
 *
 * 依赖方向：本文件只 import db / 头像池 / 名册 / companionFriendInboxAiService.js，
 * 绝不 import companionFriendService.js（后者的 runFriendTick 会反过来 import
 * 本文件，避免循环依赖）。因此"生成好友记录""今天日期"这类很小的工具就地写
 * 一份，不跨文件借用。
 *
 * 来信的方式（已跟用户确认）：只在打开好友广场时抽一次，不加后台调度，
 * 见 rollInboxArrival。每封信怎么处理由用户逐封选：
 *   我来通过 / 我来拒绝 / 交给小伙伴决定（PET_DECIDE_WAIT_MS 之后出结果，
 *   由 runFriendTick 顺路处理，页面开着时也会自己触发一次）。
 */

import db from '../../../db';
import { pickRandomAvatar } from './companionFriendAvatars';
import { EXTRA_NPC_ROSTER, pickRosterExamples } from './companionFriendRoster';
import { generateInboxApplicant, generatePetDecisionReply } from './companionFriendInboxAiService';

// ---- 常量：全部写成常量方便以后调 ----
export const INBOX_ARRIVAL_CHANCE = 0.55; // 每次打开广场抽一次，命中才来一封信
export const INBOX_MAX_OPEN = 3; // 待处理 + 小伙伴考虑中 最多同时挂几封
export const INBOX_DAILY_CAP = 3; // 每天最多来几封
export const INBOX_ROLL_MIN_GAP_MS = 20 * 60 * 1000; // 两次抽取最少间隔，防止反复开关页面刷信
export const PET_DECIDE_WAIT_MS = 5 * 60 * 1000; // 交给小伙伴后多久出结果
export const INBOX_HISTORY_LIMIT = 12; // 旧信最多保留几封
const PET_ACCEPT_PROBABILITY = { high: 0.85, mid: 0.7, low: 0.5 }; // 按小伙伴当前心情

const todayDateStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const pickRandom = (pool) => pool[Math.floor(Math.random() * pool.length)];

/*
 * InboxRequest（companion.friendInbox 的一项）：
 *   id, avatarId, name, k1, k2, declaration, message,
 *   status: 'pending' | 'deciding' | 'accepted' | 'declined',
 *   decidedBy: 'user' | 'pet' | null,
 *   receivedAt, decideAt（交给小伙伴后的出结果时间）, repliedAt, replyText
 */

// ---- AI 失败时的本地兜底 ----
const MESSAGE_TEMPLATES = [
  '我在广场上看到你好几次了，一直没敢过来。{declaration}',
  '今天路过你常待的地方，偷偷放了一片叶子在那儿。{declaration}',
  '我写了三遍才敢寄这封信。{declaration}',
  '听说你很喜欢这里，我也是。{declaration}',
];
const PET_ACCEPT_FALLBACKS = [
  '信我认真读过了，我们做朋友吧。',
  '谢谢你写信给我，我很高兴认识你。',
  '好呀，以后广场上见到要打招呼哦。',
];
const PET_DECLINE_FALLBACKS = [
  '谢谢你的信，不过我现在还没准备好，可以过一阵子再来吗。',
  '我有点害羞，想再等一等，你的信我会好好收着。',
  '这次先不了，不是不喜欢你，只是还需要一点时间。',
];

const buildFallbackApplicant = (excludeNames) => {
  const used = new Set(excludeNames);
  const candidates = EXTRA_NPC_ROSTER.filter((item) => !used.has(item.name));
  if (candidates.length === 0) return null;
  const picked = pickRandom(candidates);
  return {
    ...picked,
    message: pickRandom(MESSAGE_TEMPLATES).split('{declaration}').join(picked.declaration),
  };
};

// ---- 同步小工具：给 UI 用，直接从已加载的 companion 对象算，不查库 ----
export const getInbox = (companion) => (Array.isArray(companion?.friendInbox) ? companion.friendInbox : []);
export const getInboxPendingCount = (companion) => getInbox(companion).filter((r) => r.status === 'pending').length;
export const getInboxDecidingCount = (companion) => getInbox(companion).filter((r) => r.status === 'deciding').length;
export const hasDecidingInbox = (companion) => getInboxDecidingCount(companion) > 0;

const buildFriendRecord = (request, now) => ({
  id: request.id,
  avatarId: request.avatarId,
  name: request.name,
  k1: request.k1,
  k2: request.k2,
  declaration: request.declaration,
  friendship: 0,
  daily: { dateStr: todayDateStr(), used: 0 },
  lastStory: null,
  createdAt: now,
});

// 旧信（已处理）只留最近 INBOX_HISTORY_LIMIT 封，新信（未处理）全部保留。
const trimInbox = (inbox) => {
  const open = inbox.filter((r) => r.status === 'pending' || r.status === 'deciding');
  const closed = inbox
    .filter((r) => r.status === 'accepted' || r.status === 'declined')
    .sort((a, b) => (b.repliedAt || 0) - (a.repliedAt || 0))
    .slice(0, INBOX_HISTORY_LIMIT);
  return [...open, ...closed];
};

const rollingIds = new Set();

/*
 * 打开广场时调用一次：按规则判断今天还能不能来信，命中概率就生成一封新信
 * 放进信箱。返回新信，没来返回 null。出错只打日志，绝不往外抛。
 */
export const rollInboxArrival = async (companionId, { now = Date.now(), rng = Math.random } = {}) => {
  if (rollingIds.has(companionId)) return null;
  rollingIds.add(companionId);

  try {
    const companion = await db.companions.get(companionId);
    if (!companion) return null;

    const inbox = getInbox(companion);
    const meta = companion.friendInboxMeta || {};
    const dateStr = todayDateStr();
    const dailyCount = meta.dailyDate === dateStr ? (meta.dailyCount || 0) : 0;

    if (dailyCount >= INBOX_DAILY_CAP) return null;
    if (getInboxPendingCount(companion) + getInboxDecidingCount(companion) >= INBOX_MAX_OPEN) return null;
    if (now - (meta.lastRollAt || 0) < INBOX_ROLL_MIN_GAP_MS) return null;

    // 先记下这次抽取，不管命不命中，都算"这次打开已经抽过"。
    await db.companions.update(companionId, {
      friendInboxMeta: { lastRollAt: now, dailyDate: dateStr, dailyCount },
    });

    if (rng() >= INBOX_ARRIVAL_CHANCE) return null;

    const excludeNames = [
      ...(companion.friends || []).map((f) => f.name),
      ...(companion.friendPlaza || []).map((c) => c.name),
      ...inbox.map((r) => r.name),
    ];

    let applicant = null;
    try {
      applicant = await generateInboxApplicant({
        petName: companion.name,
        excludeNames,
        styleExamples: pickRosterExamples(3),
      });
    } catch (error) {
      console.warn('[CompanionFriendInbox] AI 生成来信失败，退回本地兜底:', error);
    }
    if (!applicant || excludeNames.includes(applicant.name)) {
      applicant = buildFallbackApplicant(excludeNames);
    }
    if (!applicant) return null;

    const request = {
      id: genId(),
      avatarId: pickRandomAvatar().id,
      name: applicant.name,
      k1: applicant.k1,
      k2: applicant.k2,
      declaration: applicant.declaration,
      message: applicant.message,
      status: 'pending',
      decidedBy: null,
      receivedAt: now,
      decideAt: null,
      repliedAt: null,
      replyText: null,
    };

    // AI 调用期间数据可能变了，写入前重新读一次。
    const fresh = await db.companions.get(companionId);
    if (!fresh) return null;
    await db.companions.update(companionId, {
      friendInbox: trimInbox([request, ...getInbox(fresh)]),
      friendInboxMeta: { lastRollAt: now, dailyDate: dateStr, dailyCount: dailyCount + 1 },
      updatedAt: Date.now(),
    });
    return request;
  } catch (error) {
    console.error('[CompanionFriendInbox] 抽取来信失败:', error);
    return null;
  } finally {
    rollingIds.delete(companionId);
  }
};

// 把一封信标成已处理；同意时顺手加进好友。re-read 后再写，避免覆盖别处的改动。
const resolveRequest = async (companionId, requestId, { accepted, decidedBy, replyText, requireStatus }) => {
  const fresh = await db.companions.get(companionId);
  if (!fresh) throw new Error('小伙伴不存在');

  const inbox = getInbox(fresh);
  const index = inbox.findIndex((r) => r.id === requestId);
  if (index === -1) throw new Error('这封信不见了。');
  if (!requireStatus.includes(inbox[index].status)) throw new Error('这封信已经处理过了。');

  const now = Date.now();
  const resolved = {
    ...inbox[index],
    status: accepted ? 'accepted' : 'declined',
    decidedBy,
    repliedAt: now,
    replyText: replyText || null,
  };
  const nextInbox = [...inbox];
  nextInbox[index] = resolved;

  const patch = { friendInbox: trimInbox(nextInbox), updatedAt: now };
  if (accepted && !(fresh.friends || []).some((f) => f.id === resolved.id)) {
    patch.friends = [...(fresh.friends || []), buildFriendRecord(resolved, now)];
  }
  await db.companions.update(companionId, patch);
  return resolved;
};

// ---- 用户亲自决定 ----
export const acceptInboxRequest = (companionId, requestId) => resolveRequest(companionId, requestId, {
  accepted: true, decidedBy: 'user', replyText: null, requireStatus: ['pending'],
});

export const declineInboxRequest = (companionId, requestId) => resolveRequest(companionId, requestId, {
  accepted: false, decidedBy: 'user', replyText: null, requireStatus: ['pending'],
});

// ---- 交给小伙伴决定 ----
export const delegateInboxRequest = async (companionId, requestId) => {
  const companion = await db.companions.get(companionId);
  if (!companion) throw new Error('小伙伴不存在');

  const inbox = getInbox(companion);
  const index = inbox.findIndex((r) => r.id === requestId);
  if (index === -1) throw new Error('这封信不见了。');
  if (inbox[index].status !== 'pending') throw new Error('这封信已经处理过了。');

  const now = Date.now();
  const next = [...inbox];
  next[index] = { ...inbox[index], status: 'deciding', decideAt: now + PET_DECIDE_WAIT_MS };
  await db.companions.update(companionId, { friendInbox: next, updatedAt: now });
  return next[index];
};

const decidePetAcceptance = (mood) => {
  const value = Number(mood);
  const probability = !Number.isFinite(value) || value >= 60
    ? PET_ACCEPT_PROBABILITY.high
    : value >= 30 ? PET_ACCEPT_PROBABILITY.mid : PET_ACCEPT_PROBABILITY.low;
  return Math.random() < probability;
};

const decidingIds = new Set();

/*
 * 处理一只小伙伴所有到点的"考虑中"：本地规则先定结果，AI 只负责写那句话。
 * 同一只同时只跑一轮，出错只打日志，不往外抛。runFriendTick 和收件箱页面
 * 都会调它。
 */
export const processInboxDecisions = async (companionId) => {
  if (decidingIds.has(companionId)) return;
  decidingIds.add(companionId);

  try {
    const companion = await db.companions.get(companionId);
    if (!companion) return;

    const now = Date.now();
    const due = getInbox(companion).filter((r) => r.status === 'deciding' && (r.decideAt || 0) <= now);

    for (const request of due) {
      const accepted = decidePetAcceptance(companion.mood);

      let replyText = null;
      try {
        replyText = await generatePetDecisionReply({ petName: companion.name, applicant: request, accepted });
      } catch (error) {
        console.warn('[CompanionFriendInbox] AI 生成回复失败，退回本地兜底:', error);
      }
      if (!replyText) replyText = pickRandom(accepted ? PET_ACCEPT_FALLBACKS : PET_DECLINE_FALLBACKS);

      try {
        await resolveRequest(companionId, request.id, {
          accepted, decidedBy: 'pet', replyText, requireStatus: ['deciding'],
        });
      } catch (error) {
        console.warn('[CompanionFriendInbox] 写入结果失败（可能已被处理）:', error);
      }
    }
  } catch (error) {
    console.error('[CompanionFriendInbox] 处理小伙伴的决定失败:', error);
  } finally {
    decidingIds.delete(companionId);
  }
};