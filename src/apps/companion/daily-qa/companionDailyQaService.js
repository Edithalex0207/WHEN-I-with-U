/*
 * companionDailyQaService.js —— 每日问答的数据 CRUD + 当天题目的"确保存在"
 * 入口（ensureTodayQA）。
 *
 * 【设计要点】
 * - 一天一对问题：一个问 char（角色），一个问 user，date 是本地日期
 *   字符串 'YYYY-MM-DD'，[companionId+date] 保证一天只有一条。
 * - 问题定下来之后当天不再变；char 的回答（charAnswer）跟"今天出没出
 *   题"这件事是分开的两步——出题失败就退回固定题库，但角色回答失败只
 *   留 null，界面上显示空状态 + 重roll 按钮，用户随时能再点一次重新生成，
 *   不会因为 AI 报错一次就卡死一整天（具体两步分别调用
 *   companionDailyQaAiService.js 的 generateQuestionPair / generateCharAnswer）。
 * - 用户的回答（userAnswer）提交后不可修改，锁定逻辑在 submitUserAnswer
 *   里——已经有 userAnswer 的记录直接拒绝再次写入。
 * - 历史只保留最近 5 天：每次 ensureTodayQA 顺手清一次超过 5 天的旧记录，
 *   不单独起定时任务；另外留了 clearHistory 给历史 tab 的手动"现在清空"。
 *
 * 完全新表 companionDailyQA（db.version(92)），跟 companionDiaries/
 * companionMoods/companionLogs 都不共用。
 */

import db from '../../../db';
import { generateQuestionPair, generateCharAnswer, pickFallbackQuestionPair } from './companionDailyQaAiService';

const HISTORY_RETENTION_DAYS = 5;

const pad2 = (n) => String(n).padStart(2, '0');

export const toDateStr = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const getTodayDateStr = () => toDateStr(new Date());

const dateStrDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
};

const getRecord = (companionId, dateStr) => (
  db.companionDailyQA.where('[companionId+date]').equals([companionId, dateStr]).first()
);

export const getRecordByDate = async (companionId, dateStr) => {
  if (!companionId || !dateStr) return null;
  return (await getRecord(companionId, dateStr)) || null;
};

export const getTodayQA = async (companionId) => getRecordByDate(companionId, getTodayDateStr());

/*
 * 删掉超过 HISTORY_RETENTION_DAYS 天的旧记录（不含今天，边界按日期字符串
 * 比较，不用管时区细节——date 本身就是本地日期字符串）。
 */
export const cleanupOldRecords = async (companionId) => {
  if (!companionId) return;

  const cutoff = dateStrDaysAgo(HISTORY_RETENTION_DAYS);
  const staleIds = await db.companionDailyQA
    .where('companionId')
    .equals(companionId)
    .filter((row) => typeof row.date === 'string' && row.date < cutoff)
    .primaryKeys();

  if (staleIds.length > 0) {
    await db.companionDailyQA.bulkDelete(staleIds);
  }
};

/*
 * 历史 tab 用：最近 HISTORY_RETENTION_DAYS 天（含今天）的记录，按日期倒序。
 */
export const getHistory = async (companionId) => {
  if (!companionId) return [];

  const cutoff = dateStrDaysAgo(HISTORY_RETENTION_DAYS);
  const rows = await db.companionDailyQA
    .where('companionId')
    .equals(companionId)
    .filter((row) => typeof row.date === 'string' && row.date >= cutoff)
    .toArray();

  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
};

/*
 * 历史 tab 的"现在清空"：保留今天这一条还在进行中的问答，只清掉更早的。
 * 这样不会误删用户今天还没答完的东西。
 */
export const clearHistory = async (companionId) => {
  if (!companionId) return;

  const todayStr = getTodayDateStr();
  const idsToDelete = await db.companionDailyQA
    .where('companionId')
    .equals(companionId)
    .filter((row) => row.date !== todayStr)
    .primaryKeys();

  if (idsToDelete.length > 0) {
    await db.companionDailyQA.bulkDelete(idsToDelete);
  }
};

/*
 * 确保"今天"这一对问题存在，没有就生成并写入；已经存在就原样返回
 * （不会覆盖，问题当天定下来就不再变）。顺手清一次 5 天前的旧记录。
 *
 * ctx: { chatId, chat, character, companion } —— 四件套，透传给
 * companionDailyQaAiService 的两个生成函数。
 */
export const ensureTodayQA = async (ctx) => {
  const { companion } = ctx;
  if (!companion?.id) return null;

  await cleanupOldRecords(companion.id);

  const todayStr = getTodayDateStr();
  const existing = await getRecord(companion.id, todayStr);
  if (existing) return existing;

  const aiPair = await generateQuestionPair(ctx);
  const { questionForChar, questionForUser } = aiPair || pickFallbackQuestionPair();

  // 角色的回答是独立一步，失败就先留 null，不影响这一对问题本身写入。
  const charAnswer = await generateCharAnswer({ ...ctx, questionForChar });

  const id = await db.companionDailyQA.add({
    companionId: companion.id,
    date: todayStr,
    questionForChar,
    charAnswer: charAnswer || null,
    questionForUser,
    userAnswer: null,
    userAnsweredAt: null,
    createdAt: Date.now(),
  });

  return db.companionDailyQA.get(id);
};

/*
 * 重roll 角色的回答：问题不变，只重新生成 charAnswer。用于当天生成失败后
 * 用户手动重试，或者单纯想让 TA 换个说法。
 */
export const rerollCharAnswer = async (ctx, dateStr) => {
  const { companion } = ctx;
  if (!companion?.id || !dateStr) return null;

  const existing = await getRecord(companion.id, dateStr);
  if (!existing) return null;

  const charAnswer = await generateCharAnswer({ ...ctx, questionForChar: existing.questionForChar });
  if (!charAnswer) return null; // 还是失败就不覆盖，维持原来的空状态

  await db.companionDailyQA.update(existing.id, { charAnswer });
  return db.companionDailyQA.get(existing.id);
};

/*
 * 用户提交自己的回答——锁定逻辑在这里：已经答过的记录直接拒绝，调用方
 * （弹窗组件）应该在提交前自己做"确定要这样回答吗"的二次确认，这里只
 * 负责兜底校验，不重复弹窗逻辑。
 */
export const submitUserAnswer = async (companionId, dateStr, answerText) => {
  if (!companionId || !dateStr) return null;

  const trimmed = String(answerText || '').trim();
  if (!trimmed) return null;

  const existing = await getRecord(companionId, dateStr);
  if (!existing) return null;
  if (existing.userAnswer) return existing; // 已经锁定，不能再改

  await db.companionDailyQA.update(existing.id, {
    userAnswer: trimmed,
    userAnsweredAt: Date.now(),
  });
  return db.companionDailyQA.get(existing.id);
};