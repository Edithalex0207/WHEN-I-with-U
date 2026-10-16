/*
 * companionSchoolData.js —— 「上学」功能的静态数据与常量。
 *
 * 只放不会变的东西：学段、科目、班级、老师、课程表、数值常量、
 * 各张表里枚举字段的取值。不 import 任何其它文件（连 db 都不碰），
 * 所以 service / 组件 / 题库文件都可以放心引用它，不会产生循环依赖。
 *
 * 【想改的地方】
 * - 老师头像、班级插画：把对应条目的 url 填上图片地址即可，留空字符串
 *   时界面显示内置的占位小脸 / 占位插画，不用改任何其它文件。
 * - 每天几组、冷却多久、升班要几组、奖励多少：改下面的 SCHOOL_LIMITS /
 *   SET_REWARD / MEETING_RESPONSES。
 */

/* ---------------- 学段 ---------------- */
export const SCHOOL_STAGE = {
  KINDERGARTEN: 'kindergarten',
  PRIMARY: 'primary',
};

export const SCHOOL_STAGE_LABELS = {
  [SCHOOL_STAGE.KINDERGARTEN]: '幼儿园',
  [SCHOOL_STAGE.PRIMARY]: '小学',
};

/** 预设题 id 的学段前缀：k = 幼儿园，p = 小学。例：'k-cn-007' */
export const STAGE_ID_PREFIX = {
  [SCHOOL_STAGE.KINDERGARTEN]: 'k',
  [SCHOOL_STAGE.PRIMARY]: 'p',
};

/* ---------------- 次数 / 冷却 / 升班 ---------------- */
export const SCHOOL_LIMITS = {
  QUESTIONS_PER_SET: 5, // 一组几道题
  DAILY_SET_LIMIT: 3, // 每天最多做几组
  SET_COOLDOWN_MINUTES: 30, // 每组做完后的冷却（分钟）
  PROMOTE_MIN_SETS: 20, // 本学段累计做满多少组才允许升班
};

/* ---------------- 做完一组的奖励 ---------------- */
export const SET_REWARD = {
  HEARTS_PER_CORRECT: 1, // 每答对一题得多少心心
  PERFECT_BONUS_HEARTS: 1, // 全对额外多得的心心
  MOOD_BASE: 2, // 做完一组就有的心情
  MOOD_PER_CORRECT: 1, // 每答对一题再加的心情
};

/* ---------------- 科目 ---------------- */
/*
 * id 同时是预设题 id 的中间段（'k-cn-007' 里的 cn）。
 * tone 对应界面里的配色（butter / sky / mint / heart，都是 companionPage.css
 * 里已有的色系）。
 */
export const SCHOOL_SUBJECTS = [
  { id: 'cn', label: '语文', tone: 'butter' },
  { id: 'ma', label: '数学', tone: 'sky' },
  { id: 'kn', label: '常识', tone: 'mint' },
  { id: 'en', label: '英语', tone: 'heart' },
];

/** 自己出的题可以归到这个"自定义"科目（不在预设四科里时用） */
export const CUSTOM_SUBJECT_ID = 'custom';

export function findSubject(id) {
  return SCHOOL_SUBJECTS.find((s) => s.id === id) || null;
}

/* ---------------- 题型 ---------------- */
export const QUESTION_TYPE = {
  CHOICE: 'choice', // 选择题
  JUDGE: 'judge', // 判断题
};

export const QUESTION_TYPE_LABELS = {
  [QUESTION_TYPE.CHOICE]: '选择题',
  [QUESTION_TYPE.JUDGE]: '判断题',
};

/** companionSchoolQuestions.stage 的取值：两个学段 + 通用 */
export const QUESTION_STAGE_BOTH = 'both';

/** companionSchoolQuestions.source 的取值 */
export const QUESTION_SOURCE = {
  MANUAL: 'manual',
  AI: 'ai',
};

/* ---------------- 班级 ---------------- */
/*
 * url 留空 = 用内置占位插画；填了图就显示图。
 * tone 用于卡片底色。desc 是选班级界面里的一句话介绍。
 */
export const SCHOOL_CLASSES = [
  {
    id: 'sunflower',
    name: '向日葵班',
    tone: 'butter',
    desc: '朝着太阳长大，爱笑爱闹，教室里总是暖洋洋的。',
    url: '',
  },
  {
    id: 'cloud',
    name: '云朵班',
    tone: 'sky',
    desc: '软软的，慢悠悠的，最喜欢午睡和听故事。',
    url: '',
  },
  {
    id: 'star',
    name: '小星星班',
    tone: 'butter',
    desc: '好奇宝宝聚集地，一天要问一百个为什么。',
    url: '',
  },
];

export function findSchoolClass(id) {
  return SCHOOL_CLASSES.find((c) => c.id === id) || null;
}

/* ---------------- 老师 ---------------- */
/*
 * url：老师头像，留空 = 占位小脸。
 * catchphrase：口头禅，选老师界面和老师说话时用。
 * persona：给 AI 写评语 / 三方会谈时用的性格描述（不会直接显示给用户）。
 */
export const SCHOOL_TEACHERS = [
  {
    id: 'nuannuan',
    name: '暖暖老师',
    trait: '温柔',
    tone: 'heart',
    catchphrase: '慢慢来，老师在呢。',
    persona:
      '说话轻声细语，很有耐心，先肯定孩子做得好的地方，再温和地提出一点小建议。' +
      '遇到孩子犯错不批评，会蹲下来问"发生什么了呀"。',
    url: '',
  },
  {
    id: 'aju',
    name: '阿橘老师',
    trait: '活泼',
    tone: 'butter',
    catchphrase: '来，击个掌！今天也要闪闪发光。',
    persona:
      '精力充沛，爱用夸张的语气和小感叹词，喜欢把学习变成游戏，' +
      '很会鼓励孩子，评语里常带一点幽默和小比喻。',
    url: '',
  },
  {
    id: 'momo',
    name: '墨墨老师',
    trait: '认真',
    tone: 'sky',
    catchphrase: '再想一想，答案就在附近。',
    persona:
      '做事一板一眼，观察细致，评语具体、点出真实的细节和进步，' +
      '建议明确可执行；语气平稳，偶尔流露一点不易察觉的温柔。',
    url: '',
  },
];

export function findSchoolTeacher(id) {
  return SCHOOL_TEACHERS.find((t) => t.id === id) || null;
}

/* ---------------- 课程 / 课程表 ---------------- */
/*
 * 课程表不存库：按学段 + 星期几从下面这张表里取。
 * 学科课（cn/ma/kn/en）的 tone 跟 SCHOOL_SUBJECTS 保持一致，
 * 其它课统一用 lavender（界面里的"活动课"色）。
 */
export const SCHOOL_LESSONS = {
  cn: { label: '语文', tone: 'butter', subjectId: 'cn' },
  ma: { label: '数学', tone: 'sky', subjectId: 'ma' },
  kn: { label: '常识', tone: 'mint', subjectId: 'kn' },
  en: { label: '英语', tone: 'heart', subjectId: 'en' },
  craft: { label: '手工', tone: 'lavender', subjectId: null },
  rhythm: { label: '律动', tone: 'lavender', subjectId: null },
  play: { label: '游戏', tone: 'lavender', subjectId: null },
  outdoor: { label: '户外', tone: 'lavender', subjectId: null },
  picture: { label: '绘本', tone: 'lavender', subjectId: null },
  pe: { label: '体育', tone: 'lavender', subjectId: null },
  art: { label: '美术', tone: 'lavender', subjectId: null },
  music: { label: '音乐', tone: 'lavender', subjectId: null },
};

/** 一天的三个时段（第一节、第二节、下午），课程表每天就是这三格 */
export const SCHOOL_SLOTS = [
  { id: 'am1', label: '第一节' },
  { id: 'am2', label: '第二节' },
  { id: 'pm', label: '下午' },
];

/*
 * 每个学段一张周课表：下标 0..4 = 周一..周五，每天 [第一节, 第二节, 下午]。
 * 值是 SCHOOL_LESSONS 的 key。
 */
export const SCHOOL_TIMETABLE = {
  [SCHOOL_STAGE.KINDERGARTEN]: [
    ['cn', 'en', 'play'],
    ['ma', 'cn', 'kn'],
    ['kn', 'rhythm', 'en'],
    ['ma', 'kn', 'outdoor'],
    ['craft', 'cn', 'picture'],
  ],
  [SCHOOL_STAGE.PRIMARY]: [
    ['cn', 'ma', 'pe'],
    ['ma', 'en', 'kn'],
    ['cn', 'kn', 'art'],
    ['en', 'ma', 'music'],
    ['cn', 'ma', 'picture'],
  ],
};

/** 周一..周五的表头文字 */
export const SCHOOL_WEEKDAY_LABELS = ['一', '二', '三', '四', '五'];

/**
 * 取某学段某一天的课。
 * @param {string} stage    SCHOOL_STAGE 的取值
 * @param {number} jsDay    JS 的 Date#getDay()：0 = 周日，1..5 = 周一..周五，6 = 周六
 * @returns {Array<{slotId:string, slotLabel:string, lessonId:string, label:string, tone:string, subjectId:(string|null)}>}
 *          周末返回空数组
 */
export function getDayLessons(stage, jsDay) {
  const table = SCHOOL_TIMETABLE[stage];
  if (!table || jsDay < 1 || jsDay > 5) return [];
  const day = table[jsDay - 1];
  return SCHOOL_SLOTS.map((slot, i) => {
    const lessonId = day[i];
    const lesson = SCHOOL_LESSONS[lessonId];
    return {
      slotId: slot.id,
      slotLabel: slot.label,
      lessonId,
      label: lesson.label,
      tone: lesson.tone,
      subjectId: lesson.subjectId,
    };
  });
}

/* ---------------- 三方会谈：你的回应 ---------------- */
/*
 * moodDelta 加到小伙伴心情上（service 里要 clamp 到 0–100），
 * heartsCost 是要花的心心（0 = 免费）。
 */
export const MEETING_RESPONSES = [
  { id: 'praise', label: '表扬', tone: 'butter', moodDelta: 6, heartsCost: 0 },
  { id: 'cheer', label: '鼓励', tone: 'sky', moodDelta: 4, heartsCost: 0 },
  { id: 'play', label: '带TA去玩', tone: 'mint', moodDelta: 8, heartsCost: 3 },
  { id: 'listen', label: '认真听完', tone: 'lavender', moodDelta: 2, heartsCost: 0 },
];

export function findMeetingResponse(id) {
  return MEETING_RESPONSES.find((r) => r.id === id) || null;
}

/* ---------------- 各张表里枚举字段的取值 ---------------- */

/** companionSchoolAlbum.type */
export const ALBUM_TYPE = {
  ENROLL: 'enroll', // 入学纪念卡
  PROMOTE: 'promote', // 升班纪念卡
  EVENT: 'event', // 特别活动纪念卡
};

/** companionSchoolLife.kind */
export const LIFE_KIND = {
  LESSON: 'lesson', // 今天上了什么课
  FRIEND: 'friend', // 交了什么朋友（第三期接入，meta.friendId）
  ACTIVITY: 'activity', // 日常里冒出的小活动
  EVENT: 'event', // 春游、秋游等特别活动（meta.eventId / meta.year）
};

/** companionSchoolReports.kind */
export const REPORT_KIND = {
  WEEKLY: 'weekly', // 周评语
  MEETING: 'meeting', // 三方会谈
};