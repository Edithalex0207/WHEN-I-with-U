/*
 * 像素小人的绘制 + 校验引擎。纯函数，不碰 db、不碰 React，所以衣橱页面、
 * 聊天窗挂件、礼物记录里的小缩略图、以后的 AI 设计预览都能直接共用。
 *
 * 一个小人的外观（look）是一个很小的对象：
 *   { body, hair, hairColor, eyes, eyeColor, outfit, outfitMain, outfitAccent, skin }
 * 其中 body / hair / eyes / outfit 是部件 id，其余是颜色。
 * 部件 id 先在内置部件库里找，找不到再去 customParts（用户导入的、
 * 角色自己设计的）里找；都找不到就退回默认，保证页面不会因为某个部件被
 * 删掉而画不出小人。
 *
 * customParts 的形状：{ hair: {id: part}, eyes: {...}, outfit: {...}, body: {...} }
 */

import {
  BUILTIN_PARTS,
  COLOR_GROUPS,
  DEFAULT_LOOKS,
  DOLL_H,
  DOLL_W,
  STANDARD_BODY,
} from './pixelDollParts';

export { DOLL_H, DOLL_W };

export const PART_CATEGORIES = ['hair', 'eyes', 'outfit', 'body'];

const OUTLINE_COLOR = '#33222b';
const MAX_ID_LENGTH = 32;
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype', 'standard', 'default']);
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

/* ------------------------- 颜色工具 ------------------------- */

const hexToRgb = (hex) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbToHex = (r, g, b) => (
  '#' + [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
);

const mixColor = (a, b, t) => {
  const p = hexToRgb(a);
  const q = hexToRgb(b);
  return rgbToHex(
    p[0] + (q[0] - p[0]) * t,
    p[1] + (q[1] - p[1]) * t,
    p[2] + (q[2] - p[2]) * t
  );
};

/* 往紫黑色偏的暗部，比纯黑混出来的更像像素画 */
const shade = (hex, t) => mixColor(hex, '#241622', t);

const safeColor = (value, fallback) => (
  typeof value === 'string' && HEX_COLOR.test(value) ? value : fallback
);

/* ------------------------- 调色板 ------------------------- */

export const buildBasePalette = (look) => ({
  o: OUTLINE_COLOR,
  s: look.skin,
  S: shade(look.skin, 0.14),
  h: look.hairColor,
  H: shade(look.hairColor, 0.28),
  e: look.eyeColor,
  E: shade(look.eyeColor, 0.4),
  w: '#ffffff',
  c: look.outfitMain,
  C: shade(look.outfitMain, 0.22),
  a: look.outfitAccent,
  A: shade(look.outfitAccent, 0.25),
  r: '#ff6f91',
  p: '#ffb3c1',
  n: OUTLINE_COLOR,
  y: '#ffd166',
  b: '#ffa3b6',
  m: '#8a3c46',
});

const BASE_PALETTE_KEYS = Object.keys(buildBasePalette(DEFAULT_LOOKS.user));

/* ------------------------- 部件查找 ------------------------- */

/** 某一类部件的全部可选项：内置 + 自定义。standard 身形不在其中，由引擎默认处理。 */
export const getPartPool = (category, customParts) => ({
  ...(BUILTIN_PARTS[category] || {}),
  ...((customParts && customParts[category]) || {}),
});

const findPart = (category, id, customParts) => {
  const pool = getPartPool(category, customParts);
  return has(pool, id) ? pool[id] : null;
};

/** 补全/修正一个 look：缺的字段补默认，部件 id 找不到就退回默认。 */
export const normalizeLook = (look, customParts, kind = 'user') => {
  const fallback = DEFAULT_LOOKS[kind] || DEFAULT_LOOKS.user;
  const source = look && typeof look === 'object' ? look : {};
  const next = {
    body: typeof source.body === 'string' ? source.body : fallback.body,
    hair: typeof source.hair === 'string' ? source.hair : fallback.hair,
    eyes: typeof source.eyes === 'string' ? source.eyes : fallback.eyes,
    outfit: typeof source.outfit === 'string' ? source.outfit : fallback.outfit,
    hairColor: safeColor(source.hairColor, fallback.hairColor),
    eyeColor: safeColor(source.eyeColor, fallback.eyeColor),
    outfitMain: safeColor(source.outfitMain, fallback.outfitMain),
    outfitAccent: safeColor(source.outfitAccent, fallback.outfitAccent),
    skin: safeColor(source.skin, fallback.skin),
  };

  if (next.body !== 'standard' && !findPart('body', next.body, customParts)) next.body = 'standard';
  if (!findPart('hair', next.hair, customParts)) next.hair = fallback.hair;
  if (!findPart('eyes', next.eyes, customParts)) next.eyes = fallback.eyes;
  if (!findPart('outfit', next.outfit, customParts)) next.outfit = fallback.outfit;

  return next;
};

/* ------------------------- 绘制 ------------------------- */

const drawSprite = (ctx, sprite, palette) => {
  if (!sprite || !Array.isArray(sprite.rows)) return;
  const top = sprite.y || 0;

  sprite.rows.forEach((row, rowIndex) => {
    for (let col = 0; col < row.length; col += 1) {
      const ch = row[col];
      if (ch === '.' || ch === ' ') continue;
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(col, top + rowIndex, 1, 1);
    }
  });
};

/**
 * 把 look 画进一个 ctx（画布尺寸应是 16×20）。
 * 图层顺序：发型后片 → 身体后片(尾巴) → 身体 → 衣服 → 发型前片 → 身体前片(耳朵口鼻) → 眼睛。
 */
export const drawDoll = (ctx, look, customParts, kind = 'user') => {
  ctx.clearRect(0, 0, DOLL_W, DOLL_H);

  const safeLook = normalizeLook(look, customParts, kind);
  const body = safeLook.body === 'standard' ? null : findPart('body', safeLook.body, customParts);
  const hair = findPart('hair', safeLook.hair, customParts);
  const eyes = findPart('eyes', safeLook.eyes, customParts);
  const outfit = findPart('outfit', safeLook.outfit, customParts);

  const base = buildBasePalette(safeLook);
  const withPart = (part) => (
    part && part.palette ? { ...base, ...part.palette } : base
  );
  const bodyPalette = withPart(body);

  const showHair = !(body && body.noHair);
  const showOutfit = !(body && body.noOutfit);

  if (showHair && hair && hair.back) drawSprite(ctx, hair.back, withPart(hair));
  if (body && body.back) drawSprite(ctx, body.back, bodyPalette);
  drawSprite(ctx, (body && body.base) || STANDARD_BODY, bodyPalette);
  if (showOutfit && outfit) drawSprite(ctx, outfit, withPart(outfit));
  if (showHair && hair && hair.front) drawSprite(ctx, hair.front, withPart(hair));
  if (body && body.front) drawSprite(ctx, body.front, bodyPalette);
  if (eyes) drawSprite(ctx, eyes, withPart(eyes));
};

export const renderDollToCanvas = (canvas, look, customParts, kind = 'user') => {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  drawDoll(ctx, look, customParts, kind);
};

/* ------------------------- 礼物 ------------------------- */

/**
 * 一件礼物就是衣橱里的一个选择：
 *   部件类： { category: 'hair' | 'eyes' | 'outfit', id }
 *   配色类： { category: 'color', key: 'hairColor' | 'outfitMain' | 'outfitAccent' | 'skin', value }
 * 返回穿上之后的新 look，不修改传入的对象。
 */
export const applyGiftToLook = (look, gift, customParts, kind = 'user') => {
  const next = { ...normalizeLook(look, customParts, kind) };
  if (!gift) return next;

  if (gift.category === 'color') {
    if (has(COLOR_GROUPS, gift.key) && typeof gift.value === 'string' && HEX_COLOR.test(gift.value)) {
      next[gift.key] = gift.value;
    }
    return next;
  }

  if (['hair', 'eyes', 'outfit'].includes(gift.category) && findPart(gift.category, gift.id, customParts)) {
    next[gift.category] = gift.id;
  }
  return next;
};

/** 给 UI 用的礼物名称，比如"发型 · 双马尾" */
export const describeGift = (gift, customParts) => {
  if (!gift) return '';
  if (gift.category === 'color') {
    return has(COLOR_GROUPS, gift.key) ? COLOR_GROUPS[gift.key].label : '配色';
  }
  const labels = { hair: '发型', eyes: '眼睛', outfit: '衣着' };
  const part = findPart(gift.category, gift.id, customParts);
  return `${labels[gift.category] || ''} · ${(part && part.name) || gift.id}`;
};

/* ------------------------- 校验 ------------------------- */

const validateSprite = (sprite, label, allowedChars) => {
  if (!sprite || typeof sprite !== 'object' || !Array.isArray(sprite.rows)) {
    return `${label} 缺少 rows 数组`;
  }
  const top = sprite.y === undefined ? 0 : sprite.y;
  if (!Number.isInteger(top) || top < 0) return `${label} 的 y 必须是 0 以上的整数`;
  if (sprite.rows.length === 0) return `${label} 的 rows 不能是空的`;
  if (top + sprite.rows.length > DOLL_H) {
    return `${label} 超出 ${DOLL_H} 行高度（y + 行数 = ${top + sprite.rows.length}）`;
  }

  for (let i = 0; i < sprite.rows.length; i += 1) {
    const row = sprite.rows[i];
    if (typeof row !== 'string') return `${label} 第 ${i + 1} 行不是字符串`;
    if (row.length > DOLL_W) return `${label} 第 ${i + 1} 行有 ${row.length} 个字符，最多 ${DOLL_W}`;
    for (const ch of row) {
      if (ch !== '.' && ch !== ' ' && !allowedChars.has(ch)) {
        return `${label} 第 ${i + 1} 行用了没定义的颜色字符「${ch}」，请在 palette 里补上`;
      }
    }
  }
  return null;
};

const validatePalette = (palette) => {
  if (palette === undefined) return null;
  if (!palette || typeof palette !== 'object' || Array.isArray(palette)) return 'palette 必须是对象';
  for (const [key, value] of Object.entries(palette)) {
    if (key.length !== 1) return `palette 的键必须是单个字符，「${key}」不行`;
    if (key === '.' || key === ' ') return 'palette 不能定义 . 或空格，它们表示透明';
    if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
      return `palette「${key}」的颜色必须是 #rgb 或 #rrggbb`;
    }
  }
  return null;
};

/**
 * 校验一份"部件数据"：用户粘贴导入的 JSON、AI 设计出来的小人，都先过这一道。
 * 通过返回 null，不通过返回一句能直接展示给用户看的中文原因。
 *
 * 期望的形状：{ category, id, name?, palette?, ...该类部件自己的字段 }
 */
export const validatePartData = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '数据必须是一个对象';

  const { category, id } = data;
  if (!PART_CATEGORIES.includes(category)) return 'category 必须是 hair / eyes / outfit / body 之一';
  if (typeof id !== 'string' || !id.trim()) return '缺少 id';
  if (id.length > MAX_ID_LENGTH) return `id 最长 ${MAX_ID_LENGTH} 个字符`;
  if (RESERVED_IDS.has(id)) return `id「${id}」是保留字，换一个`;
  if (data.name !== undefined && (typeof data.name !== 'string' || data.name.length > 16)) {
    return 'name 必须是不超过 16 个字的文字';
  }

  const paletteError = validatePalette(data.palette);
  if (paletteError) return paletteError;

  const allowed = new Set([...BASE_PALETTE_KEYS, ...Object.keys(data.palette || {})]);

  if (category === 'eyes' || category === 'outfit') {
    return validateSprite(data, category, allowed);
  }

  if (category === 'hair') {
    if (!data.front && !data.back) return 'hair 至少要有 front 或 back';
    return (data.back && validateSprite(data.back, 'back', allowed))
      || (data.front && validateSprite(data.front, 'front', allowed))
      || null;
  }

  if (!data.base && !data.back && !data.front) return 'body 至少要有 base、back、front 之一';
  return (data.base && validateSprite(data.base, 'base', allowed))
    || (data.back && validateSprite(data.back, 'back', allowed))
    || (data.front && validateSprite(data.front, 'front', allowed))
    || null;
};

/** 校验通过后，把部件数据整理成可以存进 customParts[category][id] 的样子。 */
export const toStoredPart = (data) => {
  const { category, id, ...rest } = data;
  const stored = { ...rest, name: (rest.name || id).slice(0, 16) };
  return { category, id, part: stored };
};

/**
 * 把一个"非标准身形"附带的建议外观（肤色、眼睛、衣服）取出来，
 * 选用这个身形时一并套到 look 上；没有就返回空对象。
 */
export const getBodyLookHint = (bodyId, customParts) => {
  const body = findPart('body', bodyId, customParts);
  if (!body || !body.lookHint || typeof body.lookHint !== 'object') return {};
  const hint = {};
  ['eyes', 'outfit'].forEach((key) => {
    if (typeof body.lookHint[key] === 'string') hint[key] = body.lookHint[key];
  });
  ['skin', 'outfitMain', 'outfitAccent', 'hairColor', 'eyeColor'].forEach((key) => {
    if (HEX_COLOR.test(body.lookHint[key] || '')) hint[key] = body.lookHint[key];
  });
  return hint;
};