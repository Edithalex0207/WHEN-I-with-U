// src/apps/tripHome/TripParts.jsx
//
// 旅行小屋几个页面共用的小零件：旅费小圆币、返回箭头、交通工具图标、
// 物品图标、动物形象（内置剪影 / 图片）。
//
// 图片都带“加载失败自动退回内置图”的处理：目录里填的链接失效或被图床
// 拦截时，界面不会出现破图，而是显示占位剪影/图标。
//
// 只导出命名导出。

import React, { useEffect, useState } from 'react';

import { getTripAnimal } from './tripCatalog';

export const CoinDot = () => <span className="trip-coin" aria-hidden="true" />;

export const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

/* ---------- 底部导航图标 ---------- */

const TabSvg = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const TabRoomIcon = () => (
  <TabSvg>
    <path d="M4 11l8-7 8 7v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
    <path d="M10 20.5v-6h4v6" />
  </TabSvg>
);

export const TabTicketIcon = () => (
  <TabSvg>
    <path d="M3 13l18-8-6 15-3-6z" />
    <path d="M12 14l-1 6" />
  </TabSvg>
);

export const TabLuggageIcon = () => (
  <TabSvg>
    <rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M4 13h16" />
  </TabSvg>
);

export const TabShopIcon = () => (
  <TabSvg>
    <path d="M4 9l1.5-4.5h13L20 9a3 3 0 0 1-5.3 1.8 3 3 0 0 1-5.4 0A3 3 0 0 1 4 9z" />
    <path d="M5.5 12v7.5h13V12" />
  </TabSvg>
);

export const TripVehicleIcon = ({ kind }) => {
  if (kind === 'plane') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
        <path d="M21 3L3 10.5l6.5 2.5L12 20z" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="3" width="14" height="14" rx="4" />
      <path d="M5 11h14M8 21l2-4M16 21l-2-4" />
    </svg>
  );
};

const CATEGORY_PATHS = {
  food: (
    <>
      <path d="M4 11h16a8 8 0 01-16 0z" />
      <path d="M9 6c0-1.5 1.5-1.5 1.5-3M14 6c0-1.5 1.5-1.5 1.5-3" />
    </>
  ),
  prop: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <circle cx="12" cy="13.5" r="3.5" />
      <path d="M8 7l1.5-3h5L16 7" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="9" width="16" height="11" rx="2" />
      <path d="M12 9v11M4 13h16M12 9c-3-4-6-1-4 0M12 9c3-4 6-1 4 0" />
    </>
  ),
};

// 一个可以换成图片的图片元素：src 为空或加载失败时渲染 fallback。
const SafeImage = ({ src, alt = '', className, fallback }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return fallback;

  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} draggable={false} />;
};

// 物品图标：目录里填了 imageUrl 用图片，否则按分类画一个小图标。
export const TripItemIcon = ({ item }) => {
  const cat = item?.cat || 'food';
  const fallback = (
    <span className={`trip-ico trip-ico--${cat}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {CATEGORY_PATHS[cat] || CATEGORY_PATHS.food}
      </svg>
    </span>
  );

  return <SafeImage src={item?.imageUrl} className="trip-ico trip-ico--img" fallback={fallback} />;
};

/* ---------- 动物剪影 ---------- */

const ANIMAL_BODY = {
  cat: (
    <>
      <path d="M-13,-36L-12,-51L-2,-41Z M13,-36L12,-51L2,-41Z" />
      <ellipse cx="17" cy="-12" rx="4.6" ry="9" transform="rotate(25 17 -12)" />
    </>
  ),
  bunny: (
    <>
      <ellipse cx="-6" cy="-50" rx="4.6" ry="11" />
      <ellipse cx="6" cy="-50" rx="4.6" ry="11" />
      <circle cx="11" cy="-6" r="4" />
    </>
  ),
  bear: (
    <>
      <circle cx="-11" cy="-40" r="5.6" />
      <circle cx="11" cy="-40" r="5.6" />
    </>
  ),
  fox: (
    <>
      <path d="M-13,-36L-14,-54L-1,-42Z M13,-36L14,-54L1,-42Z" />
      <ellipse cx="18" cy="-11" rx="6.5" ry="11" transform="rotate(30 18 -11)" />
    </>
  ),
  frog: (
    <>
      <circle cx="-8" cy="-41" r="6" />
      <circle cx="8" cy="-41" r="6" />
    </>
  ),
};

const ANIMAL_DETAIL = {
  cat: <path d="M-11,-37L-11.6,-46L-5,-40Z M11,-37L11.6,-46L5,-40Z" fill="#f6a5b5" />,
  bunny: (
    <>
      <ellipse cx="-6" cy="-50" rx="2" ry="7" fill="#f6a5b5" />
      <ellipse cx="6" cy="-50" rx="2" ry="7" fill="#f6a5b5" />
    </>
  ),
  bear: <ellipse cx="0" cy="-26.5" rx="5.5" ry="4" fill="#ecd2b6" />,
  fox: (
    <>
      <ellipse cx="-8" cy="-24.5" rx="6.5" ry="4.2" fill="#fff" />
      <ellipse cx="8" cy="-24.5" rx="6.5" ry="4.2" fill="#fff" />
      <ellipse cx="0" cy="-8" rx="6" ry="7" fill="#fff" />
    </>
  ),
  frog: <ellipse cx="0" cy="-8" rx="7" ry="7" fill="#e7f6d9" />,
};

const AnimalFace = ({ animalId }) => (
  <>
    {ANIMAL_DETAIL[animalId]}
    {animalId === 'frog' ? (
      <>
        <circle cx="-8" cy="-41" r="3.4" fill="#fff" />
        <circle cx="8" cy="-41" r="3.4" fill="#fff" />
        <circle cx="-8" cy="-41" r="1.7" fill="#3b2c2c" />
        <circle cx="8" cy="-41" r="1.7" fill="#3b2c2c" />
      </>
    ) : (
      <>
        <circle cx="-5.5" cy="-30" r="1.9" fill="#3b2c2c" />
        <circle cx="5.5" cy="-30" r="1.9" fill="#3b2c2c" />
      </>
    )}
    <ellipse cx="-9.5" cy="-25.5" rx="3" ry="2" fill="#ff8fa3" opacity="0.5" />
    <ellipse cx="9.5" cy="-25.5" rx="3" ry="2" fill="#ff8fa3" opacity="0.5" />
    <path d="M-2.2,-26 Q0,-23.6 2.2,-26" stroke="#3b2c2c" strokeWidth="1.2" fill="none" strokeLinecap="round" />
  </>
);

// 动物剪影的 <g> 本体（不带外层 <svg>/viewBox），局部坐标原点在脚下，
// 头顶到 y=-62 左右。单独导出是因为房间地板上的居民精灵（TripRoom.jsx）
// 要把它直接当成大 SVG 场景里的一个子节点定位（translate+scale），不能
// 再套一层有自己 viewBox 的 <svg>。TripAnimalFigure（下面，给列表/头像
// 这类独立小图标用）就是在这个 <g> 外面套一层 svg。
export const TripAnimalMark = ({ animalId, color }) => {
  const animal = getTripAnimal(animalId);
  const id = animal.id;
  const body = (
    <>
      <ellipse cx="0" cy="-30" rx="14" ry="12.5" />
      <ellipse cx="0" cy="-12" rx="11" ry="11" />
      {ANIMAL_BODY[id]}
    </>
  );

  return (
    <g aria-hidden="true">
      <g fill="#fff" stroke="#fff" strokeWidth="6" strokeLinejoin="round">
        {body}
      </g>
      <g fill={color || animal.color}>{body}</g>
      <AnimalFace animalId={id} />
    </g>
  );
};

// 内置的动物剪影（白色描边的贴纸风格），带独立的 svg/viewBox，给列表行、
// 头像这类单独摆放的小图标用。
export const TripAnimalFigure = ({ animalId, color }) => (
  <svg className="trip-figure" viewBox="-28 -62 56 68" aria-hidden="true">
    <TripAnimalMark animalId={animalId} color={color} />
  </svg>
);

// 用户上传的居民贴图（已经在 TripCropSheet 里裁好、带白色贴纸描边的 PNG）。
// 跟 TripAnimalMark 一样是 <g>，局部坐标原点在脚下，所以房间里两者可以互换。
// 描边是上传时烤进图片的，这里不再套 SVG 滤镜（居民每帧移动，滤镜太费）。
export const TripSkinMark = ({ src }) => (
  <g aria-hidden="true">
    <image href={src} x="-31" y="-64" width="62" height="62" preserveAspectRatio="xMidYMax meet" />
  </g>
);

// 居民头像（圆形）：用户填写的头像 > 用户上传的贴图 > 动物预设的图片 > 内置剪影。
export const TripAvatar = ({ resident, size = 36 }) => {
  const animal = getTripAnimal(resident?.animalId);
  const figure = <TripAnimalFigure animalId={animal.id} />;
  const presetImage = <SafeImage src={animal.imageUrl} className="trip-avatar__img" fallback={figure} />;

  return (
    <span className="trip-avatar" style={{ width: size, height: size, background: animal.color }}>
      <SafeImage
        src={resident?.avatarUrl || resident?.skinDataUrl}
        className="trip-avatar__img"
        fallback={presetImage}
      />
    </span>
  );
};