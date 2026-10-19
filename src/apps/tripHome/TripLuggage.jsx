// src/apps/tripHome/TripLuggage.jsx
//
// 「行李」分页：选一个角色，往 TA 的箱子（食物 / 道具 / 小礼物三格）里放
// 背包里的东西。下面实时预告这一趟的目的地、时长和额外效果（规则来自
// tripCatalog.js 的 planTrip，出发时用的是同一个函数）。
// 角色在外面旅行时，行李锁定，不能改。

import React, { useEffect, useState } from 'react';

import { TRIP_ITEMS, TRIP_SLOTS, TRIP_SLOT_LABELS, getTripItem, getTripReasonText, planTrip } from './tripCatalog';
import { setLuggageSlot } from './tripService';
import { TripAvatar, TripItemIcon } from './TripParts';

const formatHours = (range) => `${range[0]} 到 ${range[1]} 小时`;

const TripLuggage = ({ state, residents, onChange, notify }) => {
  const [selectedId, setSelectedId] = useState(null);

  // 没选过、或者选中的居民不在了，就默认第一个。
  useEffect(() => {
    if (residents.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!residents.some((resident) => resident.id === selectedId)) {
      setSelectedId(residents[0].id);
    }
  }, [residents, selectedId]);

  if (residents.length === 0) {
    return (
      <div className="trip-view">
        <p className="trip-empty">还没有角色。先在聊天里创建一个角色，TA 就会住进旅行小屋。</p>
      </div>
    );
  }

  const resident = residents.find((item) => item.id === selectedId) || residents[0];
  const away = resident.status === 'away';
  const plan = planTrip(resident.luggage);
  const backpack = TRIP_ITEMS.filter((item) => (state.inventory[item.id] || 0) > 0);

  const handleSlot = async (slot, itemId) => {
    try {
      const result = await setLuggageSlot(resident.id, slot, itemId);
      if (!result.ok) {
        notify(getTripReasonText(result.reason));
        return;
      }
      onChange();
    } catch (error) {
      console.warn('修改行李失败：', error);
      notify('修改行李失败，请刷新后再试');
    }
  };

  return (
    <div className="trip-view">
      <div className="trip-chips">
        {residents.map((item) => (
          <button
            key={item.id}
            type="button"
            className="trip-chip"
            aria-pressed={item.id === resident.id}
            onClick={() => setSelectedId(item.id)}
          >
            <TripAvatar resident={item} size={22} />
            {item.name}
            {item.status === 'away' ? '（外出中）' : ''}
          </button>
        ))}
      </div>

      <div className="trip-case">
        <div className="trip-slots">
          {TRIP_SLOTS.map((slot) => {
            const item = getTripItem(resident.luggage[slot]);
            if (!item) {
              return (
                <div key={slot} className="trip-slot">
                  <span className="trip-slot__empty-ico">
                    <TripItemIcon item={{ cat: slot }} />
                  </span>
                  <small>{TRIP_SLOT_LABELS[slot]}</small>
                  <strong className="trip-slot__none">空</strong>
                </div>
              );
            }
            return (
              <button
                key={slot}
                type="button"
                className="trip-slot is-full"
                disabled={away}
                onClick={() => handleSlot(slot, null)}
              >
                <TripItemIcon item={item} />
                <strong>{item.name}</strong>
                <small>{away ? '已带走' : '点一下取出'}</small>
              </button>
            );
          })}
        </div>

        <div className="trip-plan">
          <div>
            <span>目的地</span>
            <b>{plan.destinationLabel}</b>
          </div>
          <div>
            <span>预计时长</span>
            <b>{formatHours(plan.hours)}</b>
          </div>
          <div>
            <span>额外效果</span>
            <b>{plan.effects.length > 0 ? plan.effects.join('；') : '无'}</b>
          </div>
        </div>

        <p className="trip-hint">
          {away
            ? 'TA 正在旅行，回来之前不能改行李。'
            : '角色自己决定什么时候出门，出门时会带走箱子里的东西，每趟用完就没有了。特殊食品决定能去哪些特别的地方。'}
        </p>
      </div>

      <div className="trip-sec">背包</div>
      <div className="trip-list">
        {backpack.length === 0 ? (
          <p className="trip-empty">背包是空的，去商店看看。</p>
        ) : (
          backpack.map((item) => (
            <div key={item.id} className="trip-item">
              <TripItemIcon item={item} />
              <div className="trip-item__text">
                <b>{item.name}</b>
                <small>{item.desc}</small>
              </div>
              <span className="trip-item__count">x{state.inventory[item.id]}</span>
              <button
                type="button"
                className="trip-btn trip-btn--sm"
                disabled={away}
                onClick={() => handleSlot(item.cat, item.id)}
              >
                放入
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TripLuggage;