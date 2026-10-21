/*
 * SweetStreetApp.jsx —— 「甜品小街」顶层 app（第一片：只有空壳首页）。
 *
 * 根节点是 fixed 铺满视口的整页覆盖层（跟 HabitatRoom / ChallengeBoardPage 同一个做法），
 * 所以不需要在 App.jsx 的 <main> 里加整页 app 的 padding 例外。
 * 返回按钮是悬浮小圆钮，没有整条顶栏。
 *
 * 这一片的按钮都还不能玩：点了只弹一句"下一片开放"。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { loadSweetStreetHome } from './sweetStreetService';
import { SWEET_SHOPS, SWEET_STREET_IMAGES } from './sweetStreetData';
   import SweetPlayApp from './SweetPlayApp';
   import './sweetStreet.css';

const CupcakeArt = () => (
  <svg viewBox="0 0 64 64" width="64" height="64" fill="none" aria-hidden="true">
    <circle cx="32" cy="32" r="30" fill="#FFF0F4" />
    <path d="M18 34h28l-3.5 16a3 3 0 0 1-3 2.4H24.5a3 3 0 0 1-3-2.4L18 34z" fill="#FFC9A8" />
    <path d="M25 36l1.5 14M32 36v14M39 36l-1.5 14" stroke="#F5A982" strokeWidth="2" strokeLinecap="round" />
    <path d="M16 34c0-5 4-8 8-8 0-5 4-9 8-9s8 4 8 9c4 0 8 3 8 8z" fill="#FF9DB5" />
    <path d="M24 30c3 2 6 2 9 0" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
    <circle cx="32" cy="15" r="4" fill="#E8386A" />
    <path d="M32 11c1-3 3-4 5-4" stroke="#6FBF8F" strokeWidth="2" strokeLinecap="round" />
    <circle cx="27" cy="38" r="1.6" fill="#7A4A3A" />
    <circle cx="37" cy="38" r="1.6" fill="#7A4A3A" />
    <path d="M30 41c1 1.2 3 1.2 4 0" stroke="#7A4A3A" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const MilkTeaArt = () => (
  <svg viewBox="0 0 64 64" width="56" height="56" fill="none" aria-hidden="true">
    <circle cx="32" cy="32" r="30" fill="#FBF0E2" />
    <path d="M33 8l4 12" stroke="#E8638A" strokeWidth="3" strokeLinecap="round" />
    <rect x="18" y="18" width="28" height="6" rx="3" fill="#fff" stroke="#E8C9A0" strokeWidth="2" />
    <path d="M20 24h24l-3 25a3 3 0 0 1-3 2.6H26a3 3 0 0 1-3-2.6L20 24z" fill="#F3D9B8" />
    <path d="M21 33h22l-1.5 16a3 3 0 0 1-3 2.6H25.5a3 3 0 0 1-3-2.6L21 33z" fill="#C99A6B" />
    <circle cx="28" cy="46" r="2.2" fill="#6B4630" />
    <circle cx="35" cy="48" r="2.2" fill="#6B4630" />
    <circle cx="32" cy="42" r="2.2" fill="#6B4630" />
    <circle cx="28" cy="29" r="1.4" fill="#7A4A3A" />
    <circle cx="36" cy="29" r="1.4" fill="#7A4A3A" />
  </svg>
);

const formatLogTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const SweetStreetApp = ({ onBackHub, chatId }) => {
  const [home, setHome] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | no-companion | error
       const [toast, setToast] = useState('');
     const [playingShopId, setPlayingShopId] = useState(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (chatId === null || chatId === undefined) {
        setStatus('no-companion');
        return;
      }
      try {
        const data = await loadSweetStreetHome(chatId);
        if (cancelled) return;
        if (!data) {
          setStatus('no-companion');
          return;
        }
        setHome(data);
        setStatus('ready');
      } catch (error) {
        console.warn('[SweetStreet] 读取失败:', error);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = useCallback((text) => {
    setToast(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 1800);
  }, []);

      const hearts = home?.companion?.hearts ?? 0;

     // 「自己来做」:整页换成玩法界面,玩完回来时首页的心心和星级已经是最新的
     if (playingShopId && home?.companion) {
       return (
         <SweetPlayApp
           companion={home.companion}
           shopState={home.shopStates?.[playingShopId]}
           shopId={playingShopId}
           onClose={() => setPlayingShopId(null)}
           onDataChange={({ companion, shopState }) => setHome((prev) => (prev ? {
             ...prev,
             companion,
             shopStates: { ...prev.shopStates, [playingShopId]: shopState },
           } : prev))}
         />
       );
     }
  const bgStyle = SWEET_STREET_IMAGES.background
    ? { backgroundImage: `url(${SWEET_STREET_IMAGES.background})` }
    : undefined;

  const renderShop = (shop) => {
    if (shop.status === 'open') {
      const state = home?.shopStates?.[shop.id];
      return (
        <div className="ss-shop" key={shop.id}>
          {shop.signUrl ? (
            <img className="ss-shop-sign-img" src={shop.signUrl} alt="" />
          ) : (
            <>
              <div className="ss-awning">
                {Array.from({ length: 8 }).map((_, i) => (
                  <i key={i} className={i % 2 === 0 ? 'a' : 'b'} />
                ))}
              </div>
              <div className="ss-awning-fringe">
                {Array.from({ length: 8 }).map((_, i) => (
                  <i key={i} className={i % 2 === 0 ? 'a' : 'b'} />
                ))}
              </div>
            </>
          )}

          <div className="ss-shop-body">
            <div className="ss-shop-head">
              {shop.imageUrl ? (
                <img className="ss-shop-pic" src={shop.imageUrl} alt={shop.name} />
              ) : (
                <CupcakeArt />
              )}
              <div className="ss-shop-info">
                <div className="ss-shop-name">
                  <span>{shop.name}</span>
                  <em className="ss-tag open">营业中</em>
                </div>
                <p>{shop.tagline}</p>
                {state && (
                  <small className="ss-star">
                    {'★'.repeat(state.star)}
                    {'☆'.repeat(Math.max(0, 5 - state.star))}
                  </small>
                )}
              </div>
            </div>

            <div className="ss-actions">
              <button
                type="button"
                className="ss-btn play"
                onClick={() => setPlayingShopId(shop.id)}
              >
                自己来做
              </button>
              <button
                type="button"
                className="ss-btn work"
                onClick={() => showToast('打工下一片开放')}
              >
                派TA去打工
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="ss-shop-soon" key={shop.id}>
        {shop.imageUrl ? (
          <img className="ss-shop-pic soon" src={shop.imageUrl} alt={shop.name} />
        ) : (
          <MilkTeaArt />
        )}
        <div className="ss-shop-info">
          <div className="ss-shop-name soon">
            <span>{shop.name}</span>
            <em className="ss-tag soon">筹备中</em>
          </div>
          <p>{shop.tagline}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="ss-root" style={bgStyle}>
      <div className="ss-col">
        <button type="button" className="ss-back" onClick={onBackHub} aria-label="返回">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="ss-hearts" aria-label="心心">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.4 5c2 0 3.5 1.1 4.3 2.6h2.6C14.1 6.1 15.6 5 17.6 5 21 5 23.1 8.4 21.6 11.8 19.5 16.4 12 21 12 21z" fill="#FF86A0" />
          </svg>
          <b>{Math.floor(hearts)}</b>
        </div>

        <header className="ss-title">
          {SWEET_STREET_IMAGES.streetSign ? (
            <img src={SWEET_STREET_IMAGES.streetSign} alt="甜品小街" />
          ) : (
            <h1>甜品小街</h1>
          )}
          <p>一家一家慢慢开起来</p>
        </header>

        {status === 'loading' && <div className="ss-note">正在开门…</div>}
        {status === 'no-companion' && (
          <div className="ss-note">这个聊天窗还没有领养小伙伴，先去小伙伴页领养一只吧。</div>
        )}
        {status === 'error' && <div className="ss-note">读取失败了，退出再进来试试。</div>}

        {status === 'ready' && (
          <>
            {SWEET_SHOPS.map(renderShop)}

            <section className="ss-log">
              <h2>打工小日志</h2>
              {home.logs.length === 0 ? (
                <div className="ss-log-empty">
                  {SWEET_STREET_IMAGES.emptyLogIllustration && (
                    <img src={SWEET_STREET_IMAGES.emptyLogIllustration} alt="" />
                  )}
                  <span>还没有记录，派TA出门打一次工吧</span>
                </div>
              ) : (
                <ul>
                  {home.logs.map((log) => (
                    <li key={log.id}>
                      <small>{formatLogTime(log.settledAt)}</small>
                      <p>{log.reportText}</p>
                      <b>+{log.hearts}</b>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <div className={`ss-toast ${toast ? 'is-on' : ''}`} role="status">{toast}</div>
      </div>
    </div>
  );
};

export default SweetStreetApp;
