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
import TripRoom from './TripRoom';
import TripShop from './TripShop';
import TripTickets from './TripTickets';
import { BackIcon, CoinDot, TabLuggageIcon, TabRoomIcon, TabShopIcon, TabTicketIcon } from './TripParts';
import { DEFAULT_THEME_HUE } from './tripTheme';
import './tripHome.css';
import './tripRoom.css';

// 底部导航。title 是顶部标题栏在这个分页上显示的字。
const TABS = [
  { id: 'room', label: '小屋', title: '旅行小屋', Icon: TabRoomIcon },
  { id: 'tickets', label: '航班', title: '航班', Icon: TabTicketIcon },
  { id: 'luggage', label: '行李', title: '行李', Icon: TabLuggageIcon },
  { id: 'shop', label: '商店', title: '商店', Icon: TabShopIcon },
];

const TOAST_MS = 2600;

const TripApp = ({ onBackHub }) => {
  const [tab, setTab] = useState('room');
  const [data, setData] = useState({ state: null, residents: [], journeys: [] });
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState('');
  // 日/夜状态提到外壳，用来给整页换色
  const [isNight, setIsNight] = useState(false);
  // 主题色相：由房间页从当前房间背景图里取主色后报上来，写进 --trip-h，
  // 整个应用的底色/卡片/主按钮都从它派生。取不到时用默认色相。
  const [themeHue, setThemeHue] = useState(DEFAULT_THEME_HUE);

  const handleThemeHue = useCallback((hue) => {
    setThemeHue(Number.isFinite(hue) ? hue : DEFAULT_THEME_HUE);
  }, []);

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
    <div
      className="trip-home-app"
      data-trip-time={isNight ? 'night' : 'day'}
      style={{ '--trip-h': themeHue }}
    >
      <div className="trip-bg-fill" aria-hidden="true" />
      <header className="trip-top">
        <button type="button" className="trip-round" onClick={onBackHub} aria-label="返回">
          <BackIcon />
        </button>
        <h1 className="trip-title">{(TABS.find((item) => item.id === tab) || TABS[0]).title}</h1>
        <div className="trip-coins" aria-label="旅行货币">
          <CoinDot />
          <span>{data.state ? data.state.coins : 0}</span>
        </div>
      </header>

      {!loaded || !data.state ? (
        <p className="trip-empty">正在翻找行李箱……</p>
      ) : (
        <>
          {tab === 'room' && (
            <TripRoom
              residents={data.residents}
              journeys={data.journeys}
              notify={notify}
              onNightChange={setIsNight}
              onThemeHue={handleThemeHue}
              onResidentsChange={refresh}
            />
          )}
          {tab === 'tickets' && (
            <TripTickets residents={data.residents} journeys={data.journeys} onChange={refresh} notify={notify} />
          )}
          {tab === 'luggage' && (
            <TripLuggage state={data.state} residents={data.residents} onChange={refresh} notify={notify} />
          )}
          {tab === 'shop' && <TripShop state={data.state} onChange={refresh} notify={notify} />}
        </>
      )}

      <nav className="trip-dock" aria-label="分页">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`trip-dk trip-dk--${id}${tab === id ? ' is-on' : ''}`}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      {toast && (
        <div className="trip-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
};

export default TripApp;