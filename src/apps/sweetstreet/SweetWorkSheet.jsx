/*
 * SweetWorkSheet.jsx —— 「派TA去打工」的底部面板。
 *
 * 四种样子：
 *   没有在打工  选 1 / 4 / 8 小时，派出去
 *   打工中      倒计时，可以提前召回（只拿一半比例的心心）
 *   到点了      手动领取，不过期
 *   领完之后    显示这次的汇报文案和到手的心心
 *
 * 打工的是这个聊天室的角色，心心加到这个聊天室的小伙伴身上。
 * 开工 / 领取 / 召回之后调 onChanged()，让上一层重新读取首页数据。
 */

import React, { useEffect, useState } from 'react';
import { WORK_TIERS } from './sweetStreetData';
import { SWEET_SHOPS } from './sweetStreetData';
import {
  getWorkOverview,
  startWork,
  settleWork,
  getTierHearts,
  getFullHearts,
  getRecallHearts,
} from './sweetWorkService';
import './sweetWork.css';

const formatCountdown = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

const FAIL_TEXT = {
  busy: '角色已经在打工了',
  tier: '这一档不存在',
  missing: '这份工已经结算过了',
};

const SweetWorkSheet = ({ companion, chatId, shopStates, activeWork, onChanged, onClose }) => {
  const [overview, setOverview] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [confirmRecall, setConfirmRecall] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const activeId = activeWork?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    getWorkOverview(companion.id, chatId)
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch((err) => console.warn('[SweetWork] 读取失败:', err));
    return () => {
      cancelled = true;
    };
  }, [companion.id, chatId, activeId, result]);

  useEffect(() => {
    if (!activeWork) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activeWork]);

  const workerName = activeWork?.workerName || overview?.workerName || 'TA';
  const dailyCap = overview?.dailyCap ?? 60;
  const todayEarned = overview?.todayEarned ?? 0;
  const room = Math.max(0, dailyCap - todayEarned);
  const shopStar = (shopId) => shopStates?.[shopId]?.star ?? 1;

  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      console.warn('[SweetWork] 操作失败:', err);
      setError('操作失败了，再试一次');
    } finally {
      setBusy(false);
    }
  };

  const handleStart = (tierId) => run(async () => {
    const res = await startWork(companion.id, chatId, tierId);
    if (!res.ok) {
      setError(FAIL_TEXT[res.reason] || '没能出发');
      return;
    }
    await onChanged();
  });

  const handleSettle = () => run(async () => {
    const res = await settleWork(companion.id, activeWork.id);
    setConfirmRecall(false);
    if (!res.ok) {
      setError(FAIL_TEXT[res.reason] || '没能结算');
      await onChanged();
      return;
    }
    setResult(res);
    await onChanged();
  });

  const renderResult = () => (
    <>
      <h3 className="sw-title">打工汇报</h3>
      <p className="sw-report">{result.reportText}</p>
      <div className="sw-got">
        <span>带回心心</span>
        <b>+{result.hearts}</b>
      </div>
      {result.truncated && (
        <p className="sw-note">今天打工的心心已经到 {dailyCap} 的上限了，多出来的这次没算进去。</p>
      )}
      <button type="button" className="sw-btn primary" onClick={onClose}>好的</button>
    </>
  );

  const renderIdle = () => (
    <>
      <h3 className="sw-title">派{workerName}去打工</h3>
      <p className="sw-sub">今天打工已领 {todayEarned} / {dailyCap} 颗心心</p>
      <div className="sw-tiers">
        {WORK_TIERS.map((tier) => {
          const hearts = getTierHearts(tier, shopStar('cake'));
          return (
            <button
              key={tier.id}
              type="button"
              className="sw-tier"
              disabled={busy}
              onClick={() => handleStart(tier.id)}
            >
              <b>{tier.hours} 小时</b>
              <span>约 {hearts} 心心</span>
            </button>
          );
        })}
      </div>
      {room === 0 && <p className="sw-note">今天打工的上限到了，现在派出去也领不到心心。</p>}
      <p className="sw-note">打工期间还是可以正常聊天；到点后回来领取，不会过期。</p>
    </>
  );

  const renderWorking = () => {
    const shop = SWEET_SHOPS.find((s) => s.id === activeWork.shopId);
    const star = shopStar(activeWork.shopId);
    const done = now >= activeWork.endsAt;
    const total = activeWork.endsAt - activeWork.startedAt;
    const fraction = Math.max(0, Math.min(1, (now - activeWork.startedAt) / total));

    if (done) {
      return (
        <>
          <h3 className="sw-title">{workerName}回来啦</h3>
          <p className="sw-sub">在{shop?.name || '小店'}干满了 {activeWork.hours} 小时</p>
          <div className="sw-got">
            <span>可领取</span>
            <b>约 {getFullHearts(activeWork, star)}</b>
          </div>
          <button type="button" className="sw-btn primary" disabled={busy} onClick={handleSettle}>
            领取心心
          </button>
        </>
      );
    }

    return (
      <>
        <h3 className="sw-title">{workerName}打工中</h3>
        <p className="sw-sub">在{shop?.name || '小店'}，一共 {activeWork.hours} 小时</p>
        <div className="sw-clock">{formatCountdown(activeWork.endsAt - now)}</div>
        <div className="sw-bar"><i style={{ width: `${fraction * 100}%` }} /></div>
        <p className="sw-note">
          现在召回只能拿到约 {getRecallHearts(activeWork, star, now)} 颗心心（干满能拿约 {getFullHearts(activeWork, star)} 颗）。
        </p>
        <button
          type="button"
          className={`sw-btn ${confirmRecall ? 'danger' : ''}`}
          disabled={busy}
          onClick={() => (confirmRecall ? handleSettle() : setConfirmRecall(true))}
        >
          {confirmRecall ? '确定提前召回' : '提前召回'}
        </button>
      </>
    );
  };

  let body;
  if (result) body = renderResult();
  else if (activeWork) body = renderWorking();
  else body = renderIdle();

  return (
    <div className="sw-mask" onClick={onClose} role="presentation">
      <div className="sw-sheet" role="dialog" aria-label="打工" onClick={(event) => event.stopPropagation()}>
        {body}
        {error && <p className="sw-error">{error}</p>}
        {!result && (
          <button type="button" className="sw-close" onClick={onClose}>关闭</button>
        )}
      </div>
    </div>
  );
};

export default SweetWorkSheet;