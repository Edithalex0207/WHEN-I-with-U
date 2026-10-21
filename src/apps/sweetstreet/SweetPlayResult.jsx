/*
 * SweetPlayResult.jsx —— 一局结束后的结算页：每位客人的星数、各项心心、经验。
 * 保存状态 saveState：idle | saving | saved | skipped | error
 */

import React from 'react';
import { SWEET_RECIPES, HEARTS_PER_CUSTOMER_STAR } from './sweetPlayData';
import { getShopProgress } from './sweetPlayService';
import { CustomerFigure, StarRow } from './SweetPlayArt';

const TICKET_NOTE = {
  wrongCake: '蛋糕点错了',
  wrongDeco: '装饰顺序点错了',
};

const recipeName = (id) => SWEET_RECIPES.find((r) => r.id === id)?.name || '蛋糕';

const SweetPlayResult = ({ settlement, saveState, saveInfo, onAgain, onHome, onRetry }) => {
  const s = settlement;
  const progress = saveInfo?.shopState ? getShopProgress(saveInfo.shopState) : null;

  let expFraction = 1;
  if (progress && !progress.atMax) {
    const span = Math.max(1, progress.expNeeded - progress.prevExpNeeded);
    expFraction = Math.max(0, Math.min(1, (progress.exp - progress.prevExpNeeded) / span));
  }

  return (
    <div className="sp-page">
      <header className="sp-start-title">
        <h1>营业结束</h1>
        <p className="sp-sub">
          接待 {s.servedCount} 位　走掉 {s.lostCount} 位　没做完 {s.unfinishedCount} 位
        </p>
      </header>

      <section className="sp-card">
        <h2 className="sp-card-title">客人的评价</h2>
        {s.served.length === 0 ? (
          <p className="sp-empty">这一局没有接待到客人</p>
        ) : (
          <ul className="sp-served">
            {s.served.map((item) => (
              <li key={item.id}>
                <CustomerFigure designId={item.designId} mood={item.stars >= 2 ? 'happy' : 'sad'} height={46} />
                <div>
                  <b>{recipeName(item.cookedRecipeId)}</b>
                  {TICKET_NOTE[item.ticketGrade] && <small>{TICKET_NOTE[item.ticketGrade]}</small>}
                </div>
                <StarRow count={item.stars} size={16} />
                <em>+{HEARTS_PER_CUSTOMER_STAR[item.stars] || 0}</em>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sp-card">
        <h2 className="sp-card-title">心心明细</h2>
        <dl className="sp-lines">
          <div><dt>蛋糕</dt><dd>+{s.cakeHearts}</dd></div>
          <div><dt>最高连击 {s.bestCombo}</dt><dd>+{s.comboHearts}</dd></div>
          {s.allHappy && <div><dt>全场满意</dt><dd>+{s.allHappyHearts}</dd></div>}
          {s.starBonusRate > 0 && (
            <div><dt>{Math.round(s.starBonusRate * 100)}% 店铺星级加成</dt><dd>已计入</dd></div>
          )}
        </dl>
        <div className="sp-total">
          <span>本局心心</span>
          <b>+{s.totalHearts}</b>
        </div>
        <div className="sp-total is-exp">
          <span>店铺经验</span>
          <b>+{s.expGain}</b>
        </div>

        {progress && (
          <>
            <div className="sp-exp-bar"><i style={{ width: `${expFraction * 100}%` }} /></div>
            <p className="sp-note">
              {progress.atMax
                ? '小蛋糕店已经满星了'
                : progress.expEnough
                  ? `经验够升 ${progress.star + 1} 星了，点「再来一局」后在开局页花 ${progress.heartCost} 颗心心就能升`
                  : `经验 ${progress.exp} / ${progress.expNeeded}`}
            </p>
          </>
        )}

        {saveState === 'saving' && <p className="sp-note">正在存心心…</p>}
        {saveState === 'error' && (
          <div className="sp-error">
            <p>这一局的奖励没存上</p>
            <button type="button" className="sp-btn" onClick={onRetry}>再存一次</button>
          </div>
        )}
      </section>

      <div className="sp-result-actions">
        <button type="button" className="sp-btn" onClick={onHome} disabled={saveState === 'saving'}>
          回小街
        </button>
        <button
          type="button"
          className="sp-btn primary"
          onClick={onAgain}
          disabled={saveState === 'saving' || saveState === 'error'}
        >
          再来一局
        </button>
      </div>
    </div>
  );
};

export default SweetPlayResult;
