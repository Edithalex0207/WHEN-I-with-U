// src/apps/tripHome/TripTickets.jsx
//
// 「航班」分页：外出中的居民显示成一张张车票/机票（火车票或机票由目的地
// 决定），进度虚线上的小车/小飞机按时间前进，到站后盖“已到站”章。
//
// 页面底部有一个“调试”面板：自动出发上线之前，用它手动让某个居民出发、
// 领取测试旅费，好测试车票界面。自动出发做好后，整个 TripDebugPanel
// 连同它的调用一起删掉即可。
//
// 到点的车票由本组件每秒检查一次，刚越过到站时间时调用一次 onChange()，
// 让父组件重新读取（settleTripArrivals 会把它在数据库里标成已到站）。

import React, { useEffect, useRef, useState } from 'react';

import { getTripItem, getTripReasonText } from './tripCatalog';
import { debugGrantCoins, dismissArrivedJourney, startTripJourney } from './tripService';
import TripPostcard from './TripPostcard';
import { TripAvatar, TripVehicleIcon } from './TripParts';

const MINUTE_MS = 60 * 1000;

const pad2 = (value) => String(value).padStart(2, '0');

const formatTime = (timestamp, now) => {
  const date = new Date(timestamp);
  const today = new Date(now);
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  return sameDay ? clock : `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
};

const formatRemaining = (ms) => {
  if (ms <= 0) return '即将到站';
  if (ms < MINUTE_MS) return `${Math.ceil(ms / 1000)} 秒`;
  const totalMinutes = Math.ceil(ms / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`;
};

const TripTicket = ({ journey, resident, now, onOpen }) => {
  const arrived = journey.status === 'arrived' || now >= journey.arriveAt;
  const span = Math.max(1, journey.arriveAt - journey.departAt);
  const progress = Math.min(1, Math.max(0, (now - journey.departAt) / span)) * 100;
  const plane = journey.transport === 'plane';
  const baggage = ['food', 'prop', 'gift']
    .map((slot) => getTripItem(journey.luggage?.[slot]))
    .filter(Boolean);

  return (
    <div className="trip-ticket-wrap">
      <article className={`trip-ticket trip-ticket--${plane ? 'plane' : 'train'}${arrived ? ' is-done' : ''}`}>
        <div className="trip-ticket__main">
          <div className="trip-ticket__top">
            <span>{plane ? 'Boarding pass' : 'Train ticket'}</span>
            <span>{plane ? '登机牌' : '车票'}</span>
          </div>

          <div className="trip-ticket__who">
            <TripAvatar resident={resident} size={34} />
            <div>
              <b>{resident ? resident.name : '旅客'}</b>
              <small>{plane ? '乘客' : '旅客'}</small>
            </div>
          </div>

          <div className="trip-ticket__route">
            <div className="trip-ticket__stn">
              <b>HOM</b>
              <small>小屋</small>
            </div>
            <div className="trip-ticket__line">
              <span className="trip-ticket__veh" style={{ left: `${progress}%` }}>
                <TripVehicleIcon kind={plane ? 'plane' : 'train'} />
              </span>
            </div>
            <div className="trip-ticket__stn trip-ticket__stn--to">
              <b>{journey.destinationCode}</b>
              <small>{journey.destinationName}</small>
            </div>
          </div>

          <div className="trip-ticket__times">
            <div>
              <span>出发 DEPART</span>
              {formatTime(journey.departAt, now)}
            </div>
            <div>
              <span>预计返回 ETA</span>
              {formatTime(journey.arriveAt, now)}
            </div>
          </div>

          {baggage.length > 0 && (
            <div className="trip-ticket__bag">
              {baggage.map((item) => (
                <i key={item.id}>{item.name}</i>
              ))}
            </div>
          )}
        </div>

        <div className="trip-ticket__stub">
          {arrived ? (
            <>
              <div className="trip-ticket__stamp">已到站</div>
              <button type="button" className="trip-ticket__btn" onClick={() => onOpen(journey.id)}>
                领取明信片
              </button>
            </>
          ) : (
            <>
              <small>还剩</small>
              <strong>{formatRemaining(journey.arriveAt - now)}</strong>
              <div className="trip-ticket__bars" aria-hidden="true" />
            </>
          )}
        </div>
      </article>
    </div>
  );
};

// 调试面板：自动出发上线后删除本组件和下面的调用。
const TripDebugPanel = ({ residents, onChange, notify }) => {
  const candidates = residents.filter((resident) => resident.status === 'home' && !resident.currentJourneyId);
  const [selectedId, setSelectedId] = useState('');
  const activeId = candidates.some((resident) => String(resident.id) === selectedId)
    ? selectedId
    : candidates[0]
      ? String(candidates[0].id)
      : '';

  const handleStart = async (hours, label) => {
    if (!activeId) return;
    try {
      const result = await startTripJourney(Number(activeId), { hours });
      if (!result.ok) {
        notify(getTripReasonText(result.reason));
        return;
      }
      notify(`已出发，${label}后到站`);
      onChange();
    } catch (error) {
      console.warn('调试出发失败：', error);
      notify('出发失败，请看控制台');
    }
  };

  const handleCoins = async () => {
    try {
      await debugGrantCoins(100);
      notify('已领取 100 测试旅费');
      onChange();
    } catch (error) {
      console.warn('领取测试旅费失败：', error);
    }
  };

  return (
    <section className="trip-debug">
      <h3>调试</h3>
      <p>自动出发上线前用来测试车票界面，之后会移除。出发时行李里的东西会全部用掉。</p>

      <label className="trip-debug__row">
        <span>让谁出发</span>
        <select value={activeId} onChange={(event) => setSelectedId(event.target.value)} disabled={candidates.length === 0}>
          {candidates.length === 0 && <option value="">没有可出发的居民</option>}
          {candidates.map((resident) => (
            <option key={resident.id} value={String(resident.id)}>
              {resident.name}
            </option>
          ))}
        </select>
      </label>

      <div className="trip-debug__btns">
        <button type="button" className="trip-btn trip-btn--ghost trip-btn--sm" disabled={!activeId} onClick={() => handleStart(1 / 60, '1 分钟')}>
          出发 1 分钟
        </button>
        <button type="button" className="trip-btn trip-btn--ghost trip-btn--sm" disabled={!activeId} onClick={() => handleStart(1, '1 小时')}>
          出发 1 小时
        </button>
        <button type="button" className="trip-btn trip-btn--ghost trip-btn--sm" disabled={!activeId} onClick={() => handleStart(6, '6 小时')}>
          出发 6 小时
        </button>
        <button type="button" className="trip-btn trip-btn--sm" onClick={handleCoins}>
          领 100 测试旅费
        </button>
      </div>
    </section>
  );
};

const TripTickets = ({ residents, journeys, onChange, notify }) => {
  const [now, setNow] = useState(() => Date.now());
  const notifiedRef = useRef(new Set());
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 刚越过到站时间的车票，通知父组件刷新一次（每张票只通知一次）。
  useEffect(() => {
    const crossed = journeys.filter(
      (journey) => journey.status === 'away' && now >= journey.arriveAt && !notifiedRef.current.has(journey.id)
    );
    if (crossed.length === 0) return;
    crossed.forEach((journey) => notifiedRef.current.add(journey.id));
    onChange();
  }, [now, journeys, onChange]);

  const residentMap = new Map(residents.map((resident) => [resident.id, resident]));
  const awayCount = journeys.filter((journey) => journey.status === 'away' && now < journey.arriveAt).length;
  const openJourney = openId == null ? null : journeys.find((journey) => journey.id === openId) || null;

  const handleClaim = async (journeyId) => {
    try {
      const result = await dismissArrivedJourney(journeyId);
      if (!result.ok) {
        notify(result.reason === 'not_arrived' ? '还没到站，稍等一下再领' : '这张车票已经不在了');
        onChange();
        return;
      }
      setOpenId(null);
      notify('明信片收好了');
      onChange();
    } catch (error) {
      console.warn('领取明信片失败：', error);
    }
  };

  return (
    <div className="trip-view">
      <div className="trip-sec">
        外出中 {awayCount} · 已到站 {journeys.length - awayCount}
      </div>

      {journeys.length === 0 ? (
        <p className="trip-empty">现在大家都在家。角色会自己决定什么时候出门，出门后这里会出现 TA 的车票。</p>
      ) : (
        journeys.map((journey) => (
          <TripTicket
            key={journey.id}
            journey={journey}
            resident={residentMap.get(journey.residentId)}
            now={now}
            onOpen={setOpenId}
          />
        ))
      )}

      <p className="trip-hint">出门的时间和去哪里由角色自己决定，你只负责准备行李。</p>

      {openJourney && (
        <TripPostcard
          journey={openJourney}
          resident={residentMap.get(openJourney.residentId)}
          onChange={onChange}
          onClose={() => setOpenId(null)}
          onClaim={handleClaim}
        />
      )}

      <TripDebugPanel residents={residents} onChange={onChange} notify={notify} />
    </div>
  );
};

export default TripTickets;