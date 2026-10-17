/*
 * companionSchoolActivityService.js —— 「随机校园小事」的落地逻辑。
 *
 * 【这个文件管什么】
 * 做完一组题之后，由 UI（CompanionSchoolQuizModal.jsx）主动调一次
 * rollCampusActivity：按 ACTIVITY_CHANCE 的概率决定要不要弹一件小事，
 * 中了就从 companionSchoolActivities.js 的素材里随机挑一条、把占位符换成
 * 真实的名字，写进 companionSchoolLife（kind = ACTIVITY），再给小伙伴
 * 加一点点心情。没中、或者正好没有可用的小伙伴数据，就返回 null，
 * UI 什么都不显示——这是"小惊喜"，不是每次都有的东西。
 *
 * 不是放进 companionSchoolQuizService.js 里一起调的：那个文件在文件头
 * 明确写了"只 import db、companionSchoolData、companionSchoolService"，
 * 做题结算和"要不要顺带弹件小事"是两件事，不想为了这一个小功能改掉那份
 * 已经写死的 import 约定。调用顺序由 UI 决定：先 finishQuizSet 结算，
 * 拿到结果后再调这个文件的 rollCampusActivity，失败也不影响已经结算好的
 * 做题结果（因此这里的每一步失败都应该让调用方能安全地 catch 掉）。
 *
 * 只 import db、companionSchoolData（取 ACTIVITY_CHANCE / LIFE_KIND /
 * findSchoolClass / findSchoolTeacher）、companionSchoolActivities（素材）、
 * companionSchoolService（取 getDayKey）。不 import
 * companionSchoolQuizService.js，避免绕出一圈循环依赖。
 */

import db from '../../../db';
import {
  ACTIVITY_CHANCE,
  LIFE_KIND,
  findSchoolClass,
  findSchoolTeacher,
} from './companionSchoolData';
import { CAMPUS_ACTIVITIES } from './companionSchoolActivities';
import { getDayKey } from './companionSchoolService';

const clamp100 = (value) => Math.max(0, Math.min(100, value));

const fillTemplate = (text, { name, className, teacherName }) => text
  .split('{name}').join(name)
  .split('{class}').join(className)
  .split('{teacher}').join(teacherName);

/**
 * 做完一组题之后调一次。
 *
 * @param {number} companionId
 * @param {{
 *   classId?: string, teacherId?: string,   // 一般直接传 finishQuizSet 结果里
 *                                            // status.record 的这两个字段
 *   companionName?: string,
 *   now?: number,
 *   rng?: function,                         // 可注入，方便测试
 * }} options
 * @returns {Promise<{id:number, text:string, moodDelta:number}|null>}
 *          没中/没有素材时返回 null；中了返回这条 companionSchoolLife 记录
 *          （再加一个 moodDelta 字段，方便 UI 直接显示"+N 心情"）。
 */
export const rollCampusActivity = async (companionId, {
  classId = null,
  teacherId = null,
  companionName = '',
  now = Date.now(),
  rng = Math.random,
} = {}) => {
  if (!CAMPUS_ACTIVITIES.length) return null;
  if (rng() >= ACTIVITY_CHANCE) return null;

  const template = CAMPUS_ACTIVITIES[Math.floor(rng() * CAMPUS_ACTIVITIES.length)];
  const schoolClass = findSchoolClass(classId);
  const teacher = findSchoolTeacher(teacherId);
  const text = fillTemplate(template.text, {
    name: companionName || '小伙伴',
    className: schoolClass?.name || '班里',
    teacherName: teacher?.name || '老师',
  });

  const [min, max] = template.moodRange || [1, 2];
  const moodDelta = min + Math.floor(rng() * (max - min + 1));

  const row = {
    companionId,
    date: getDayKey(now),
    kind: LIFE_KIND.ACTIVITY,
    text,
    meta: { activityId: template.id, moodDelta },
    createdAt: now,
  };
  row.id = await db.companionSchoolLife.add(row);

  if (moodDelta > 0) {
    const companion = await db.companions.get(companionId);
    if (companion) {
      await db.companions.update(companionId, {
        mood: clamp100((companion.mood ?? 0) + moodDelta),
        updatedAt: now,
      });
    }
  }

  return { ...row, moodDelta };
};