// src/apps/flightchess/FlightChessSetupCards.jsx
//
// 开局前必须自己填写的3张提问卡。用户写完点「开始」，父组件会让每位
// AI 角色也各写3张，然后一起洗进「我们的提问卡」这副卡里，之后踩到
// 抽卡格（deck: custom）时抽出来。

import React, { useState } from 'react';

const REQUIRED = 3;

const FlightChessSetupCards = ({ busy, onStart, characterNames }) => {
  const [cards, setCards] = useState(Array.from({ length: REQUIRED }, () => ''));

  const filled = cards.every((text) => text.trim().length > 0);

  const updateCard = (index, value) => {
    setCards((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  return (
    <div className="fc-panel">
      <h3>开局前，先写下 {REQUIRED} 张提问卡</h3>
      <p className="fc-hint">
        写下你想问{characterNames.length > 0 ? ` ${characterNames.join('、')} ` : ' Ta '}的问题。
        开始后他们也会各写 {REQUIRED} 张，所有提问卡会洗在一起，踩到抽卡格时抽出来。
      </p>

      {cards.map((text, index) => (
        <div className="fc-setup-card" data-n={index + 1} key={index}>
          <textarea
            value={text}
            onChange={(e) => updateCard(index, e.target.value)}
            placeholder={`第 ${index + 1} 张：想问的问题...`}
            maxLength={80}
            rows={2}
            disabled={busy}
          />
        </div>
      ))}

      <div className="mt-4 flex justify-center">
        <button
          type="button"
          className="fc-btn"
          disabled={!filled || busy}
          onClick={() => onStart(cards.map((text) => text.trim()))}
        >
          {busy ? '角色们正在写提问卡...' : '写好了，开始游戏'}
        </button>
      </div>
    </div>
  );
};

export default FlightChessSetupCards;