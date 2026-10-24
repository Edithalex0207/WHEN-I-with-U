/*
 * 像素小人的"内置部件库"——纯数据，不 import 任何东西。
 *
 * 小人是 16×20 的字符行精灵：每个字符代表一个像素，'.' 是透明。字符通过
 * 调色板映射到颜色（见 pixelDollEngine.js 里的 buildBasePalette）：
 *
 *   o 描边   s 皮肤   S 皮肤暗部   h 头发   H 头发暗部
 *   e 眼睛   E 眼睛暗部   w 白色   c 衣服主色   C 主色暗部
 *   a 点缀色   A 点缀暗部   r 发饰   p 粉色   n 深色(鼻子)
 *   y 黄色   b 腮红   m 嘴巴
 *
 * 一个部件可以带自己的 palette 新增/覆盖字符（例如帽子颜色），用户导入
 * 和 AI 自己设计的部件走的是同一套格式，所以这个文件也是它们的参考样例。
 *
 * 每种部件的结构：
 *   hair   { name, front?: {y, rows}, back?: {y, rows}, palette? }
 *   eyes   { name, y, rows, palette? }
 *   outfit { name, y, rows, palette? }
 *   body   { name, base?, back?, front?, palette?, noHair?, noOutfit? }
 *          base 缺省时用标准身体；back 画在身体后面（尾巴），front 画在
 *          身体前面（耳朵、口鼻）；noHair / noOutfit 为 true 表示这个
 *          身体不戴发型 / 不穿衣服（比如幽灵）。
 */

export const DOLL_W = 16;
export const DOLL_H = 20;

/* 标准身体（头 + 脖子 + 躯干 + 脚），从第 2 行开始画 */
export const STANDARD_BODY = {
  y: 2,
  rows: [
    '....oooooooo....',
    '...osssssssso...',
    '..osssssssssso..',
    '..osssssssssso..',
    '..osssssssssso..',
    '..osssssssssso..',
    '..osssssssssso..',
    '..osssssssssso..',
    '...osssssssso...',
    '....oooooooo....',
    '....osSSSSso....',
    '...osssssssso...',
    '..osssssssssso..',
    '..osssssssssso..',
    '...osssssssso...',
    '....oss..sso....',
    '....ooo..ooo....',
  ],
};

export const BUILTIN_PARTS = {
  hair: {
    bob: {
      name: '波波头',
      front: { y: 1, rows: [
        '....oooooooo....',
        '...ohhhhhhhho...',
        '..ohhhhhhhhhho..',
        '..ohhhhHhhhhho..',
        '..ohhHh..hHhho..',
        '..oh........ho..',
        '..oh........ho..',
        '..oH........Ho..',
      ] },
    },
    long: {
      name: '长直发',
      back: { y: 4, rows: [
        '.ohhhhhhhhhhhho.',
        '.ohhhhhhhhhhhho.',
        '.ohhhhhhhhhhhho.',
        '.ohhhhhhhhhhhho.',
        '.ohhhhhhhhhhhho.',
        '.ohhhhhhhhhhhho.',
        '.ohhhhhhhhhhhho.',
        '.ohhhhhhhhhhhho.',
        '.ohhhhhhhhhhhho.',
        '.oHhhhhhhhhhhHo.',
        '.oHhHhHhHhHhHHo.',
        '..oooooooooooo..',
      ] },
      front: { y: 1, rows: [
        '....oooooooo....',
        '...ohhhhhhhho...',
        '..ohhhhhhhhhho..',
        '..ohhhhhhhhHho..',
        '..ohhhHh..hhho..',
        '..oh........ho..',
        '..oh........ho..',
        '..oh........ho..',
        '..oH........Ho..',
        '..oH........Ho..',
      ] },
    },
    bun: {
      name: '丸子头',
      front: { y: 0, rows: [
        '......oooo......',
        '.....ohhHho.....',
        '...oohhhhhhoo...',
        '..ohhhhhhhhhho..',
        '..ohHhhhhhhHho..',
        '..ohh......hho..',
        '..oh........ho..',
        '..oh........ho..',
      ] },
    },
    twin: {
      name: '双马尾',
      back: { y: 3, rows: [
        '.oo..........oo.',
        'ohho........ohho',
        'ohho........ohho',
        'ohHo........oHho',
        'ohho........ohho',
        'ohHo........oHho',
        'ohho........ohho',
        '.oHo........oHo.',
        '..o..........o..',
      ] },
      front: { y: 1, rows: [
        '....oooooooo....',
        '...ohhhhhhhho...',
        'rrohhhhhhhhhhorr',
        'rrohhhhHhhhhhorr',
        '..ohhHh..hHhho..',
        '..oh........ho..',
        '..oh........ho..',
      ] },
    },
    messy: {
      name: '呆毛',
      front: { y: 0, rows: [
        '........oo......',
        '....ooooohoo....',
        '...ohhhhhhhho...',
        '..ohhhhhhhhhho..',
        '..ohhHhhhhHhho..',
        '..ohHh.hh.hHho..',
        '..oh........ho..',
        '..oH........Ho..',
      ] },
    },
    short: {
      name: '清爽短发',
      front: { y: 1, rows: [
        '....oooooooo....',
        '...ohhhhhhhho...',
        '..ohhhhhhhhhho..',
        '..ohHhHhHhHhho..',
        '..oh.h....h.ho..',
      ] },
    },
  },

  eyes: {
    round: { name: '圆眼', y: 6, rows: ['.....we..we.....', '.....ee..ee.....'] },
    big: { name: '闪亮大眼', y: 6, rows: ['.....we..we.....', '.....ee..ee.....', '.....eE..eE.....'] },
    cat: { name: '猫猫眼', y: 6, rows: ['....e......e....', '.....ee..ee.....'] },
    dot: { name: '豆豆眼', y: 6, rows: ['......e..e......', '......e..e......'] },
    sleepy: { name: '眯眯眼', y: 7, rows: ['.....oo..oo.....'] },
  },

  outfit: {
    tee: { name: '短袖T恤', y: 12, rows: [
      '....occsscco....',
      '...occcccccco...',
      '..osccccccccso..',
      '..osccccccccso..',
      '...oaaaaaaaao...',
    ] },
    hoodie: { name: '卫衣', y: 12, rows: [
      '....oCccccCo....',
      '...occcaaccco...',
      '..occcccccccco..',
      '..occcaaaaccco..',
      '...oCCCCCCCCo...',
      '....oAA..AAo....',
    ] },
    dress: { name: '连衣裙', y: 12, rows: [
      '....occcccco....',
      '...occcaaccco...',
      '..osccccccccso..',
      '..occcccccccco..',
      '.ocCcCcCcCcCcCo.',
    ] },
    overall: { name: '背带裤', y: 12, rows: [
      '....oaaaaaao....',
      '...oaccccccao...',
      '..oaccccccccao..',
      '..osccCccCccso..',
      '...occcccccco...',
      '....occ..cco....',
    ] },
    stripe: { name: '条纹毛衣', y: 12, rows: [
      '....occcccco....',
      '...oaaaaaaaao...',
      '..occcccccccco..',
      '..oaaaaaaaaaao..',
      '...occcccccco...',
      '....oAA..AAo....',
    ] },
  },

  /*
   * 非标准身形。standard（标准身体）不在这里，由引擎当作默认值处理。
   * 这三个同时也是"让 AI 设计自己的小人"时放进提示词的参考样例。
   * lookHint 是配这个身体比较合适的肤色/眼睛/衣服，选用时一并套上。
   */
  body: {
    fox: {
      name: '小狐狸',
      lookHint: { skin: '#f2a45c', eyes: 'cat', outfit: 'overall', outfitMain: '#5b8def', outfitAccent: '#f4efe6' },
      noHair: true,
      back: { y: 8, rows: [
        '.............oo.',
        '............owwo',
        '............owwo',
        '............osso',
        '.............sso',
        '.............sso',
        '............osso',
        '............ooo.',
      ] },
      front: { y: 0, rows: [
        '...oo......oo...',
        '..ospo....opso..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '.....wwnnww.....',
      ] },
    },
    ghost: {
      name: '小幽灵',
      lookHint: { skin: '#f3f0ff', eyes: 'big' },
      noHair: true,
      noOutfit: true,
      base: { y: 1, rows: [
        '....oooooooo....',
        '...osssssssso...',
        '..osssssssssso..',
        '..osssssssssso..',
        '..osssssssssso..',
        '..osssssssssso..',
        '..osssssssssso..',
        '..osssssssssso..',
        '..osssssssssso..',
        '.osssssssssssso.',
        '.osssssssssssso.',
        '.osssssssssssso.',
        '.osssssssssssso.',
        '.osssssssssssso.',
        '.osSSSSSSSSSSso.',
        '.osssssssssssso.',
        '.osssssssssssso.',
        '.oo.oo.oo.oo.oo.',
      ] },
    },
    blob: {
      name: '星星团子',
      lookHint: { skin: '#ffd9e2', eyes: 'dot' },
      noHair: true,
      noOutfit: true,
      base: { y: 0, rows: [
        '......oyyo......',
        '.......oo.......',
        '....oooooooo....',
        '..oossssssssoo..',
        '.osssssssssssso.',
        '.osssssssssssso.',
        '.osssssssssssso.',
        '.osssssssssssso.',
        '.osssssssssssso.',
        '.osssssssssssso.',
        '.osssssssssssso.',
        '.osssssssssssso.',
        '.osssssssssssso.',
        '.osssssssssssso.',
        '..oossssssssoo..',
        '...oSSSSSSSSo...',
        '...oss....sso...',
        '...ooo....ooo...',
      ] },
    },
  },
};

/* "配色"类礼物的色板：key 是 look 里对应的字段名 */
export const COLOR_GROUPS = {
  hairColor: { label: '发色', colors: ['#4a3328', '#2e2433', '#f2c46d', '#e86b5a', '#ff9ec4', '#8fb8ff', '#a8e6cf', '#8a5cd6', '#f4eee6'] },
  outfitMain: { label: '衣服主色', colors: ['#ff8fab', '#7fb8ff', '#ffd166', '#8fd694', '#b69cff', '#fbf6ee', '#ff9f5a', '#5c6b8a'] },
  outfitAccent: { label: '点缀色', colors: ['#fff1f5', '#f4efe6', '#ffd166', '#7fb8ff', '#ff8fab', '#33222b'] },
  skin: { label: '肤色', colors: ['#ffe6d5', '#fcd5b8', '#f1c09a', '#d9a17a', '#b77a56', '#8a573b'] },
};

/* 两个初始形象。user 是你，char 是角色（角色可以之后自己设计覆盖） */
export const DEFAULT_LOOKS = {
  user: {
    body: 'standard',
    hair: 'bob',
    hairColor: '#4a3328',
    eyes: 'round',
    eyeColor: '#33222b',
    outfit: 'hoodie',
    outfitMain: '#7fb8ff',
    outfitAccent: '#f4efe6',
    skin: '#ffe0cc',
  },
  char: {
    body: 'standard',
    hair: 'twin',
    hairColor: '#8a5cd6',
    eyes: 'big',
    eyeColor: '#33222b',
    outfit: 'dress',
    outfitMain: '#ff8fab',
    outfitAccent: '#fff1f5',
    skin: '#f1c09a',
  },
};