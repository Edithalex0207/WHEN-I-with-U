/*
 * CompanionSchoolCardsModal.jsx —— 「收藏卡」收藏册弹窗。
 *
 * 跟「学校相册」（CompanionSchoolAlbumModal.jsx）是两件不同的东西：相册
 * 是入学/升班时手动拍的纪念卡截图，这里是做题时随机掉落的固定卡池
 * （companionSchoolCardCatalog.js，所有小伙伴共用同一套）。两者互不
 * import，各自读自己的表。
 *
 * 【网格 + 详情，不是轮播】
 * 默认显示一个按稀有度分组的卡格网格；点一张卡会把网格换成详情页
 * （同一个 sd-body 里切换显示内容，不叠加浮层），点"返回"换回网格。
 * 没收集到的卡格子是灰的、标题显示"？？？"；点开详情时文案也不会
 * 泄露具体是哪一句台词——只告诉稀有度，不告诉内容，留着悬念。
 *
 * 【筛选 chip 为什么一直显示四个】
 * 跟相册不一样：相册的筛选 chip 是"出现过几种类型就显示几个"，因为
 * 相册里的"类型"是事件种类；这里的"稀有度"是卡池本来就固定的三档，
 * 不管抽到没抽到，筛选都应该一直能选，不然用户看不出"稀有/隐藏"
 * 这两档本身的存在。
 *
 * Props:
 *   companion  object    —— 当前小伙伴（用 id）
 *   onClose    function  —— 关闭弹窗
 */

import React, { useEffect, useState } from 'react';

import './school.css';
import './schoolCards.css';
import './schoolCardStory.css';

import { CARD_RARITY_ORDER, CARD_RARITY_LABELS } from './companionSchoolCardCatalog';
import { getCardCollection } from './companionSchoolCardService';
import { getCardStory } from './companionSchoolCardStories';
import { CloseGlyph, BackGlyph, CardArt } from './SchoolArt';

const CompanionSchoolCardsModal = ({ companion, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [collection, setCollection] = useState({ cards: [], ownedKinds: 0, totalKinds: 0 });
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let alive = true;
    getCardCollection(companion.id).then((data) => {
      if (alive) {
        setCollection(data);
        setLoading(false);
      }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companion.id]);

  const visible = filter === 'all' ? collection.cards : collection.cards.filter((c) => c.rarity === filter);
  const selected = collection.cards.find((c) => c.id === selectedId) || null;

  const handleFilter = (next) => {
    setFilter(next);
    setSelectedId(null);
  };

  return (
    <div className="cp-overlay center">
      <div className="cp-backdrop" onClick={onClose} />
      <div className="sd-root" role="dialog" aria-label="收藏卡">
        <div className="sd-head">
          <button type="button" className="sd-round" aria-label="关闭" onClick={onClose}><CloseGlyph /></button>
          <div className="sd-title"><b>收藏卡</b></div>
          <span className="sd-round is-ghost" aria-hidden="true" />
        </div>

        {loading && (
          <div className="sd-body is-center"><p className="sd-hint">正在整理收藏册…</p></div>
        )}

        {!loading && !selected && (
          <div className="sd-body">
            <div className="sc-summary">
              <b>{collection.ownedKinds} / {collection.totalKinds}</b>
              <span>做题的时候，偶尔会掉落一张</span>
            </div>

            <div className="sc-filter">
              <button type="button" className={`sc-fchip${filter === 'all' ? ' is-on' : ''}`} onClick={() => handleFilter('all')}>
                全部
              </button>
              {CARD_RARITY_ORDER.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`sc-fchip sd-tone-${r === 'hidden' ? 'lavender' : r === 'rare' ? 'heart' : 'sky'}${filter === r ? ' is-on' : ''}`}
                  onClick={() => handleFilter(r)}
                >
                  {CARD_RARITY_LABELS[r]}
                </button>
              ))}
            </div>

            {visible.length === 0 && <p className="sc-empty">这个稀有度还没有卡呢</p>}

            {visible.length > 0 && (
              <div className="sc-grid">
                {visible.map((card) => (
                  <button
                    type="button"
                    key={card.id}
                    className={`sc-cell${card.owned ? '' : ' is-locked'}`}
                    onClick={() => setSelectedId(card.id)}
                  >
                    {card.owned && card.count > 1 && <span className="sc-count">×{card.count}</span>}
                                        <CardArt card={card} locked={!card.owned} />
                    <span className="sc-name">{card.owned ? card.title : '？？？'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && selected && (
          <div className="sd-body">
            <div className="sc-detail">
              <button type="button" className="sc-detail-back" onClick={() => setSelectedId(null)}>
                <BackGlyph size={14} />返回
              </button>
                           <CardArt card={selected} size={160} locked={!selected.owned} />
              <h3>{selected.owned ? selected.title : '？？？'}</h3>
              <span className={`sc-rarity-badge sd-tone-${selected.rarity === 'hidden' ? 'lavender' : selected.rarity === 'rare' ? 'heart' : 'sky'}`}>
                {CARD_RARITY_LABELS[selected.rarity]}
              </span>
              <p className="sc-text">
                {selected.owned ? selected.text : '还没有收集到这张，去小课堂多做几组题，说不定下次就抽到了。'}
              </p>
                            {selected.owned && getCardStory(selected.id, companion.name) && (
                <div className="sc-story">
                  <h4>小故事</h4>
                  <p>{getCardStory(selected.id, companion.name)}</p>
                </div>
              )}
              {selected.owned && <p className="sc-held">已收集 {selected.count} 张</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanionSchoolCardsModal;