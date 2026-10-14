// src/apps/margin-notes/library/readerTheme.js
//
// 阅读页的主题、字体、字号档位等常量，以及把「阅读设置」换算成实际排版数值的纯函数。
// 数值全部照设计稿 Reader.dc.html。本文件不依赖 React 和数据库，可以单独测试。

export const READER_THEMES = {
  paper: {
    label: '纸白', bg: '#FAFAF7', fg: '#23262B', sub: '#7A7F87', panel: '#FFFFFF',
    line: '#E3E4E0', chip: '#F0F1EE', sel: '#E4EAF0', selFg: '#2F4E6F',
    accent: '#2F4E6F', onAccent: '#FFFFFF', tick: '#C9CAC4',
    hl: 'rgba(238, 196, 72, 0.5)', glowA: 'rgba(143, 180, 217, 0.26)', glowB: 'rgba(238, 196, 72, 0.18)',
  },
  warm: {
    label: '米黄', bg: '#F1E7CF', fg: '#3B3022', sub: '#8B7C62', panel: '#F8F1E0',
    line: '#DDD0B4', chip: '#E8DCC0', sel: '#E0CFA6', selFg: '#5A3E22',
    accent: '#6B4A2B', onAccent: '#FFFFFF', tick: '#C9B995',
    hl: 'rgba(226, 160, 60, 0.38)', glowA: 'rgba(226, 160, 60, 0.22)', glowB: 'rgba(190, 120, 80, 0.14)',
  },
  mist: {
    label: '雾绿', bg: '#DCE6DA', fg: '#232F27', sub: '#6A7B70', panel: '#E8F0E6',
    line: '#C4D3C3', chip: '#CFDCCD', sel: '#BBD0BA', selFg: '#2C5340',
    accent: '#35604A', onAccent: '#FFFFFF', tick: '#A9BCA8',
    hl: 'rgba(255, 214, 102, 0.55)', glowA: 'rgba(120, 180, 140, 0.25)', glowB: 'rgba(255, 214, 102, 0.16)',
  },
  night: {
    label: '夜间', bg: '#14171B', fg: '#C4C9CF', sub: '#7C838C', panel: '#1D2126',
    line: '#2C3238', chip: '#262B31', sel: '#2B3947', selFg: '#A9C8E8',
    accent: '#8FB4D9', onAccent: '#14171B', tick: '#444B53',
    hl: 'rgba(143, 180, 217, 0.28)', glowA: 'rgba(143, 180, 217, 0.12)', glowB: 'rgba(150, 120, 200, 0.10)',
  },
};

export const READER_FONTS = {
  song: { label: '宋体', stack: "'Noto Serif SC', 'Songti SC', serif", sample: '字' },
  hei: { label: '黑体', stack: "'Noto Sans SC', 'PingFang SC', sans-serif", sample: '字' },
  kai: { label: '文楷', stack: "'LXGW WenKai TC', 'Kaiti SC', 'KaiTi', serif", sample: '字' },
  lexend: { label: 'Lexend', stack: "'Lexend', 'Noto Sans SC', 'PingFang SC', sans-serif", sample: 'Aa' },
  atk: { label: 'Atkinson', stack: "'Atkinson Hyperlegible', 'Noto Sans SC', 'PingFang SC', sans-serif", sample: 'Aa' },
  lat: { label: 'Literata', stack: "'Literata', 'Noto Serif SC', serif", sample: 'Aa' },
};

// 字号七档（px）
export const FONT_LEVELS = [15, 17, 19, 21, 23, 26, 29];

export const LINE_HEIGHTS = { tight: 1.7, mid: 1.95, loose: 2.25 };
export const MARGINS = { narrow: 18, mid: 28, wide: 40 };

export const LINE_HEIGHT_OPTIONS = [
  { id: 'tight', label: '紧凑' },
  { id: 'mid', label: '适中' },
  { id: 'loose', label: '宽松' },
];
export const MARGIN_OPTIONS = [
  { id: 'narrow', label: '窄' },
  { id: 'mid', label: '中' },
  { id: 'wide', label: '宽' },
];
export const ALIGN_OPTIONS = [
  { id: 'justify', label: '两端对齐' },
  { id: 'left', label: '左对齐' },
];

// mode 现在只有 'scroll'（上下滚动），'page'（左右翻页）留到以后的切片。
export const DEFAULT_READER_SETTINGS = {
  theme: 'paper',
  font: 'song',
  level: 2,
  lh: 'mid',
  mg: 'mid',
  align: 'justify',
  spacing: false,
  bionic: false,
  focus: false,
  mode: 'scroll',
};

/**
 * 把存下来的（可能缺字段、可能被改坏的）设置整理成一份合法设置。
 */
export const normalizeReaderSettings = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const defaults = DEFAULT_READER_SETTINGS;

  const level = Number.isInteger(source.level)
    ? Math.max(0, Math.min(FONT_LEVELS.length - 1, source.level))
    : defaults.level;

  return {
    theme: Object.prototype.hasOwnProperty.call(READER_THEMES, source.theme)
      ? source.theme
      : defaults.theme,
    font: Object.prototype.hasOwnProperty.call(READER_FONTS, source.font)
      ? source.font
      : defaults.font,
    level,
    lh: Object.prototype.hasOwnProperty.call(LINE_HEIGHTS, source.lh)
      ? source.lh
      : defaults.lh,
    mg: Object.prototype.hasOwnProperty.call(MARGINS, source.mg)
      ? source.mg
      : defaults.mg,
    align: source.align === 'left' ? 'left' : 'justify',
    spacing: source.spacing === true,
    bionic: source.bionic === true,
    focus: source.focus === true,
    mode: 'scroll',
  };
};

/**
 * 文字是不是以拉丁字母为主（决定首行缩进、字距、词首加粗怎么处理）。
 * 只看开头一小段就够了。
 */
export const isMostlyLatin = (text) => {
  const sample = String(text || '').slice(0, 800);
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  const cjk = (sample.match(/[㐀-鿿぀-ヿ가-힯]/g) || []).length;
  return latin > cjk;
};

/**
 * 把设置换算成这一章实际用的排版数值。
 */
export const computeLayout = (settings, latin) => {
  const size = FONT_LEVELS[settings.level] ?? FONT_LEVELS[DEFAULT_READER_SETTINGS.level];

  return {
    sizePx: size,
    titleSize: Math.round(size * 1.5),
    paraGap: Math.round(size * 0.75),
    headGap: Math.round(size * 1.2),
    lineHeight: LINE_HEIGHTS[settings.lh],
    marginX: MARGINS[settings.mg],
    fontStack: READER_FONTS[settings.font].stack,
    textAlign: settings.align === 'justify' ? 'justify' : 'left',
    letterSpacing: settings.spacing ? (latin ? '0.05em' : '0.1em') : '0',
    wordSpacing: settings.spacing && latin ? '0.12em' : '0',
    indent: latin ? '1.2em' : '2em',
  };
};

/**
 * 章节文本拆成段落（章节里段落之间用空行分隔）。
 */
export const splitParagraphs = (text) =>
  String(text || '')
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * 词首加粗：把一个段落切成 [{ b, t }]，b 是词首要加粗的部分，t 是其余部分。
 * 每个词（连同后面的空白）一项，加粗长度取字母数的 45%（向上取整）。
 */
export const tokenizeBionic = (paragraph) => {
  const words = String(paragraph || '').match(/\S+\s*/g) || [];
  return words.map((word) => {
    const letters = word.replace(/\s+$/, '');
    const boldLength = Math.ceil(letters.length * 0.45);
    return { b: word.slice(0, boldLength), t: word.slice(boldLength) };
  });
};