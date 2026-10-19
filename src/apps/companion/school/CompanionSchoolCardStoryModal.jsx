/*
 * CompanionSchoolCardStoryModal.jsx —— 抽到「新」收藏卡时弹出的小故事小窗。
 *
 * 由 CompanionSchoolQuizModal.jsx 在结算页里调用：rollCollectibleCard
 * 返回 isNew 为 true 的时候弹一次，点"收下"（或点背景）就关掉，只关
 * 这个小窗，不会关掉后面的结算页。重复抽到的卡不弹。
 *
 * 故事内容来自 companionSchoolCardStories.js；没有对应故事时退回显示
 * 卡池里那句短文案，不会出现空白小窗。
 *
 * Props:
 *   drop           object    —— rollCollectibleCard 的返回值 { card, isNew, count }
 *   companionName  string    —— 小伙伴名字，用来替换故事里的 {name}
 *   onClose        function  —— 关闭小窗
 */

import React from 'react';

import './school.css';
import './schoolCards.css';
import './schoolCardStory.css';

import { CARD_RARITY_LABELS } from './companionSchoolCardCatalog';
import { getCardStory } from './companionSchoolCardStories';
import { CardArt } from './SchoolArt';

const toneOf = (rarity) => (rarity === 'hidden' ? 'lavender' : rarity === 'rare' ? 'heart' : 'sky');

const CompanionSchoolCardStoryModal = ({ drop, companionName, onClose }) => {
  const card = drop?.card;
  if (!card) return null;

  const story = getCardStory(card.id, companionName) || card.text;
  const tone = toneOf(card.rarity);

  return (
    <div className="cp-overlay center cs-layer">
      <div className="cp-backdrop" onClick={onClose} />
      <div className="cs-pop" role="dialog" aria-label="新卡片的小故事">
        <span className="cs-kicker">获得新卡片</span>
        <div className={`cs-art sd-tone-${tone}`}>
          <CardArt card={card} size={132} />
        </div>
        <span className={`sc-rarity-badge sd-tone-${tone}`}>{CARD_RARITY_LABELS[card.rarity]}</span>
        <h3 className="cs-title">{card.title}</h3>
        <p className="cs-story">{story}</p>
        <button type="button" className="cs-btn" onClick={onClose}>收下</button>
      </div>
    </div>
  );
};

export default CompanionSchoolCardStoryModal;