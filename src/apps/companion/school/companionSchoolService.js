/*
 * companionSchoolService.js —— 「上学」的学籍层：入学、升班、学校相册，
 * 以及"今天还能不能做题"的判断（每日次数 + 冷却）。
 *
 * 【这个文件管什么、不管什么】
 * - 管：companionSchool（学籍，一个小伙伴一行）、companionSchoolAlbum（相册）。
 * - 不管：抽题、结算、错题本、自己出的题——那些在 companionSchoolQuizService.js
 *   里，它会 import 这里的 getSchoolStatus / getDayKey / SchoolError。
 *   方向只有一个：QuizService -> SchoolService，没有反向 import。
 *
 * 【每日次数和冷却】
 * 计数直接记在学籍行上（不建索引）：dayKey（最后一次做题的本地日期）、
 * daySets（那一天做了几组）、lastSetAt（最后一次做完的时间戳）。
 * 读的时候如果 dayKey 不是今天，就当成今天 0 组，不需要任何定时任务清零。
 * 判断顺序：没入学 -> 今天次数用完 -> 冷却中。次数用完时优先报"次数用完"，
 * 因为第 3 组做完后冷却也在走，但对用户来说"明天再来"才是有用的信息。
 *
 * 【升班】累计做满 SCHOOL_LIMITS.PROMOTE_MIN_SETS 组（stageSets）才允许；
 * 升班后 stageSets 清零，重新给小学算。小学是最后一个学段，不能再升。
 *
 * 完全新建的一套，不 import companionService.js（避免循环依赖，跟
 * companionClawService.js 同一个原因），凡是要写日志的地方直接操作
 * db.companionLogs。
 */

import db from '../../../db';
import {
  SCHOOL_STAGE,
  SCHOOL_LIMITS,
  ALBUM_TYPE,
  findSchoolClass,
  findSchoolTeacher,
} from './companionSchoolData';

/* ---------------- 错误类型：带 code，方便界面按原因给不同提示 ---------------- */
/*
 * code 取值：
 *   'no_companion'      小伙伴不存在
 *   'not_enrolled'      还没办理入学
 *   'already_enrolled'  已经入学了
 *   'bad_class'         班级不存在
 *   'bad_teacher'       老师不存在
 *   'bad_photo'         相册图片格式不对
 *   'daily_limit'       今天的次数用完了
 *   'cooldown'          冷却中
 *   'not_ready'         升班条件还没满足
 *   'final_stage'       已经是最后一个学段
 *   'no_questions'      题库里没有可抽的题
 *   'bad_question'      自己出的题格式不对
 *   'too_many'          自己出的题太多了
 */
export class SchoolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SchoolError';
    this.code = code;
  }
}

/* ---------------- 日期工具（本地时区） ---------------- */
const pad2 = (n) => String(n).padStart(2, '0');

/** 本地日期字符串 'YYYY-MM-DD' */
export const getDayKey = (timestamp = Date.now()) => {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/** 明天本地 00:00 的时间戳 */
const getNextDayStart = (timestamp) => {
  const d = new Date(timestamp);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
};

/* ---------------- 学籍读取 ---------------- */
export const getSchoolRecord = async (companionId) => {
  const row = await db.companionSchool.where('companionId').equals(companionId).first();
  return row || null;
};

/**
 * 给界面一次性取回"学校现在是什么状态"。
 *
 * 返回：
 * {
 *   enrolled, stage, classId, teacherId, record,
 *   setsToday, setsLeft, canPlay,
 *   reason,            // canPlay=false 时：'not_enrolled' | 'daily_limit' | 'cooldown'，否则 null
 *   nextAvailableAt,   // canPlay=false 且不是没入学时：下次能做题的时间戳，否则 null
 *   promote: { done, need, canPromote, isFinalStage },
 * }
 */
export const getSchoolStatus = async (companionId, now = Date.now()) => {
  const record = await getSchoolRecord(companionId);

  if (!record) {
    return {
      enrolled: false,
      stage: null,
      classId: null,
      teacherId: null,
      record: null,
      setsToday: 0,
      setsLeft: 0,
      canPlay: false,
      reason: 'not_enrolled',
      nextAvailableAt: null,
      promote: { done: 0, need: SCHOOL_LIMITS.PROMOTE_MIN_SETS, canPromote: false, isFinalStage: false },
    };
  }

  const todayKey = getDayKey(now);
  const setsToday = record.dayKey === todayKey ? (record.daySets || 0) : 0;
  const setsLeft = Math.max(0, SCHOOL_LIMITS.DAILY_SET_LIMIT - setsToday);
  const cooldownEnd = (record.lastSetAt || 0) + SCHOOL_LIMITS.SET_COOLDOWN_MINUTES * 60 * 1000;

  let canPlay = true;
  let reason = null;
  let nextAvailableAt = null;

  if (setsLeft <= 0) {
    canPlay = false;
    reason = 'daily_limit';
    nextAvailableAt = getNextDayStart(now);
  } else if (now < cooldownEnd) {
    canPlay = false;
    reason = 'cooldown';
    nextAvailableAt = cooldownEnd;
  }

  const isFinalStage = record.stage === SCHOOL_STAGE.PRIMARY;
  const done = record.stageSets || 0;

  return {
    enrolled: true,
    stage: record.stage,
    classId: record.classId,
    teacherId: record.teacherId,
    record,
    setsToday,
    setsLeft,
    canPlay,
    reason,
    nextAvailableAt,
    promote: {
      done,
      need: SCHOOL_LIMITS.PROMOTE_MIN_SETS,
      canPromote: !isFinalStage && done >= SCHOOL_LIMITS.PROMOTE_MIN_SETS,
      isFinalStage,
    },
  };
};

/* ---------------- 学校相册 ---------------- */
const isImageDataUrl = (value) => typeof value === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);

/**
 * 往相册里放一张纪念卡。
 * @param {number} companionId
 * @param {{type:string, title:string, image:string, meta?:object}} photo
 *        image 必须是 'data:image/...;base64,...' 的 dataURL（压缩后的 jpeg）
 */
export const addAlbumPhoto = async (companionId, { type, title, image, meta = null }) => {
  if (!Object.values(ALBUM_TYPE).includes(type)) {
    throw new SchoolError('bad_photo', '相册类型不对');
  }
  if (!isImageDataUrl(image)) {
    throw new SchoolError('bad_photo', '图片格式不对');
  }
  const row = {
    companionId,
    type,
    title: String(title || '').slice(0, 40),
    image,
    meta,
    createdAt: Date.now(),
  };
  const id = await db.companionSchoolAlbum.add(row);
  return { ...row, id };
};

/** 最新的在前 */
export const getAlbum = async (companionId) => {
  const rows = await db.companionSchoolAlbum.where('companionId').equals(companionId).toArray();
  return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

export const deleteAlbumPhoto = async (photoId) => {
  await db.companionSchoolAlbum.delete(photoId);
};

/* ---------------- 日志 ---------------- */
const addLog = (companionId, actionType, content, timestamp) => db.companionLogs.add({
  companionId,
  logType: 'user_action',
  actionType,
  content,
  timestamp,
});

/* ---------------- 办理入学 ---------------- */
/**
 * 入学仪式的最后一步调用：选好班级、老师、拍好照片之后一次性落库。
 *
 * @param {number} companionId
 * @param {{classId:string, teacherId:string, photo?:{image:string, title?:string}|null}} options
 *        photo 可以不给（比如生成图片失败时先入学，以后补）。
 * @returns {{record:object, album:(object|null)}}
 */
export const enrollCompanion = async (companionId, { classId, teacherId, photo = null } = {}) => {
  const companion = await db.companions.get(companionId);
  if (!companion) throw new SchoolError('no_companion', '小伙伴不存在');

  const schoolClass = findSchoolClass(classId);
  if (!schoolClass) throw new SchoolError('bad_class', '班级不存在');
  const teacher = findSchoolTeacher(teacherId);
  if (!teacher) throw new SchoolError('bad_teacher', '老师不存在');

  // 先校验图片再写库，避免入学写进去了、图片格式错误又抛异常，留下半截数据。
  if (photo && !isImageDataUrl(photo.image)) {
    throw new SchoolError('bad_photo', '图片格式不对');
  }

  const now = Date.now();
  let record = null;
  let album = null;

  await db.transaction(
    'rw',
    [db.companionSchool, db.companionSchoolAlbum, db.companionLogs],
    async () => {
      const existing = await getSchoolRecord(companionId);
      if (existing) throw new SchoolError('already_enrolled', '已经入学啦');

      const row = {
        companionId,
        stage: SCHOOL_STAGE.KINDERGARTEN,
        classId: schoolClass.id,
        teacherId: teacher.id,
        enrolledAt: now,
        promotedAt: null,
        stageSets: 0,
        dayKey: null,
        daySets: 0,
        lastSetAt: 0,
      };
      const id = await db.companionSchool.add(row);
      record = { ...row, id };

      if (photo) {
        album = await addAlbumPhoto(companionId, {
          type: ALBUM_TYPE.ENROLL,
          title: photo.title || '入学纪念卡',
          image: photo.image,
          meta: { classId: schoolClass.id, teacherId: teacher.id, stage: SCHOOL_STAGE.KINDERGARTEN },
        });
      }

      await addLog(
        companionId,
        'school_enroll',
        `入学啦！进了「${schoolClass.name}」，班主任是${teacher.name}。`,
        now,
      );
    },
  );

  return { record, album };
};

/* ---------------- 升班（幼儿园 -> 小学） ---------------- */
/**
 * 手动办理升班。条件：还在幼儿园 + 本学段累计做满 PROMOTE_MIN_SETS 组。
 * 班级和老师保持不变（小伙伴还是原来的班和老师，只是学段变了）。
 *
 * @param {number} companionId
 * @param {{photo?:{image:string, title?:string}|null}} options
 * @returns {{record:object, album:(object|null)}}
 */
export const promoteCompanion = async (companionId, { photo = null } = {}) => {
  if (photo && !isImageDataUrl(photo.image)) {
    throw new SchoolError('bad_photo', '图片格式不对');
  }

  const now = Date.now();
  let record = null;
  let album = null;

  await db.transaction(
    'rw',
    [db.companionSchool, db.companionSchoolAlbum, db.companionLogs],
    async () => {
      const current = await getSchoolRecord(companionId);
      if (!current) throw new SchoolError('not_enrolled', '还没有办理入学');
      if (current.stage === SCHOOL_STAGE.PRIMARY) {
        throw new SchoolError('final_stage', '已经是小学啦，没有更高的班了');
      }
      if ((current.stageSets || 0) < SCHOOL_LIMITS.PROMOTE_MIN_SETS) {
        throw new SchoolError(
          'not_ready',
          `还需要再做 ${SCHOOL_LIMITS.PROMOTE_MIN_SETS - (current.stageSets || 0)} 组题才能升班`,
        );
      }

      const changes = {
        stage: SCHOOL_STAGE.PRIMARY,
        promotedAt: now,
        stageSets: 0,
      };
      await db.companionSchool.update(current.id, changes);
      record = { ...current, ...changes };

      if (photo) {
        album = await addAlbumPhoto(companionId, {
          type: ALBUM_TYPE.PROMOTE,
          title: photo.title || '升班纪念卡',
          image: photo.image,
          meta: { classId: current.classId, teacherId: current.teacherId, stage: SCHOOL_STAGE.PRIMARY },
        });
      }

      await addLog(companionId, 'school_promote', '升班啦！从幼儿园升到了小学。', now);
    },
  );

  return { record, album };
};