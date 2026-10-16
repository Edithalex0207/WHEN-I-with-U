/*
 * companionSchoolPetLines.js —— 「上学」首页里小伙伴说的话。
 *
 * 纯数据文件（不 import db、不 import React），想加改一句话直接在下面的
 * 数组里加一行字符串就行，不用动其它代码。
 *
 * 【分组】按首页当前的状态分成几组，用 SCHOOL_PET_STATUS 的取值做 key：
 *   notEnrolled  —— 还没入学
 *   canPlay      —— 可以上课（今天还有课、不在冷却）
 *   cooldown     —— 下课休息中（冷却中）
 *   dailyDone    —— 今天的 3 节课都上完了
 *   canPromote   —— 满 20 节，可以办理升班
 * 这五组互斥，同一时刻首页只会处于其中一种状态，由下面 resolvePetStatus()
 * 根据 getSchoolStatus() 的返回值算出来（没入学 > 可以升班 > 今天上完了 >
 * 冷却中 > 可以上课，这个优先级是先按"最值得说的事"排的，想调整顺序改
 * resolvePetStatus 就行）。
 *
 * 【早晨专属】canPlay 状态下，10 点前进首页会优先说 MORNING_LINES 里的话，
 * 10 点后跟其它时候一样随机挑 SCHOOL_PET_LINES.canPlay 里的句子。
 *
 * 【小学专属】canPlay 状态下，如果小伙伴已经是小学阶段，会把
 * PRIMARY_EXTRA_LINES.canPlay 也混进候选池一起随机挑（幼儿园阶段不混）。
 *
 * 【第三期预留】交到朋友之后，LIFE_KIND.FRIEND 相关的话会再加一组，
 * 现在先不加。
 */

import { SCHOOL_STAGE } from './companionSchoolData';

/** 首页会用到的状态分组 key */
export const SCHOOL_PET_STATUS = {
  NOT_ENROLLED: 'notEnrolled',
  CAN_PLAY: 'canPlay',
  COOLDOWN: 'cooldown',
  DAILY_DONE: 'dailyDone',
  CAN_PROMOTE: 'canPromote',
};

/** 10 点前算"早晨" */
const MORNING_HOUR_CUTOFF = 10;

/* ---------------- 各状态的候选句子 ---------------- */
export const SCHOOL_PET_LINES = {
  [SCHOOL_PET_STATUS.NOT_ENROLLED]: [
    '好想去上学呀，听说有好多小朋友～',
    '书包我都想好是什么颜色的啦！',
    '老师会是什么样的呢，有一点点期待。',
    '什么时候才能去上学呀，等得我好心急。',
  ],
  [SCHOOL_PET_STATUS.CAN_PLAY]: [
    '今天也想学一点新东西！',
    '今天会不会交到新朋友呀？',
    '课间可以玩什么呢……',
    '准备好啦，今天也要认真上课！',
  ],
  [SCHOOL_PET_STATUS.COOLDOWN]: [
    '我先去操场溜达一圈，等会儿再上课！',
    '脑袋要放松一下～',
    '课间休息真舒服，晒晒太阳。',
  ],
  [SCHOOL_PET_STATUS.DAILY_DONE]: [
    '今天学得好满足，想回家玩啦！',
    '明天还想来上学！',
    '今天的课全部上完啦，可以休息咯。',
  ],
  [SCHOOL_PET_STATUS.CAN_PROMOTE]: [
    '我要上小学啦！又紧张又期待～',
    '感觉自己长大了一点点呢。',
  ],
};

/** canPlay 状态、早晨专属（10 点前，优先说这句） */
export const SCHOOL_PET_MORNING_LINES = {
  [SCHOOL_PET_STATUS.CAN_PLAY]: ['早上好！书包我准备好啦。'],
};

/** 小学阶段额外混入候选池的句子（目前只给 canPlay 加了几句） */
export const SCHOOL_PET_PRIMARY_EXTRA_LINES = {
  [SCHOOL_PET_STATUS.CAN_PLAY]: [
    '小学的书包好像更重一点……不过我可以的！',
    '小学的作业好像变多了一点点呢。',
  ],
};

/**
 * 根据 getSchoolStatus() 的返回值，算出首页现在该用哪一组台词。
 * 优先级：没入学 > 可以升班 > 今天上完了 > 冷却中 > 可以上课。
 * @param {object} schoolStatus  companionSchoolService.getSchoolStatus 的返回值
 * @returns {string} SCHOOL_PET_STATUS 的取值
 */
export const resolvePetStatus = (schoolStatus) => {
  if (!schoolStatus?.enrolled) return SCHOOL_PET_STATUS.NOT_ENROLLED;
  if (schoolStatus.promote?.canPromote) return SCHOOL_PET_STATUS.CAN_PROMOTE;
  if (schoolStatus.reason === 'daily_limit') return SCHOOL_PET_STATUS.DAILY_DONE;
  if (schoolStatus.reason === 'cooldown') return SCHOOL_PET_STATUS.COOLDOWN;
  return SCHOOL_PET_STATUS.CAN_PLAY;
};

/** 从数组里随机挑一个；excludeText 给了就尽量避免挑到同一句（池子只有 1 句时没法避免）。 */
const pickRandom = (list, excludeText) => {
  if (!list || list.length === 0) return '';
  if (list.length === 1 || !excludeText) {
    return list[Math.floor(Math.random() * list.length)];
  }
  const pool = list.filter((line) => line !== excludeText);
  return pool[Math.floor(Math.random() * pool.length)] || list[0];
};

/**
 * 取一句小伙伴现在该说的话。
 * @param {object} schoolStatus       getSchoolStatus() 的返回值
 * @param {object} [options]
 * @param {Date|number} [options.now] 当前时间（方便测试注入），默认 Date.now()
 * @param {string} [options.excludeText] 当前正显示的句子，换一句时传进来避免重复
 * @returns {{status:string, text:string}}
 */
export const getPetLine = (schoolStatus, { now = Date.now(), excludeText } = {}) => {
  const status = resolvePetStatus(schoolStatus);
  const hour = new Date(now).getHours();

  if (status === SCHOOL_PET_STATUS.CAN_PLAY && hour < MORNING_HOUR_CUTOFF && !excludeText) {
    const morning = SCHOOL_PET_MORNING_LINES[status];
    if (morning?.length) return { status, text: morning[0] };
  }

  let pool = SCHOOL_PET_LINES[status] || [];
  if (status === SCHOOL_PET_STATUS.CAN_PLAY && schoolStatus?.stage === SCHOOL_STAGE.PRIMARY) {
    const extra = SCHOOL_PET_PRIMARY_EXTRA_LINES[status] || [];
    if (extra.length) pool = pool.concat(extra);
  }

  return { status, text: pickRandom(pool, excludeText) };
};