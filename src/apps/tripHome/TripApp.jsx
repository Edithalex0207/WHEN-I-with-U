// src/apps/tripHome/TripApp.jsx
//
// 「旅行小屋」顶层应用的外壳：顶部返回键 + 标题 + 旅费，下面是三个分页
// （航班 / 行李 / 商店）。外壳负责统一读取数据（旅费和背包、居民、车票），
// 分页之间共用一份，任何分页改了东西都调用 refresh() 重新读取。
//
// 本应用跟旧的「旅行」应用（src/apps/travels/）完全独立，互不引用。
// 它在 App.jsx 里沿用 shell 那种“整页车道、不加默认内边距”的处理，
// 所以页面自己的上下内边距（含安全区）在 tripHome.css 里设置。
//
// 轻提示（toast）用的是水平居中的 position: fixed。项目里文字游戏大厅
// 遇到过 fixed 的元素在宽屏下跑出车道的问题，但那是靠左定位的元素；
// 车道本身也是水平居中的，居中的提示不受影响。

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { getTripState, listActiveJourneys, listTripResidents, settleTripArrivals } from './tripService';
import TripLuggage from './TripLuggage';
import TripShop from './TripShop';
import TripTickets from './TripTickets';
import { BackIcon, CoinDot } from './TripParts';
import './tripHome.css';

const TABS = [
  { id: 'tickets', label: '航班' },
  { id: 'luggage', label: '行李' },
  { id: 'shop', label: '商店' },
];

const TOAST_MS = 2600;

const TripApp = ({ onBackHub }) => {
  const [tab, setTab] = useState('tickets');
  const [data, setData] = useState({ state: null, residents: [], journeys: [] });
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState('');

  const mountedRef = useRef(true);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(toastTimerRef.current);
    };
  }, []);

  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setToast('');
    }, TOAST_MS);
  }, []);

  const refresh = useCallback(async () => {
    try {
      await settleTripArrivals();
      const [state, residents, journeys] = await Promise.all([
        getTripState(),
        listTripResidents(),
        listActiveJourneys(),
      ]);
      if (mountedRef.current) setData({ state, residents, journeys });
    } catch (error) {
      console.warn('旅行小屋读取数据失败：', error);
    } finally {
      if (mountedRef.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="trip-home-app">
      <header className="trip-top">
        <button type="button" className="trip-round" onClick={onBackHub} aria-label="返回">
          <BackIcon />
        </button>
        <h1 className="trip-title">旅行小屋</h1>
        <div className="trip-coins" aria-label="旅行货币">
          <CoinDot />
          <span>{data.state ? data.state.coins : 0}</span>
        </div>
      </header>

      <nav className="trip-tabs" aria-label="分页">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="trip-chip"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {!loaded || !data.state ? (
        <p className="trip-empty">正在翻找行李箱……</p>
      ) : (
        <>
          {tab === 'tickets' && (
            <TripTickets residents={data.residents} journeys={data.journeys} onChange={refresh} notify={notify} />
          )}
          {tab === 'luggage' && (
            <TripLuggage state={data.state} residents={data.residents} onChange={refresh} notify={notify} />
          )}
          {tab === 'shop' && <TripShop state={data.state} onChange={refresh} notify={notify} />}
        </>
      )}

      {toast && (
        <div className="trip-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
};

export default TripApp;