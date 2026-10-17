/*
 * SchoolArt.jsx —— 「上学」各界面共用的小图形：占位小脸、老师头像、
 * 班级插画，以及几个内联 SVG 小图标。
 *
 * 【url 留位】
 * - TeacherAvatar：teacher.url 有值就显示这张图，留空就显示占位小脸（颜色
 *   跟着老师的 tone 走）。
 * - ClassArt：schoolClass.url 有值就显示这张图，留空就显示内置的
 *   向日葵 / 云朵 / 小星星插画。
 * - CardArt：收藏卡的卡面，card.url 有值就显示这张图，留空显示占位卡面
 *   （纯色底 + 一个按稀有度而不同大小的小星星，没有像老师/班级那样画
 *   具体的插画——21 张卡池，占位阶段故意画得简单，免得真图做出来之后
 *   还要为了"占位图好看"返工）。
 * - FoodArt：春游/秋游「准备零食」里每样零食的卡面，food.url 有值就显示
 *   这张图，留空显示占位卡面（纯色底 + 名字的第一个字，不用 emoji）。
 * 想换图只要去 companionSchoolData.js / companionSchoolCardCatalog.js /
 * companionSchoolEventData.js 里把对应条目的 url 填上，不用改这里。
 *
 * 所有 SVG 都是自包含的（不用 <symbol> / id 引用），同一个页面里渲染多少
 * 份都不会互相串。图标统一用 currentColor，颜色由外层 CSS 决定。
 */

import React from 'react';

/* ---------------- 小图标（currentColor） ---------------- */
const Glyph = ({ size, children, viewBox = '0 0 24 24' }) => (
  <svg width={size} height={size} viewBox={viewBox} aria-hidden="true" focusable="false">
    {children}
  </svg>
);

export const BackGlyph = ({ size = 18 }) => (
  <Glyph size={size}>
    <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
  </Glyph>
);

export const CloseGlyph = ({ size = 18 }) => (
  <Glyph size={size}>
    <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
  </Glyph>
);

export const CheckGlyph = ({ size = 16 }) => (
  <Glyph size={size}>
    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
  </Glyph>
);

export const HeartGlyph = ({ size = 14 }) => (
  <Glyph size={size}>
    <path
      d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 5 6.3 5c2 0 3.7 1.1 4.7 2.8h2C14 6.1 15.7 5 17.7 5 21 5 23.1 8.3 21.6 11.8 19.5 16.4 12 21 12 21z"
      fill="currentColor"
    />
  </Glyph>
);

export const StarGlyph = ({ size = 18 }) => (
  <Glyph size={size}>
    <path
      d="M12 2.8l2.7 5.7 6.2.8-4.6 4.3 1.2 6.2L12 16.7 6.5 19.8l1.2-6.2L3.1 9.3l6.2-.8z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </Glyph>
);

/*
 * 下面这 4 个是首页弹窗四个入口用的图标（错题本 / 我出的题 / 家校练习册 /
 * 学校相册）。之前 CompanionSchoolModal.jsx 已经在 import 它们了，但这里
 * 一直没有真的导出——这是个会让整个 Vite 构建直接失败的漏洞（named import
 * 对不上 named export），这次顺手补上。画法照抄预览 HTML 里已经定稿的
 * notebook / edit / book / photo 四个 <symbol>，同样 fill="currentColor"
 * 打底、内部细节用白色勾一道，跟其它图标的配色方式一致。
 */
export const NotebookGlyph = ({ size = 20 }) => (
  <Glyph size={size}>
    <rect x="5" y="3" width="14" height="18" rx="3" fill="currentColor" />
    <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
  </Glyph>
);

export const EditGlyph = ({ size = 20 }) => (
  <Glyph size={size}>
    <rect x="4" y="5" width="12" height="15" rx="3" fill="currentColor" />
    <path d="M8 10h4M8 14h3" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    <path d="M15 17l1-3.5 5-5 2.5 2.5-5 5z" fill="currentColor" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
  </Glyph>
);

export const BookGlyph = ({ size = 20 }) => (
  <Glyph size={size}>
    <path
      d="M4 5.5c3-1.3 5.5-1.1 8 .8 2.5-1.9 5-2.1 8-.8v12.5c-3-1.3-5.5-1.1-8 .8-2.5-1.9-5-2.1-8-.8z"
      fill="currentColor"
    />
    <path d="M12 6.3v12.5" stroke="#fff" strokeWidth="1.6" />
  </Glyph>
);

export const PhotoGlyph = ({ size = 20 }) => (
  <Glyph size={size}>
    <rect x="3" y="5" width="18" height="14" rx="3.5" fill="currentColor" />
    <circle cx="9" cy="10.5" r="2" fill="#fff" />
    <path d="M5 17l4.5-4 3.5 3 3-2.5 3 3.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
  </Glyph>
);

/*
 * 下面两个是「学校相册」浏览界面用的图标（翻页箭头的"下一张"方向、删除
 * 按钮）。"上一张"直接复用上面已有的 BackGlyph，不重复画一个镜像版本。
 */
export const ForwardGlyph = ({ size = 18 }) => (
  <Glyph size={size}>
    <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
  </Glyph>
);

export const TrashGlyph = ({ size = 16 }) => (
  <Glyph size={size}>
    <path
      d="M4 7h16M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7M6.5 7l1 13.2a1.5 1.5 0 0 0 1.5 1.3h6a1.5 1.5 0 0 0 1.5-1.3L17.5 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Glyph>
);

/* ---------------- 占位小脸 ---------------- */
/*
 * 没有头像图时的兜底脸。skin / ear 可以换色，用来区分不同的老师。
 */
export const PetFace = ({ size = 54, skin = '#FFE9D6', ear = '#FFD6C2', className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
    <circle cx="14" cy="18" r="9" fill={ear} />
    <circle cx="50" cy="18" r="9" fill={ear} />
    <circle cx="32" cy="36" r="24" fill={skin} />
    <ellipse cx="19" cy="41" rx="5" ry="3.4" fill="#FFB3C6" opacity=".75" />
    <ellipse cx="45" cy="41" rx="5" ry="3.4" fill="#FFB3C6" opacity=".75" />
    <circle cx="24" cy="34" r="3.2" fill="#24415A" />
    <circle cx="40" cy="34" r="3.2" fill="#24415A" />
    <circle cx="25" cy="33" r="1" fill="#fff" />
    <circle cx="41" cy="33" r="1" fill="#fff" />
    <path d="M27 42q5 5 10 0" fill="none" stroke="#24415A" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

/* 老师占位小脸的肤色（跟 companionSchoolData.js 里老师的 tone 对应） */
const TEACHER_FACE = {
  heart: { skin: '#FFE3D0', ear: '#FFC9B0' },
  butter: { skin: '#FFE9B8', ear: '#FFD68A' },
  sky: { skin: '#E4EEF8', ear: '#C9DCEE' },
};

/**
 * 老师头像（圆形）。teacher.url 有值显示图片，否则显示占位小脸。
 * 底色来自 .sd-tone-* 提供的 --sd-t-bg。
 */
export const TeacherAvatar = ({ teacher, size = 64 }) => {
  const face = TEACHER_FACE[teacher?.tone] || TEACHER_FACE.heart;
  return (
    <span
      className={`sd-tav sd-tone-${teacher?.tone || 'heart'}`}
      style={{ width: size, height: size }}
    >
      {teacher?.url ? (
        <img src={teacher.url} alt={teacher.name} draggable={false} />
      ) : (
        <PetFace size={Math.round(size * 0.84)} skin={face.skin} ear={face.ear} />
      )}
    </span>
  );
};

/* ---------------- 班级插画 ---------------- */
const SunflowerArt = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <g fill="#FFC93C">
      <circle cx="32" cy="10" r="9" />
      <circle cx="32" cy="54" r="9" />
      <circle cx="10" cy="32" r="9" />
      <circle cx="54" cy="32" r="9" />
      <circle cx="16.5" cy="16.5" r="9" />
      <circle cx="47.5" cy="16.5" r="9" />
      <circle cx="16.5" cy="47.5" r="9" />
      <circle cx="47.5" cy="47.5" r="9" />
    </g>
    <circle cx="32" cy="32" r="14" fill="#B9793B" />
    <circle cx="27" cy="30" r="2.2" fill="#fff" />
    <circle cx="37" cy="30" r="2.2" fill="#fff" />
    <path d="M28 36q4 3.5 8 0" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);

const CloudArt = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M18 46a12 12 0 0 1-1-24 16 16 0 0 1 30 3 10.5 10.5 0 0 1 0 21z" fill="#fff" stroke="#9CCBF2" strokeWidth="3" strokeLinejoin="round" />
    <circle cx="26" cy="36" r="2.2" fill="#24415A" />
    <circle cx="38" cy="36" r="2.2" fill="#24415A" />
    <path d="M29 41q3 3 6 0" stroke="#24415A" strokeWidth="2" fill="none" strokeLinecap="round" />
    <ellipse cx="22" cy="40" rx="3" ry="2" fill="#FFB3C6" />
    <ellipse cx="42" cy="40" rx="3" ry="2" fill="#FFB3C6" />
  </svg>
);

const StarArt = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M32 6l7.5 16.5 18 2.2-13.2 12.3 3.5 17.8L32 45.5 16.2 54.8l3.5-17.8L6.5 24.7l18-2.2z" fill="#FFE27A" stroke="#F2B63C" strokeWidth="3" strokeLinejoin="round" />
    <circle cx="26" cy="31" r="2.2" fill="#24415A" />
    <circle cx="38" cy="31" r="2.2" fill="#24415A" />
    <path d="M29 36q3 3 6 0" stroke="#24415A" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);

const CLASS_ART = {
  sunflower: SunflowerArt,
  cloud: CloudArt,
  star: StarArt,
};

/**
 * 班级插画。schoolClass.url 有值显示图片，否则按 id 显示内置插画
 * （id 不认识时兜底用小星星）。
 */
export const ClassArt = ({ schoolClass, size = 58 }) => {
  if (schoolClass?.url) {
    return <img src={schoolClass.url} alt={schoolClass.name} width={size} height={size} draggable={false} style={{ objectFit: 'contain' }} />;
  }
  const Art = CLASS_ART[schoolClass?.id] || StarArt;
  return <Art size={size} />;
};

/* ---------------- 收藏卡占位卡面 ---------------- */
/**
 * 收藏卡卡面。card.url 有值显示图片，否则显示占位卡面：底色用
 * card.tone（走 .sd-tone-* 的 --sd-t-bg/--sd-t-fg），中间一颗小星星，
 * 稀有/隐藏档星星更大一点；隐藏档额外带 is-hidden class，一圈微光由
 * schoolCards.css 的 .sc-face.is-hidden 负责，这里不管颜色细节。
 */
export const CardArt = ({ card, size = 96 }) => {
  if (card?.url) {
    return (
      <img
        src={card.url}
        alt={card.title}
        width={size}
        height={size}
        draggable={false}
        style={{ objectFit: 'cover', borderRadius: Math.round(size * 0.18) }}
      />
    );
  }
  const starSize = card?.rarity === 'hidden'
    ? Math.round(size * 0.34)
    : card?.rarity === 'rare'
      ? Math.round(size * 0.28)
      : Math.round(size * 0.22);
  return (
    <span
      className={`sc-face sd-tone-${card?.tone || 'sky'}${card?.rarity === 'hidden' ? ' is-hidden' : ''}`}
      style={{ width: size, height: size }}
    >
      <StarGlyph size={starSize} />
    </span>
  );
};

/* ---------------- 零食占位卡面 ---------------- */
/**
 * 零食卡面（春游/秋游「准备零食」用）。food.url 有值显示图片，否则显示
 * 占位卡面：纯色底 + 名字的第一个字，不用 emoji。tone 固定用 butter
 * （零食池不分季节，没有 tone 字段可取）。
 */
export const FoodArt = ({ food, size = 64 }) => {
  if (food?.url) {
    return (
      <img
        src={food.url}
        alt={food.name}
        width={size}
        height={size}
        draggable={false}
        style={{ objectFit: 'cover', borderRadius: Math.round(size * 0.22) }}
      />
    );
  }
  return (
    <span className="sc-face sd-tone-butter" style={{ width: size, height: size }}>
      <b style={{ fontFamily: 'var(--cp-font-display)', fontWeight: 400, fontSize: Math.round(size * 0.36) }}>
        {food?.name?.slice(0, 1) || '？'}
      </b>
    </span>
  );
};