import React, { useEffect, useRef, useState } from 'react';

import {
  getInbox,
  hasDecidingInbox,
  acceptInboxRequest,
  declineInboxRequest,
  delegateInboxRequest,
  processInboxDecisions,
} from './companionFriendInboxService';
import CompanionFriendAvatarView from './CompanionFriendAvatarView';
import { findNpcAvatar } from './companionFriendAvatars';
import './companionFriendInbox.css';

const formatAgo = (timestamp, now) => {
  const diff = Math.max(0, now - (timestamp || 0));
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
};

// 小伙伴自己的头像：有图用图，没有就退回一个简单的小脸。
const PetFace = ({ companion, className }) => (
  <span className={className}>
    {companion?.avatarUrl ? (
      <img src={companion.avatarUrl} alt="" />
    ) : (
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" fill="#FFE9C9" />
        <path d="M9 15 7 6l9 5zM31 15l2-9-9 5z" fill="#F7C27A" />
        <circle cx="20" cy="22" r="12" fill="#F7C27A" />
        <circle cx="16" cy="21" r="1.6" fill="#24415A" />
        <circle cx="24" cy="21" r="1.6" fill="#24415A" />
        <ellipse cx="20" cy="26" rx="2.2" ry="1.5" fill="#FF86A0" />
      </svg>
    )}
  </span>
);

const PawTrail = () => (
  <div className="cfi-paws" aria-hidden="true">
    {[0, 1, 2, 3].map((i) => (
      <svg key={i} viewBox="0 0 24 24">
        <ellipse cx="12" cy="16" rx="5" ry="4.2" fill="currentColor" />
        <circle cx="6" cy="10" r="2.2" fill="currentColor" />
        <circle cx="10" cy="6" r="2.2" fill="currentColor" />
        <circle cx="14.5" cy="6" r="2.2" fill="currentColor" />
        <circle cx="18.5" cy="10" r="2.2" fill="currentColor" />
      </svg>
    ))}
  </div>
);

/*
 * 收件箱页（视觉参考 v2）：两个文件夹标签——
 *   新信：待处理的信（便利贴 + 三种处理方式）和"小伙伴考虑中"的信
 *   旧信：已处理的信，拍立得照片墙 + 贴纸
 *
 * 数据只归 companionFriendInboxService.js 管，这里调用后统一 onRefresh。
 * 小伙伴考虑中的信到点后，页面自己触发一次 processInboxDecisions
 * （平时由 runFriendTick 每分钟顺路处理）。
 */
const CompanionFriendInboxPage = ({ companion, onBack, onClose, onRefresh, onFeedback }) => {
  const [folder, setFolder] = useState('new');
  const [busyId, setBusyId] = useState(null);
  const [now, setNow] = useState(Date.now());

  const petName = companion?.name || '小伙伴';
  const inbox = getInbox(companion);
  const openLetters = inbox
    .filter((r) => r.status === 'pending' || r.status === 'deciding')
    .sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0));
  const oldLetters = inbox
    .filter((r) => r.status === 'accepted' || r.status === 'declined')
    .sort((a, b) => (b.repliedAt || 0) - (a.repliedAt || 0));

  const deciding = hasDecidingInbox(companion);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), deciding ? 1000 : 30000);
    return () => clearInterval(timer);
  }, [deciding]);

  const dueFiredRef = useRef(false);
  useEffect(() => {
    const anyDue = inbox.some((r) => r.status === 'deciding' && (r.decideAt || 0) <= now);
    if (!anyDue) {
      dueFiredRef.current = false;
      return;
    }
    if (dueFiredRef.current) return;
    dueFiredRef.current = true;
    processInboxDecisions(companion.id).then(() => onRefresh?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  const run = async (request, fn) => {
    if (busyId) return;
    setBusyId(request.id);
    try {
      await fn(companion.id, request.id);
      await onRefresh?.();
    } catch (error) {
      onFeedback?.(error.message || '这次没成功，请再试一次。');
      await onRefresh?.();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="cfi-root">
      <div className="cfi-sub-head">
        <button type="button" className="cfi-back" onClick={onBack} aria-label="返回广场">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div>
          <h4>{`${petName}收到的信`}</h4>
          <p>{`自己拆，或者让${petName}自己拿主意`}</p>
        </div>
      </div>
      <button type="button" className="cfp-close" onClick={onClose} aria-label="关闭好友页">×</button>

      <div className="cfi-folders">
        <button type="button" className={folder === 'new' ? 'on' : ''} onClick={() => setFolder('new')}>
          新信{openLetters.length > 0 && <em>{openLetters.length}</em>}
        </button>
        <button type="button" className={folder === 'old' ? 'on' : ''} onClick={() => setFolder('old')}>
          旧信{oldLetters.length > 0 && <em>{oldLetters.length}</em>}
        </button>
      </div>

      <div className="cfi-board">
        {folder === 'new' && (
          openLetters.length === 0 ? (
            <div className="cfi-empty">
              信箱里暂时没有新信
              <br />
              过一阵子再打开好友广场看看
            </div>
          ) : (
            <div className="cfi-stack">
              {openLetters.map((request) => (
                <div className="cfi-letter" key={request.id}>
                  <i className="cfi-tape" aria-hidden="true" />
                  <div className="cfi-sender">
                    <span className="cfi-av-pop"><CompanionFriendAvatarView avatarId={request.avatarId} /></span>
                    <div className="cfi-who">
                      <p className="cfi-nm">{request.name}</p>
                      <div className="cfi-tags">
                        <span className="tag k1">{request.k1}</span>
                        <span className="tag k2">{request.k2}</span>
                      </div>
                    </div>
                    <span className="cfi-postmark">{formatAgo(request.receivedAt, now)}<br />寄到</span>
                  </div>

                  <div className="cfi-says">{request.message}</div>

                  {request.status === 'pending' && (
                    <div className="cfi-decide">
                      <button
                        type="button"
                        className="cfi-ask-pet"
                        disabled={busyId === request.id}
                        onClick={() => run(request, delegateInboxRequest)}
                      >
                        <PetFace companion={companion} className="cfi-mini-av" />
                        <span>
                          {`让${petName}决定`}
                          <small>看心情拿主意</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="cfi-stampbtn no"
                        disabled={busyId === request.id}
                        onClick={() => run(request, declineInboxRequest)}
                        aria-label="我来拒绝"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                          <path d="M7 7l10 10M17 7 7 17" />
                        </svg>
                        <small>婉拒</small>
                      </button>
                      <button
                        type="button"
                        className="cfi-stampbtn yes"
                        disabled={busyId === request.id}
                        onClick={() => run(request, acceptInboxRequest)}
                        aria-label="我来通过"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                        <small>通过</small>
                      </button>
                    </div>
                  )}

                  {request.status === 'deciding' && (
                    <>
                      <div className="cfi-pondering">
                        <PetFace companion={companion} className="cfi-pet-sit" />
                        <div className="cfi-dots-bubble">
                          <div className="cfi-dots"><i /><i /><i /></div>
                        </div>
                        <div className="cfi-pond-txt">{`${petName}正在想……`}</div>
                      </div>
                      <PawTrail />
                    </>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {folder === 'old' && (
          oldLetters.length === 0 ? (
            <div className="cfi-empty">还没有处理过的信</div>
          ) : (
            <div className="cfi-wall">
              {oldLetters.map((request) => {
                const accepted = request.status === 'accepted';
                const byPet = request.decidedBy === 'pet';
                const stickerText = byPet
                  ? (accepted ? `${petName}点头` : `${petName}摇头`)
                  : (accepted ? '已通过' : '已婉拒');
                const stickerCls = byPet ? (accepted ? 'pet-ok' : 'pet-no') : (accepted ? 'ok' : 'no');
                const replyLine = request.replyText
                  || (accepted ? `你拆开了这封信，${request.name}成了朋友。` : `你婉拒了${request.name}的来信。`);

                return (
                  <div className="cfi-polaroid" key={request.id}>
                    <i className="cfi-tape" aria-hidden="true" />
                    <div className="cfi-photo" style={{ background: findNpcAvatar(request.avatarId).bg }}>
                      <span className="cfi-photo-av"><CompanionFriendAvatarView avatarId={request.avatarId} /></span>
                    </div>
                    <p className="cfi-cap">{request.name}</p>
                    <p className="cfi-cap-sub">{`${request.k1} · ${request.k2}`}</p>
                    <span className={`cfi-sticker ${stickerCls}`}>{stickerText}</span>
                    <div className={`cfi-reply-tag ${accepted ? 'ok' : ''}`}>{replyLine}</div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default CompanionFriendInboxPage;