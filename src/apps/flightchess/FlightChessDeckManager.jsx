// src/apps/flightchess/FlightChessDeckManager.jsx
//
// 卡组管理：编辑 5 副内置卡组（心动试探/心跳升温/灵魂深聊/甜蜜暴击/
// 赢家福利）的题目。入口在大厅顶部，跟棋盘库平级，是一张独立的全屏页。
//
//   - 普通 4 副卡：能改文字，能删卡，能通过弹窗加新卡。
//   - 赢家福利卡：每张都绑着固定 effect（前进/特权），所以只能改文
//     字——新卡没有 effect 可配，增删会破坏游戏效果，界面上直接不提供。
//
// 文字改动失焦（onBlur）时才写库，删卡/加卡是结构性变化，立刻写库。
// 具体存取逻辑在 flightChessDeckService.js，这里只管界面。

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';

import { CARD_DECKS } from './flightChessCardData';
import {
  EDITABLE_DECK_IDS, FIXED_EFFECT_DECK_IDS, getAllEffectiveDecks, saveDeckCards,
} from './flightChessDeckService';
import { LobbySky } from './FlightChessLobbyBits';
import './flightChessLobby.css';

const TONE_COLORS = {
  rose: ['#dd6f98', '#f6b9cf'],
  gold: ['#c98a3e', '#ffdfa0'],
  violet: ['#8b74c9', '#d9c8fa'],
};

const effectLabel = (effect) => {
  if (!effect) return '';
  if (effect.type === 'forward') return `前进${effect.steps || 2}格`;
  if (effect.perk) return `特权 · ${effect.perk}`;
  return '';
};

const FlightChessDeckManager = ({ onBack }) => {
  const [loading, setLoading] = useState(true);
  const [decks, setDecks] = useState({});
  const [activeDeckId, setActiveDeckId] = useState(EDITABLE_DECK_IDS[0]);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState('');

  const mountedRef = useRef(true);
  const decksRef = useRef(decks);
  decksRef.current = decks;

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      const result = await getAllEffectiveDecks();
      if (!mountedRef.current) return;
      setDecks(result);
      setLoading(false);
    })();
    return () => { mountedRef.current = false; };
  }, []);

  const activeMeta = CARD_DECKS[activeDeckId];
  const activeCards = decks[activeDeckId] || [];
  const isFixedEffect = FIXED_EFFECT_DECK_IDS.includes(activeDeckId);

  const persist = (deckId, cards) => {
    setDecks((prev) => ({ ...prev, [deckId]: cards }));
    saveDeckCards(deckId, cards);
  };

  const handleTextChange = (index, value) => {
    setDecks((prev) => ({
      ...prev,
      [activeDeckId]: (prev[activeDeckId] || []).map(
        (card, i) => (i === index ? { ...card, text: value } : card)
      ),
    }));
  };

  // 失焦才写库：打字的时候不用每敲一下都写一次数据库
  const handleTextBlur = () => {
    persist(activeDeckId, decksRef.current[activeDeckId] || []);
  };

  const handleDelete = (index) => {
    persist(activeDeckId, activeCards.filter((_, i) => i !== index));
  };

  const openAdd = () => {
    setAddText('');
    setAddOpen(true);
  };

  const confirmAdd = () => {
    const text = addText.trim();
    if (!text) return;
    persist(activeDeckId, [
      ...activeCards,
      { id: `${activeDeckId}-user-${Date.now()}`, deckId: activeDeckId, text },
    ]);
    setAddOpen(false);
  };

  return (
    <div className="fcl-root is-deckmgr">
      <LobbySky />

      <div className="fcl-screen">
        <div className="fcl-topbar">
          <button type="button" className="fcl-iconbtn" onClick={onBack} aria-label="返回">
            <ArrowLeft />
          </button>
          <span className="fcl-eyebrow">Card Decks</span>
          <span className="fcl-spacer" />
        </div>

        <h1 className="fcl-title">卡组管理</h1>
        <p className="fcl-sub center" style={{ margin: '4px 10px 0' }}>
          挑一副卡组，改里面的题目。抽到的卡会从这里读取。
        </p>

        {loading ? (
          <div className="fcl-empty fcl-sub center">正在读取卡组...</div>
        ) : (
          <>
            <div className="fcl-deck-tabs">
              {EDITABLE_DECK_IDS.map((deckId) => {
                const meta = CARD_DECKS[deckId];
                const [c1, c2] = TONE_COLORS[meta.tone] || TONE_COLORS.rose;
                const on = deckId === activeDeckId;
                return (
                  <button
                    key={deckId}
                    type="button"
                    className={`fcl-deck-tab${on ? ' on' : ''}`}
                    style={{ '--c1': c1, '--c2': c2 }}
                    onClick={() => setActiveDeckId(deckId)}
                  >
                    {meta.name}
                  </button>
                );
              })}
            </div>

            <div className="fcl-deck-head">
              <div>
                <b>{activeMeta.name}</b>
                <div className="fcl-faint">{activeMeta.subtitle}</div>
              </div>
              <span className="fcl-pill mute">共 {activeCards.length} 张</span>
            </div>

            {isFixedEffect && (
              <p className="fcl-sub" style={{ margin: '8px 2px 0' }}>
                这副卡每张自带固定效果（前进/特权），所以只能改文字，不能增删卡片。
              </p>
            )}
            {!isFixedEffect && (
              <p className="fcl-sub" style={{ margin: '8px 2px 0' }}>
                点卡片里的文字可以直接改，也可以删掉某张，或在最下面加一张新的。
              </p>
            )}

            <div className="fcl-deck-cards">
              {activeCards.map((card, index) => (
                <div className="fcl-glass fcl-deck-card" key={card.id || index}>
                  <div className="fcl-deck-card-head">
                    <span className="fcl-eyebrow">第 {index + 1} 张</span>
                    {!isFixedEffect && (
                      <button
                        type="button"
                        className="fcl-iconbtn tiny"
                        onClick={() => handleDelete(index)}
                        aria-label="删除这张卡"
                      >
                        <Trash2 />
                      </button>
                    )}
                  </div>
                  <textarea
                    value={card.text}
                    onChange={(e) => handleTextChange(index, e.target.value)}
                    onBlur={handleTextBlur}
                    rows={2}
                    maxLength={120}
                    placeholder="写点什么..."
                  />
                  {card.effect && (
                    <span className="fcl-deck-effect">
                      效果固定 · {effectLabel(card.effect)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {!loading && !isFixedEffect && (
        <div className="fcl-deck-addbar">
          <button type="button" className="fcl-btn" style={{ width: '100%' }} onClick={openAdd}>
            + 新增一张卡
          </button>
        </div>
      )}

      {addOpen && (
        <div className="fcl-sheet-backdrop" onClick={() => setAddOpen(false)}>
          <div className="fcl-glass fcl-import-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 className="fcl-card-title">新增一张卡</h3>
            <p className="fcl-sub">写下这张卡的题目，加进「{activeMeta.name}」。</p>
            <textarea
              className="fcl-input"
              rows={4}
              maxLength={120}
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              placeholder="写点什么..."
            />
            <div className="fcl-row between">
              <button type="button" className="fcl-btn ghost small" onClick={() => setAddOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="fcl-btn small"
                disabled={!addText.trim()}
                onClick={confirmAdd}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlightChessDeckManager;