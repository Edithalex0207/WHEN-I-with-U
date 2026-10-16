/*
 * companionSchoolReportService.js —— 「家校练习册」的数据层。
 *
 * 第 2 轮做了"今天在学校"这一张卡片：
 *   ensureTodayLifeNarrative —— 懒加载：今天做过题、还没写过叙事的话，
 *   调 AI 根据今天的做题记录写一句话，存进 companionSchoolLife（kind =
 *   LIFE_KIND.LESSON），存过了就直接读，不重复调用。
 *
 * 第 3 轮加了评语卡 + 签字 + 三方会谈（读写 companionSchoolReports）：
 *   ensureWeeklyReport —— 懒加载：这周还没生成过评语就调 AI 生成一条
 *   REPORT_KIND.WEEKLY，同时按 MEETING_CHANCE 的概率顺带生成一条待处理的
 *   REPORT_KIND.MEETING（跟评语绑在一起生成，不是独立定时器——周评语
 *   生成之后这周就不会再生成第二次，所以这个概率只在每周第一次打开评语
 *   卡时滚一次，不是"只要没中就一直滚"）。
 *   signWeeklyReport —— 签字，只是记一个 signedAt 时间戳。
 *   getPendingMeeting —— 取还没回应过的那条会谈（这一轮先把数据和生成逻辑
 *   接上，会谈本身的界面/回应留到下一轮，CompanionSchoolReportModal.jsx
 *   这一轮只把"老师想和你聊聊"的提示露出来，不能点开）。
 *
 * import 方向跟 companionSchoolQuizService.js 一样：只从
 * companionSchoolService.js 拿 getDayKey / getSchoolRecord，不反向被它
 * import，避免循环依赖。
 */

import db from '../../../db';
import {
  LIFE_KIND,
  REPORT_KIND,
  findSubject,
  findSchoolTeacher,
  findMeetingResponse,
} from './companionSchoolData';
import { SchoolError, getDayKey, getSchoolRecord } from './companionSchoolService';
import {
  generateLifeNarrative,
  generateWeeklyComment,
  generateMeetingLines,
} from './companionSchoolReportAiService';

/** 生成周评语时，顺带滚一次"要不要这周也触发一场三方会谈" */
const MEETING_CHANCE = 0.4;

/* ---------------- 今天在学校：读 ---------------- */
/** 今天已经写过的在校生活记录（没有就是 []，按 createdAt 从早到晚） */
export const getTodayLife = async (companionId, now = Date.now()) => {
  const todayKey = getDayKey(now);
  const rows = await db.companionSchoolLife
    .where('[companionId+date]')
    .equals([companionId, todayKey])
    .toArray();
  return rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
};

/* ---------------- 今天做了几组题：给叙事当素材 ---------------- */
/*
 * companionSchoolSets 只建了 companionId / finishedAt 两个单列索引，没有
 * [companionId+dayKey] 复合索引（建表时是按"第二期考试要整表扫描"设计的，
 * 不是按天查），所以这里按 companionId 整表拉出来、在内存里按 dayKey 过滤。
 * 一个小伙伴的做题记录量级不大（第二期之前每天最多 3 组），这样做没问题。
 */
const getTodaySets = async (companionId, now = Date.now()) => {
  const todayKey = getDayKey(now);
  const all = await db.companionSchoolSets.where('companionId').equals(companionId).toArray();
  return all.filter((row) => getDayKey(row.finishedAt) === todayKey);
};

/** 把今天的做题记录汇总成给 AI 用的素材：练了哪些科目、对了几道、共几道 */
const summarizeTodaySets = (sets) => {
  const subjectIds = new Set();
  let correct = 0;
  let total = 0;
  for (const set of sets) {
    total += set.total || 0;
    correct += set.correct || 0;
    for (const answer of set.answers || []) {
      if (answer.subject) subjectIds.add(answer.subject);
    }
  }
  return { subjectIds: [...subjectIds], correct, total, setCount: sets.length };
};

/* ---------------- 今天在学校：懒加载生成 ---------------- */
/**
 * 打开家校练习册的课程表 tab 时调。
 * - 今天已经写过 -> 直接返回已有的那条，不再调 AI。
 * - 今天还没做过题 -> 返回 null（没有素材，不硬编一条）。
 * - 今天做过题、还没写过 -> 调 AI 写一句话并落库；AI 没配置 / 失败时，
 *   用今天真实的科目 + 对题数拼一句兜底文案，不瞎编具体情节。
 *
 * @param {number} companionId
 * @param {{chatId:number, chat:object, character:object, companion:object}} ctx
 *        四件套跟其它直连 AI 的 school 服务一样；companion 用来给 AI 当
 *        "小伙伴"的名字/人设上下文。
 * @returns {object|null} companionSchoolLife 的那一行（没有素材时为 null）
 */
export const ensureTodayLifeNarrative = async (companionId, ctx = {}) => {
  const now = Date.now();
  const existing = await getTodayLife(companionId, now);
  const existingLesson = existing.find((row) => row.kind === LIFE_KIND.LESSON);
  if (existingLesson) return existingLesson;

  const todaySets = await getTodaySets(companionId, now);
  if (todaySets.length === 0) return null; // 今天还没上过课，没有素材可写

  const stats = summarizeTodaySets(todaySets);

  let text = await generateLifeNarrative({ ...ctx, stats }).catch(() => null);
  if (!text) {
    // AI 没配置或失败：用真实数据拼一句朴素的兜底文案，不编具体情节。
    const subjectLabel = stats.subjectIds.length > 0 ? `练了${stats.subjectIds.length}门课` : '上了课';
    text = `今天${subjectLabel}，一共做对了 ${stats.correct}/${stats.total} 道题。`;
  }

  const row = {
    companionId,
    date: getDayKey(now),
    kind: LIFE_KIND.LESSON,
    text,
    meta: stats,
    createdAt: now,
  };
  row.id = await db.companionSchoolLife.add(row);
  return row;
};

/* ---------------- 周：日期工具 ---------------- */
const pad2 = (n) => String(n).padStart(2, '0');

/* 跟 companionSchoolQuizService.js 的两个同名小工具一样的写法（那边没有
 * export，这里就各写一份，省得为了两行小函数专门建一个 import 关系）。 */
const round1 = (value) => Math.round(value * 10) / 10;
const clamp100 = (value) => Math.max(0, Math.min(100, value));

/** 本地时区的"周一"日期字符串 'YYYY-MM-DD'，周日算上一周的周日不单独成周 */
export const getWeekKey = (timestamp = Date.now()) => {
  const d = new Date(timestamp);
  const jsDay = d.getDay(); // 0 周日 .. 6 周六
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
  return `${monday.getFullYear()}-${pad2(monday.getMonth() + 1)}-${pad2(monday.getDate())}`;
};

/** weekKey（周一日期）-> [本周一 00:00 时间戳, 下周一 00:00 时间戳) */
const weekKeyToRange = (weekKey) => {
  const [y, m, d] = weekKey.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  return [start, start + 7 * 86400000];
};

/** 把一周的做题记录汇总成给 AI / 兜底文案用的素材 */
const summarizeWeekSets = (sets) => {
  const days = new Set();
  const subjectIds = new Set();
  let correct = 0;
  let total = 0;
  for (const set of sets) {
    days.add(getDayKey(set.finishedAt));
    correct += set.correct || 0;
    total += set.total || 0;
    for (const answer of set.answers || []) {
      if (answer.subject) subjectIds.add(answer.subject);
    }
  }
  return {
    daysAttended: days.size,
    setCount: sets.length,
    correct,
    total,
    subjectIds: [...subjectIds],
  };
};

/* ---------------- 评语卡 / 三方会谈：读 ---------------- */
/** 某一周的周评语（没有就是 null） */
export const getWeeklyReport = async (companionId, weekKey) => {
  const row = await db.companionSchoolReports
    .where('[companionId+weekKey]')
    .equals([companionId, weekKey])
    .and((r) => r.kind === REPORT_KIND.WEEKLY)
    .first();
  return row || null;
};

/** 还没回应过的那条三方会谈（按 companionId 找，不分哪一周——理论上同时
 *  最多只会有一条待处理的，因为 ensureWeeklyReport 一周只生成一次） */
export const getPendingMeeting = async (companionId) => {
  const rows = await db.companionSchoolReports
    .where('companionId')
    .equals(companionId)
    .and((r) => r.kind === REPORT_KIND.MEETING && !r.responseId)
    .toArray();
  rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return rows[0] || null;
};

/* ---------------- 兜底文案（AI 没配置 / 失败时用，不编具体情节） ---------------- */
const subjectLabelsText = (subjectIds = []) => {
  const labels = subjectIds.map((id) => findSubject(id)?.label).filter(Boolean);
  return labels.length > 0 ? labels.join('、') : '功课';
};

const fallbackWeeklyComment = (teacher, stats) => {
  const teacherName = teacher?.name || '老师';
  if (stats.setCount === 0) {
    return `这周${teacherName}还没看到TA来上课，有空的话多带TA去小课堂看看吧。`;
  }
  return `这周上了 ${stats.daysAttended} 天课，做了 ${stats.setCount} 组题，练了${subjectLabelsText(stats.subjectIds)}，一共对了 ${stats.correct}/${stats.total} 道，继续加油。`;
};

const fallbackMeetingLines = (teacher, stats) => ({
  teacherText: `这周做了 ${stats.setCount} 组题，${teacher?.catchphrase || '表现不错'}，建议多陪TA聊聊这周学的东西。`,
  petText: '这周我认真上课啦，你要不要听我讲讲学到了什么呀？',
});

/* ---------------- 评语卡：懒加载生成（顺带滚一次三方会谈） ---------------- */
/**
 * 打开家校练习册的评语卡 tab 时调。
 * - 这周已经生成过 -> 直接返回已有的评语（+ 当前还没回应的会谈，如果有）。
 * - 这周还没生成过 -> 调 AI 写评语并落库；同时按 MEETING_CHANCE 的概率
 *   （只在这一次机会里滚，不会议下周补滚）顺带生成一条会谈。
 *   AI 没配置 / 失败时，评语和会谈都退回真实数据拼出的兜底文案。
 *
 * @param {number} companionId
 * @param {{chatId:number, chat:object, character:object, companion:object}} ctx
 * @returns {{report:object, meeting:(object|null)}}
 */
export const ensureWeeklyReport = async (companionId, ctx = {}) => {
  const now = Date.now();
  const weekKey = getWeekKey(now);

  const existingReport = await getWeeklyReport(companionId, weekKey);
  if (existingReport) {
    return { report: existingReport, meeting: await getPendingMeeting(companionId) };
  }

  const [start, end] = weekKeyToRange(weekKey);
  const allSets = await db.companionSchoolSets.where('companionId').equals(companionId).toArray();
  const weekSets = allSets.filter((s) => s.finishedAt >= start && s.finishedAt < end);
  const stats = summarizeWeekSets(weekSets);

  const record = await getSchoolRecord(companionId);
  const teacher = findSchoolTeacher(record?.teacherId);

  let text = await generateWeeklyComment({ ...ctx, teacher, stats }).catch(() => null);
  if (!text) text = fallbackWeeklyComment(teacher, stats);

  const reportRow = {
    companionId,
    kind: REPORT_KIND.WEEKLY,
    weekKey,
    teacherId: record?.teacherId || null,
    text,
    stats,
    signedAt: null,
    createdAt: now,
  };
  reportRow.id = await db.companionSchoolReports.add(reportRow);

  let meetingRow = null;
  // 一组题都没做的那种周，不触发会谈——没什么可聊的。
  if (stats.setCount > 0 && Math.random() < MEETING_CHANCE) {
    const lines = await generateMeetingLines({ ...ctx, teacher, stats }).catch(() => null);
    const { teacherText, petText } = lines || fallbackMeetingLines(teacher, stats);
    meetingRow = {
      companionId,
      kind: REPORT_KIND.MEETING,
      weekKey,
      teacherId: record?.teacherId || null,
      teacherText,
      petText,
      responseId: null,
      respondedAt: null,
      createdAt: now,
    };
    meetingRow.id = await db.companionSchoolReports.add(meetingRow);
  }

  return { report: reportRow, meeting: meetingRow };
};

/** 家长签字：只记一个时间戳，不做其它校验（评语本身不会因为签字而改变） */
export const signWeeklyReport = async (reportId) => {
  await db.companionSchoolReports.update(reportId, { signedAt: Date.now() });
};

/* ---------------- 三方会谈：回应 ---------------- */
/**
 * 对一条待处理的三方会谈选一个回应（表扬 / 鼓励 / 带TA去玩 / 认真听完）。
 * 写法照抄 companionSchoolQuizService.js 的 finishQuizSet：数值变化和状态
 * 落库都在同一个事务里；心心不够时不是把结果 clamp 到 0，而是直接拒绝这次
 * 回应（跟 companionService.js 里"花心心"的那几处写法一样）。
 *
 * @param {number} meetingId  companionSchoolReports 里 kind='meeting' 的那一行的 id
 * @param {string} responseId MEETING_RESPONSES 里的某个 id（praise/cheer/play/listen）
 * @returns {{meeting:object, companion:object, response:object}}
 */
export const respondToMeeting = async (meetingId, responseId) => {
  const response = findMeetingResponse(responseId);
  if (!response) throw new SchoolError('bad_response', '回应方式不对');

  const now = Date.now();
  let meetingRow = null;

  await db.transaction(
    'rw',
    [db.companions, db.companionSchoolReports, db.companionLogs],
    async () => {
      const meeting = await db.companionSchoolReports.get(meetingId);
      if (!meeting || meeting.kind !== REPORT_KIND.MEETING) {
        throw new SchoolError('no_meeting', '这场会谈不存在');
      }
      if (meeting.responseId) throw new SchoolError('already_responded', '已经回应过这场会谈啦');

      const { companionId } = meeting;
      const companion = await db.companions.get(companionId);
      if (!companion) throw new SchoolError('no_companion', '小伙伴不存在');

      if ((companion.hearts || 0) < response.heartsCost) {
        throw new SchoolError('no_hearts', '心心不够啦');
      }

      await db.companions.update(companionId, {
        hearts: round1((companion.hearts || 0) - response.heartsCost),
        mood: clamp100((companion.mood ?? 0) + response.moodDelta),
        updatedAt: now,
      });

      await db.companionSchoolReports.update(meetingId, {
        responseId: response.id,
        respondedAt: now,
      });
      meetingRow = { ...meeting, responseId: response.id, respondedAt: now };

      await db.companionLogs.add({
        companionId,
        logType: 'user_action',
        actionType: 'school_meeting',
        content: `三方会谈选了"${response.label}"，心情 ${response.moodDelta >= 0 ? '+' : ''}${response.moodDelta}${response.heartsCost > 0 ? `，花了 ${response.heartsCost} 心心` : ''}。`,
        timestamp: now,
      });
    },
  );

  return {
    meeting: meetingRow,
    companion: await db.companions.get(meetingRow.companionId),
    response,
  };
};