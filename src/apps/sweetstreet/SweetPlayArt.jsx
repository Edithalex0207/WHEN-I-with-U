/*
 * SweetPlayArt.jsx —— 「小蛋糕店」玩法里用到的小图形组件。
 *
 * 每个组件都是「有贴图用贴图，没有贴图用内置图形兜底」：
 *   贴图的 url 在 sweetStreetData.js 的几张图片表里，取图小工具在 sweetPlayData.js。
 * 这样你什么时候补图都行，补一张换一张，别的代码不用动。
 */

import React from 'react';
import {
  SWEET_RECIPES,
  SWEET_INGREDIENTS,
  SWEET_DECORATIONS,
  SWEET_CUSTOMERS,
  getCakeImage,
  getIngredientImage,
  getDecoImage,
  getCustomerImage,
} from './sweetPlayData';

/** 星星行：count 颗亮的，共 max 颗 */
export const StarRow = ({ count, max = 3, size = 18 }) => (
  <span className="sp-stars" aria-label={`${count} 星`}>
    {Array.from({ length: max }).map((_, index) => (
      <svg key={index} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <polygon
          points="12,2 15,9 22,9.5 16.5,14 18.5,21.5 12,17.5 5.5,21.5 7.5,14 2,9.5 9,9"
          fill={index < count ? '#FFC857' : '#F3E3DD'}
          stroke={index < count ? '#E5A22E' : '#E6CFC6'}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    ))}
  </span>
);

/** 材料图标 */
export const IngredientIcon = ({ id, size = 48 }) => {
  const item = SWEET_INGREDIENTS[id];
  const url = getIngredientImage(id);
  if (url) {
    return (
      <img className="sp-icon-img" src={url} alt={item?.name || ''} width={size} height={size} draggable={false} />
    );
  }
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <circle cx="24" cy="24" r="20" fill={item?.color || '#EEE'} stroke="rgba(122,74,58,0.28)" strokeWidth="2" />
      <ellipse cx="17" cy="16" rx="6" ry="3.4" fill="#fff" opacity="0.55" transform="rotate(-25 17 16)" />
    </svg>
  );
};

/** 装饰图标 */
export const DecoIcon = ({ id, size = 40 }) => {
  const item = SWEET_DECORATIONS[id];
  const url = getDecoImage(id);
  if (url) {
    return (
      <img className="sp-icon-img" src={url} alt={item?.name || ''} width={size} height={size} draggable={false} />
    );
  }
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <rect x="6" y="6" width="36" height="36" rx="14" fill={item?.color || '#EEE'} stroke="rgba(122,74,58,0.28)" strokeWidth="2" />
      <ellipse cx="18" cy="17" rx="6" ry="3.2" fill="#fff" opacity="0.55" transform="rotate(-25 18 17)" />
    </svg>
  );
};

/**
 * 蛋糕。stage：0 面糊 / 1 烤好 / 2 抹了奶油 / 3 成品。
 * decoIds 按顺序叠在蛋糕上，位置取配方里的 decoSlots。
 * 有蛋糕贴图时：贴图当成品用，前几个阶段只是调淡一点（用 css 的 is-stage-N）。
 */
export const CakeArt = ({ recipeId, stage = 3, decoIds = [], size = 140 }) => {
  const recipe = SWEET_RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return null;
  const url = getCakeImage(recipeId);
  const fb = recipe.fallback;
  const decoSize = Math.round(size * 0.22);

  return (
    <div className="sp-cake" style={{ width: size, height: size }}>
      {url ? (
        <img className={`sp-cake-img is-stage-${stage}`} src={url} alt={recipe.name} draggable={false} />
      ) : (
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
          <ellipse cx="50" cy="86" rx="42" ry="8" fill="#fff" stroke="#F0CFC4" strokeWidth="2" />
          {stage === 0 ? (
            <>
              <rect x="18" y="58" width="64" height="26" rx="10" fill="#FFF0C9" stroke="#E7C98E" strokeWidth="2" />
              <ellipse cx="50" cy="58" rx="32" ry="6" fill="#FFE29B" />
            </>
          ) : (
            <rect x="18" y="54" width="64" height="30" rx="10" fill={fb.body} stroke="rgba(122,74,58,0.2)" strokeWidth="2" />
          )}
          {stage >= 2 && (
            <path
              d="M16 56c0-12 8-18 18-16 4-10 28-10 32 0 10-2 18 4 18 16 0 4-4 6-8 6H24c-4 0-8-2-8-6z"
              fill={fb.cream}
              stroke="rgba(122,74,58,0.18)"
              strokeWidth="2"
            />
          )}
          {stage === 3 && decoIds.length === 0 && <circle cx="50" cy="38" r="5" fill={fb.accent} />}
        </svg>
      )}
      {decoIds.map((id, index) => {
        const slot = recipe.decoSlots[index];
        if (!slot) return null;
        return (
          <span
            key={`${id}-${index}`}
            className="sp-cake-deco"
            style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: decoSize, height: decoSize }}
          >
            <DecoIcon id={id} size={decoSize} />
          </span>
        );
      })}
    </div>
  );
};

/** 顾客：mood 为 normal / happy / sad，没贴图用内置小人 */
export const CustomerFigure = ({ designId, mood = 'normal', height = 110 }) => {
  const url = getCustomerImage(designId, mood);
  if (url) {
    return <img className="sp-cust-img" src={url} alt="" style={{ height }} draggable={false} />;
  }
  const design = SWEET_CUSTOMERS.find((c) => c.id === designId) || SWEET_CUSTOMERS[0];
  const { skin, hair, shirt } = design.fallback;
  let mouth = 'M45 66h10';
  if (mood === 'happy') mouth = 'M43 63q7 9 14 0';
  if (mood === 'sad') mouth = 'M43 69q7-7 14 0';
  return (
    <svg viewBox="0 0 100 130" height={height} aria-hidden="true">
      <path d="M16 130c0-27 15-42 34-42s34 15 34 42z" fill={shirt} />
      <rect x="43" y="76" width="14" height="14" rx="5" fill={skin} />
      <circle cx="50" cy="52" r="28" fill={skin} />
      <path d="M21 50c0-20 12-32 29-32s29 12 29 32c-8-10-18-14-29-14S29 40 21 50z" fill={hair} />
      <circle cx="39" cy="54" r="3" fill="#5B3A44" />
      <circle cx="61" cy="54" r="3" fill="#5B3A44" />
      <circle cx="32" cy="62" r="5" fill="#FF9DB5" opacity="0.5" />
      <circle cx="68" cy="62" r="5" fill="#FF9DB5" opacity="0.5" />
      <path d={mouth} stroke="#5B3A44" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  );
};

/** 顾客耐心条 */
export const PatienceBar = ({ customer }) => {
  const ratio = customer.patienceMaxSec > 0
    ? Math.max(0, Math.min(1, customer.patienceLeftSec / customer.patienceMaxSec))
    : 0;
  const tone = ratio > 0.5 ? 'ok' : ratio > 0.25 ? 'warn' : 'bad';
  return (
    <div className="sp-patience" aria-hidden="true">
      <i className={`is-${tone}`} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
};

/** 耐心快没了就用 sad 表情，其余用 normal */
export const getCustomerMood = (customer) => {
  const ratio = customer.patienceMaxSec > 0 ? customer.patienceLeftSec / customer.patienceMaxSec : 0;
  return ratio < 0.3 ? 'sad' : 'normal';
};
