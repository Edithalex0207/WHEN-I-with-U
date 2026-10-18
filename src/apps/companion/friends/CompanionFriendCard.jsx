import React, { useEffect, useRef, useState } from 'react';

import { REQUEST_WAIT_MS, DECLINE_RETRY_COOLDOWN_MS } from './companionFriendService';
import CompanionFriendAvatarView from './CompanionFriendAvatarView';
import { findNpcAvatar } from './companionFriendAvatars';

const pad = (n) => String(n).padStart(2, '0');
const formatMmSs = (ms) => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;
const formatHhMmSs = (ms) => `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;

/*
 * 好友广场的一张名片卡，四种状态（跟视觉预览 v2/v3 一致）：
 *   idle      —— 展示交友宣言 + "发送好友申请"按钮
 *   pending   —— 进度环倒计时，预计 mm:ss 后收到回复
 *   accepted  —— "已成为好友"章 + 薄荷绿回复气泡 + "去朋友页看看"
 *   declined  —— "对方婉拒了"章 + 中性灰蓝回复气泡 + 冷却倒计时/重新申请
 *
 * 倒计时在卡片内部自己 tick（status 是 pending 或"还在冷却"的 declined
 * 才启动定时器），到点了就调 onDue 让父组件去触发一次巡检刷新数据——
 * 不在这里直接改数据，数据只归 companionFriendService.js 管。
 */
const CompanionFriendCard = ({ index, candidate, onSendRequest, onRetryRequest, onGoToFriends, onDue }) => {
  const [now, setNow] = useState(Date.now());

  const isPending = candidate.status === 'pending';
  const isDeclined = candidate.status === 'declined';
  const retryReadyAt = isDeclined ? (candidate.declinedAt || 0) + DECLINE_RETRY_COOLDOWN_MS : null;
  const retryReady = isDeclined && retryReadyAt !== null && now >= retryReadyAt;

  useEffect(() => {
    if (!isPending && !(isDeclined && !retryReady)) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, isDeclined, retryReady]);

  const dueFiredRef = useRef(false);
  useEffect(() => {
    if (isPending && (candidate.sentAt || 0) + REQUEST_WAIT_MS <= now && !dueFiredRef.current) {
      dueFiredRef.current = true;
      onDue?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, now]);

  const stamp = candidate.status === 'pending'
    ? { text: '等待回复', cls: '' }
    : candidate.status === 'accepted'
      ? { text: '已成为好友', cls: 'ok' }
      : candidate.status === 'declined'
        ? { text: '对方婉拒了', cls: 'declined' }
        : null;

  return (
    <div className={`pcard ${candidate.status}`} style={{ '--i': index }}>
      <i className="hole" aria-hidden="true" />
      <div className="top">
        <i className="topbg" style={{ '--bg': findNpcAvatar(candidate.avatarId).bg }} />
        <span className="no">{`NO.${pad(index + 1)}`}</span>
        <span className="big"><CompanionFriendAvatarView avatarId={candidate.avatarId} /></span>
      </div>
      {stamp && <span className={`stampd ${stamp.cls}`}>{stamp.text}</span>}

      <div className="nm">{candidate.name}</div>
      <div className="traits">
        <span className="tag k1">{candidate.k1}</span>
        <span className="tag k2">{candidate.k2}</span>
      </div>
      <div className="decl">
        <small>交友宣言</small>
        <p>{candidate.declaration}</p>
      </div>

      {candidate.status === 'idle' && (
        <button type="button" className="send" onClick={() => onSendRequest(candidate)}>发送好友申请</button>
      )}

      {isPending && (() => {
        const left = Math.max(0, (candidate.sentAt || 0) + REQUEST_WAIT_MS - now);
        const progress = Math.round((1 - left / REQUEST_WAIT_MS) * 100);
        return (
          <div className="wait">
            <div className="ring" style={{ '--p': progress }}>
              <i>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                  <path d="M12 7v5l3 2" />
                </svg>
              </i>
            </div>
            <div>
              <b>好友申请已送出</b>
              <span>{`预计 ${formatMmSs(left)} 后收到回复`}</span>
            </div>
          </div>
        );
      })()}

      {candidate.status === 'accepted' && (
        <div className="reply">
          <small>{`${candidate.name}回复了你`}</small>
          <p>{candidate.replyText}</p>
          <button type="button" onClick={onGoToFriends}>去朋友页看看</button>
        </div>
      )}

      {isDeclined && (
        <div className="decline-box">
          <small>{`${candidate.name}回复了你`}</small>
          <p>{candidate.replyText}</p>
          <div className="cd-row">
            {retryReady ? (
              <button type="button" className="cd-retry on" onClick={() => onRetryRequest(candidate)}>再次申请</button>
            ) : (
              <>
                <button type="button" className="cd-retry off" disabled>暂时还不能申请</button>
                <span className="cd-timer">{`${formatHhMmSs(retryReadyAt - now)} 后可再申请`}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanionFriendCard;