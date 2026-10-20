/**
 * marblesData.js
 *
 * 「小伙伴弹珠」(祖玛式) 小游戏的静态配置：三关的轨道/难度参数、
 * 糖果色定义、通关/全通关的心心+心情+饱食度换算表、每日奖励次数上限。
 *
 * 纯数据，不碰 Dexie、不碰 React、不碰 canvas —— 角色分工照抄
 * catchData.js（玩法参数全部集中在这一个文件，想重新平衡只改这里）。
 *
 * 2026-10-20：这一轮通关/全通关的心心数值全部是占位值（用户还没实玩三关，
 * 等正式玩过之后再回来调），其它文件都不直接依赖这里的具体数字，只改这
 * 一处即可重新平衡。
 */

export const CANDY_KEYS = ['heart', 'sky', 'mint', 'butter', 'lav'];

// 糖果色的三段渐变（浅/中/深），画珠子用。跟 companion-marbles.html 预览里的配色保持一致。
export const CANDY_COLORS = {
  heart: { l: '#FFD6DE', m: '#FF8FA6', d: '#E4607F' },
  sky: { l: '#D3EEFF', m: '#6CBDF2', d: '#3C93D6' },
  mint: { l: '#D6F8E6', m: '#6FD9A6', d: '#35B07A' },
  butter: { l: '#FFF3C4', m: '#FFD25E', d: '#F0A92B' },
  lav: { l: '#E8DEFF', m: '#B398F5', d: '#8466DA' },
};

/**
 * 三关固定配置：颜色数 / 链子长度 / 链子推进速度 / 轨道形状。
 * track 对应 marblesEngine.js 里 TRACKS 的 key（spiral / square / snake）。
 */
export const LEVELS = [
  {
    key: 'spiral', colors: 3, count: 34, speed: 20, track: 'spiral', name: '3 种颜色，圆形螺旋，链子慢慢爬',
  },
  {
    key: 'square', colors: 4, count: 46, speed: 27, track: 'square', name: '4 种颜色，方形螺旋，链子更长也更快',
  },
  {
    key: 'snake', colors: 5, count: 58, speed: 34, track: 'snake', name: '5 种颜色，蛇形轨道，最长最快',
  },
];

/* ------------------------------------------------------------------ *
 * 通关奖励（占位数值，之后调整只改这里）
 *
 * 每过一关：mood/satiety/hearts 跟 catchData.js 的 TIERS 同一量级，
 * 随关卡难度递增。全通关（三关都清空过一次）额外再给一份奖励，
 * 这份奖励不占用下面的「每日名额」，一天只会发一次。
 * ------------------------------------------------------------------ */

export const LEVEL_CLEAR_EFFECTS = [
  { mood: 8, satiety: -2, hearts: 1 }, // 第1关
  { mood: 12, satiety: -3, hearts: 2 }, // 第2关
  { mood: 16, satiety: -4, hearts: 3 }, // 第3关
];

export const FULL_CLEAR_BONUS_EFFECT = { mood: 20, satiety: -3, hearts: 3 };

/** 每日能拿「通关奖励」(不含全通关额外奖励) 的次数上限 —— 跟接东西小游戏用同一个数字，但各自独立计数。 */
export const DAILY_REWARD_LIMIT = 3;