// 「航班」分页：外出中的居民显示成一张张车票/机票（火车票或机票由目的地
// 决定），进度虚线上的小车/小飞机按时间前进，到站后盖"已到站"章。
//
// 到点的车票由本组件每秒检查一次，刚越过到站时间时调用一次 onChange()，
// 让父组件重新读取（settleTripArrivals 会把它在数据库里标成已到站）。

import React, { useEffect, useRef, useState } from 'react';

import { getTripItem } from './tripCatalog';
import { dismissArrivedJourney } from './tripService';
import TripPostcard from './TripPostcard';
import { TripAvatar, TripVehicleIcon } from './TripParts';

const MINUTE_MS = 60 * 1000;

// 车票的一次性入场动效（出发翻转揭幕 / 到站图章砸下）只在“刚出发”“刚到站”
// 的这段时间窗口内触发：departAt/arriveAt 离 now 很近时才判定为“新”，
// 过了窗口自然就不再是新的，不需要额外的 ref/Set 记一次性播放过没有。
const ENTRY_ANIM_WINDOW_MS = 2000;

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
  const isNewDeparture = !arrived && now - journey.departAt < ENTRY_ANIM_WINDOW_MS;
  const isNewArrival = arrived && now - journey.arriveAt < ENTRY_ANIM_WINDOW_MS;
  const baggage = ['food', 'prop', 'gift']
    .map((slot) => getTripItem(journey.luggage?.[slot]))
    .filter(Boolean);

  return (
    <div className="trip-ticket-wrap">
            <article
        className={`trip-ticket trip-ticket--${plane ? 'plane' : 'train'}${arrived ? ' is-done' : ''}${
          isNewDeparture ? ' trip-anim-in' : ''
        }${isNewArrival ? ' trip-anim-arrive' : ''}`}
      >
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
    </div>
  );
};

export default TripTickets;