/*
 * SweetPlayStart.jsx —— 「自己来做」的开局页：
 * 店铺星级、经验条、花心心升星、菜单（已解锁 / 未解锁）、道具预留位、开始营业。
 */

import React, { useEffect, useRef, useState } from 'react';
import { SWEET_RECIPES, RUN_DURATION_SEC } from './sweetPlayData';
import { getStarRules } from './sweetPlayEngine';
import { getShopProgress, upgradeShopStar } from './sweetPlayService';
import { CakeArt, StarRow } from './SweetPlayArt';

const UPGRADE_FAIL_TEXT = {
  max: '已经是最高星级了',
  exp: '经验还不够',
  hearts: '心心不够',
  missing: '找不到店铺记录，退出再进来试试',
};

const HeartIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.4 5c2 0 3.5 1.1 4.3 2.6h2.6C14.1 6.1 15.6 5 17.6 5 21 5 23.1 8.4 21.6 11.8 19.5 16.4 12 21 12 21z"
      fill="#FF86A0"
    />
  </svg>
);

const SweetPlayStart = ({ companion, shopState, shopId, onStart, onClose, onDataChange }) => {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef(null);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = (text) => {
    setToast(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 1800);
  };

  const progress = getShopProgress(shopState);
  const rules = getStarRules(progress.star);
  const hearts = companion?.hearts ?? 0;

  let expFraction = 1;
  if (!progress.atMax) {
    const span = Math.max(1, progress.expNeeded - progress.prevExpNeeded);
    expFraction = Math.max(0, Math.min(1, (progress.exp - progress.prevExpNeeded) / span));
  }

  const handleUpgrade = async () => {
    if (busy || progress.atMax) return;
    if (!progress.expEnough) {
      showToast(`经验还差 ${progress.expNeeded - progress.exp}`);
      return;
    }
    if (hearts < progress.heartCost) {
      showToast(`心心不够，还差 ${Math.ceil(progress.heartCost - hearts)} 颗`);
      return;
    }
    setBusy(true);
    try {
      const res = await upgradeShopStar(companion.id, shopId);
      if (res.ok) {
        onDataChange({ companion: res.companion, shopState: res.shopState });
        showToast(`小蛋糕店升到 ${res.shopState.star} 星了`);
      } else {
        showToast(UPGRADE_FAIL_TEXT[res.reason] || '升级失败了');
      }
    } catch (error) {
      console.warn('[SweetPlay] 升星失败:', error);
      showToast('升级失败了，再试一次');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sp-page">
      <button type="button" className="sp-round sp-back" onClick={onClose} aria-label="返回">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="sp-pill sp-hearts-pill">
        <HeartIcon />
        <b>{Math.floor(hearts)}</b>
      </div>

      <header className="sp-start-title">
        <h1>小蛋糕店</h1>
        <StarRow count={progress.star} max={5} size={24} />
      </header>

      <section className="sp-card">
        <div className="sp-exp-head">
          <b>店铺经验</b>
          <span>
            {progress.atMax ? '已满星' : `${progress.exp} / ${progress.expNeeded}`}
          </span>
        </div>
        <div className="sp-exp-bar"><i style={{ width: `${expFraction * 100}%` }} /></div>
        {!progress.atMax && (
          <button
            type="button"
            className={`sp-btn upgrade ${progress.expEnough ? 'is-ready' : ''}`}
            disabled={busy}
            onClick={handleUpgrade}
          >
            升到 {progress.star + 1} 星　花 {progress.heartCost} 颗心心
          </button>
        )}
        <p className="sp-note">
          当前 {progress.star} 星：同时最多 {rules.maxCustomers} 位客人，每位耐心约 {rules.patienceSec} 秒。
          星级越高，客人越多、越没耐心，赚的心心也有加成。
        </p>
      </section>

      <section className="sp-card">
        <h2 className="sp-card-title">今日菜单</h2>
        <div className="sp-menu">
          {SWEET_RECIPES.map((recipe) => {
            const unlocked = recipe.unlockStar <= progress.star;
            return (
              <div key={recipe.id} className={`sp-menu-item ${unlocked ? '' : 'is-locked'}`}>
                <CakeArt recipeId={recipe.id} size={54} />
                <span>{unlocked ? recipe.name : '???'}</span>
                {!unlocked && <small>{recipe.unlockStar} 星解锁</small>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="sp-card">
        <h2 className="sp-card-title">特殊道具</h2>
        <div className="sp-props">
          {[0, 1, 2].map((index) => (
            <div key={index} className="sp-prop-slot">
              <span>道具</span>
              <small>筹备中</small>
            </div>
          ))}
        </div>
      </section>

      <button type="button" className="sp-btn primary big" onClick={onStart}>
        开始营业（{Math.round(RUN_DURATION_SEC / 60)} 分钟）
      </button>

      <div className={`sp-toast ${toast ? 'is-on' : ''}`} role="status">{toast}</div>
    </div>
  );
};

export default SweetPlayStart;
