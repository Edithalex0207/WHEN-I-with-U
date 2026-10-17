/**
 * fortuneService.js
 *
 * 每个小伙伴（companionId）独立的日签服务。
 *
 * Dexie 表：fortuneDraws（在 db.version(77) 中已定义）
 *   id           自增主键
 *   companionId  关联的小伙伴 id
 *   dateStr      抽签日期 'YYYY-MM-DD'
 *   style        'omikuji' | 'tarot' | 'astro'
 *   result       完整结果对象（序列化存入 JSON 字段，Dexie 自动处理）
 *   preferredStyle  用户上次选择的风格（每次抽签更新，下次打开时沿用）
 *
 * 每天只能抽一次（同 companionId+dateStr 组合唯一）。
 * 历史：最多保存 30 天，再早的自动清除（懒清理）。
 */

import { db } from '../../../db/index';
import { buildResult, pickEntry } from './fortuneData';
import { recordTaskEvent } from '../tasks/companionTaskService';

/* ------------------------------------------------------------------ */
/* 工具函数                                                               */
/* ------------------------------------------------------------------ */

export function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* 核心 API                                                              */
/* ------------------------------------------------------------------ */

/**
 * 读取某 companion 今天的签文（没抽返回 null）
 * 同时返回历史记录（最近 7 天）和风格偏好。
 *
 * @returns {{ todayDraw: object|null, history: object[], preferredStyle: string }}
 */
export async function getFortuneState(companionId) {
  if (!companionId) return { todayDraw: null, history: [], preferredStyle: 'omikuji' };

  const today = todayDateStr();
  const all = await db.fortuneDraws
    .where('companionId')
    .equals(companionId)
    .reverse()
    .limit(31) // 今天 + 最近 30 天
    .toArray();

  // 按日期降序
  all.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  const todayDraw = all.find((r) => r.dateStr === today) ?? null;
  const history = all.filter((r) => r.dateStr !== today).slice(0, 7);

  // 风格偏好：优先用最近一次抽签保存的风格，否则默认 omikuji
  const preferredStyle = (todayDraw ?? all[0])?.style ?? 'omikuji';

  return { todayDraw, history, preferredStyle };
}

/**
 * 执行一次抽签。
 * 如果今天已抽过，直接返回当天的结果（幂等）。
 *
 * @param {number} companionId
 * @param {'omikuji'|'tarot'|'astro'} style
 * @returns {object} 抽签结果（同 fortuneDraws 表的行结构）
 */
export async function drawFortune(companionId, style) {
  if (!companionId) throw new Error('缺少 companionId');

  const today = todayDateStr();
  // 每日任务（戳一戳TA.../抽一次今日签）只认"今天第一次真正抽签"，
  // 不认"今天已经抽过、再打开弹窗看一眼"——用这个标记区分，
  // 在事务外面再上报，避免 db.transaction 的表范围（只声明了
  // db.fortuneDraws）里混进 companionTaskService 要读写的
  // db.companions/db.companionLogs。
  let isFreshDraw = false;

  const result = await db.transaction('rw', db.fortuneDraws, async () => {
    // 幂等：今天已抽过就直接返回
    const existing = await db.fortuneDraws
      .where('companionId').equals(companionId)
      .filter((r) => r.dateStr === today)
      .first();
    if (existing) return existing;

    const entry = pickEntry(style);
    const fortuneResult = buildResult(style, entry);

    const id = await db.fortuneDraws.add({
      companionId,
      dateStr: today,
      style,
      result: fortuneResult,
    });

    // 懒清理：只保留最近 30 天
    const cutoff = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const old = await db.fortuneDraws
      .where('companionId').equals(companionId)
      .filter((r) => r.dateStr < cutoff)
      .toArray();
    await Promise.all(old.map((r) => db.fortuneDraws.delete(r.id)));

    isFreshDraw = true;
    return db.fortuneDraws.get(id);
  });

  if (isFreshDraw) {
    await recordTaskEvent(companionId, 'fortune_drawn'); // 每日任务：抽一次今日签
  }

  return result;
}

/**
 * 更新某 companion 的风格偏好（不抽签，只记偏好）。
 * 用于用户切换 tab 但还没抽签时持久化选择。
 */
export async function savePreferredStyle(companionId, style) {
  if (!companionId) return;
  // preferredStyle 存在最新一条 fortuneDraws 上。
  // 如果今天已抽过则更新那条；否则只在内存记录（组件管理），不写库，
  // 等到真正抽签时 drawFortune 传入 style 就自然记录了。
  const today = todayDateStr();
  const existing = await db.fortuneDraws
    .where('companionId').equals(companionId)
    .filter((r) => r.dateStr === today)
    .first();
  if (existing) {
    await db.fortuneDraws.update(existing.id, { style });
  }
}