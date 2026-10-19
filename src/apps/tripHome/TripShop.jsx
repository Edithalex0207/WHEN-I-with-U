// 「商店」分页：每日签到（7 天一个循环，奖励递增）、赚旅费的小游戏
// （第一个是翻牌配对，玩法在 TripMemoryGame.jsx）、商品列表。买到的东西
// 进背包，在「行李」分页里放进箱子。

import React, { useState } from 'react';

import { TRIP_ITEMS, getTripDestination, getTripReasonText } from './tripCatalog';
import { claimDailyCheckin, getCheckinView, getMemoryGameView, purchaseTripItem } from './tripService';
import { CoinDot, TripItemIcon } from './TripParts';
import TripMemoryGame from './TripMemoryGame';

const TripShop = ({ state, onChange, notify }) => {
  const view = getCheckinView(state);
  const memoryView = getMemoryGameView(state);
  const [showMemoryGame, setShowMemoryGame] = useState(false);

  const handleCheckin = async () => {
    try {
      const result = await claimDailyCheckin();
      if (!result.ok) {
        notify(getTripReasonText(result.reason));
      } else {
        notify(`签到成功，旅费 +${result.reward}`);
      }
      onChange();
    } catch (error) {
      console.warn('签到失败：', error);
      notify('签到失败，请刷新后再试');
    }
  };

  const handleBuy = async (item) => {
    try {
      const result = await purchaseTripItem(item.id);
      if (!result.ok) {
        notify(getTripReasonText(result.reason));
        return;
      }
      notify(`已放进背包：${item.name}`);
      onChange();
    } catch (error) {
      console.warn('购买失败：', error);
      notify('购买失败，请刷新后再试');
    }
  };

  return (
    <div className="trip-view">
      <section className="trip-card">
        <div className="trip-card__head">
          <b>每日签到</b>
          <span>已连续 {view.streak} 天</span>
        </div>
        <div className="trip-days">
          {view.rewards.map((reward, index) => (
            <div key={index} className={`trip-day${index < view.lit ? ' is-on' : ''}`}>
              <b>+{reward}</b>
              第{index + 1}天
            </div>
          ))}
        </div>
        <button type="button" className="trip-btn" disabled={view.signedToday} onClick={handleCheckin}>
          {view.signedToday ? '今天已签到' : `签到领 +${view.todayReward}`}
        </button>
      </section>

            <section className="trip-card trip-card--row">
        <div>
          <b>翻牌配对</b>
          <p className="trip-hint">
            今天还能玩 {memoryView.playsLeft} / {memoryView.maxPlays} 次
            {memoryView.bestMoves ? ` · 最佳 ${memoryView.bestMoves} 步` : ''}
          </p>
        </div>
        <button type="button" className="trip-btn trip-btn--sm" onClick={() => setShowMemoryGame(true)}>
          玩一局
        </button>
      </section>

      <div className="trip-sec">商店</div>
      <div className="trip-goods">
        {TRIP_ITEMS.map((item) => {
          const destination = getTripDestination(item.destinationId);
          const owned = state.inventory[item.id] || 0;
          return (
            <div key={item.id} className="trip-good">
              <TripItemIcon item={item} />
              <h3>{item.name}</h3>
              <p>{item.desc}</p>
              {destination && <span className="trip-tag">解锁 · {destination.name}</span>}
              {owned > 0 && <span className="trip-tag">背包 x{owned}</span>}
              <div className="trip-good__buy">
                <span className="trip-price">
                  <CoinDot />
                  {item.price}
                </span>
                <button type="button" className="trip-btn trip-btn--sm" onClick={() => handleBuy(item)}>
                  购买
                </button>
              </div>
            </div>
                   );
        })}
      </div>

      {showMemoryGame && (
        <TripMemoryGame
          state={state}
          onChange={onChange}
          notify={notify}
          onClose={() => setShowMemoryGame(false)}
        />
      )}
    </div>
  );
};

export default TripShop;