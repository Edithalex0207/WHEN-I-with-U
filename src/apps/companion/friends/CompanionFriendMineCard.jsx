import React, { useState } from 'react';

import { DAILY_SOCIAL_QUOTA, FRIENDSHIP_DELTA, FRIEND_MEAL_THRESHOLD, isFriendSocialExhausted } from './companionFriendService';
import { LIVE_CHAT_TOTAL_ROUNDS, hasFreshLiveChat } from './live/companionFriendLiveService';
import CompanionFriendAvatarView from './CompanionFriendAvatarView';

/*
 * "我的朋友"列表里一张朋友卡片：头像/名字/性格、今日剩余额度、
 * 友谊值进度条（50 处标"蹭饭"门槛）、互动/送礼/串门三个按钮、
 * 最新一条 AI 短文（不存档，下一次互动直接覆盖）。
 *
 * 送礼会展开背包物品选择；三个按钮共用 DAILY_SOCIAL_QUOTA 次额度，
 * 用完全部变灰。
 */
const CompanionFriendMineCard = ({ friend, backpackItems, onInteract, onVisit, onGift, onLive, onFeedback }) => {
  const [busy, setBusy] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);

  const used = friend.daily?.used || 0;
  const exhausted = isFriendSocialExhausted(friend);
  const left = Math.max(0, DAILY_SOCIAL_QUOTA - used);
  const unlocked = friend.friendship >= FRIEND_MEAL_THRESHOLD;
  // 额度用完时，只有今天已经开了头的真聊还能进去看/接着聊；完全没聊过就不让进了。
  const liveEntryDisabled = exhausted && !hasFreshLiveChat(friend);

  const run = async (fn) => {
    if (busy || exhausted) return;
    setBusy(true);
    try {
      await fn();
      setGiftOpen(false);
    } catch (error) {
      onFeedback?.(error.message || '这次没成功，请再试一次。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fr">
      <div className="fr-top">
        <CompanionFriendAvatarView avatarId={friend.avatarId} className="sz-48" />
        <div className="fr-name-wrap">
          <p className="fr-name">{friend.name}</p>
          <p className="fr-bio">{`${friend.k1} · ${friend.k2}`}</p>
        </div>
        <div className="quota">
          {Array.from({ length: DAILY_SOCIAL_QUOTA }).map((_, i) => (
            <i key={i} className={i < used ? 'used' : ''} />
          ))}
          {`今日 ${left}/${DAILY_SOCIAL_QUOTA}`}
        </div>
      </div>

      <div className={`bond ${unlocked ? 'ok' : ''}`}>
        <div className="bond-row">
          <span>友谊值</span>
          <span className="val">{`${friend.friendship} / 100`}</span>
        </div>
        <div className="track">
          <div className="fill" style={{ width: `${Math.min(100, friend.friendship)}%` }} />
          <i className="mark" style={{ left: `${FRIEND_MEAL_THRESHOLD}%` }} />
        </div>
      </div>

      <div className="acts">
        <button type="button" className="act talk" disabled={busy || exhausted} onClick={() => run(() => onInteract(friend))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
          互动<small>{`+${FRIENDSHIP_DELTA.talk}`}</small>
        </button>
        <button type="button" className="act gift" disabled={busy || exhausted} onClick={() => setGiftOpen((v) => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7c-2 0-4-.8-4-2.5S10 2 12 5c2-3 4-1.5 4 0S14 7 12 7z" />
          </svg>
          送礼<small>{`+${FRIENDSHIP_DELTA.gift}`}</small>
        </button>
        <button type="button" className="act visit" disabled={busy || exhausted} onClick={() => run(() => onVisit(friend))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
          </svg>
          串门<small>{`+${FRIENDSHIP_DELTA.visit}`}</small>
        </button>
      </div>

      <button type="button" className="cfl-entry" disabled={liveEntryDisabled} onClick={() => onLive?.(friend)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
          <path d="M19 9h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-4-3h-3a2 2 0 0 1-2-2" />
        </svg>
        看它们聊聊天<small>{`+${FRIENDSHIP_DELTA.talk} 友谊 · 约 ${LIVE_CHAT_TOTAL_ROUNDS} 次 AI`}</small>
      </button>

      {giftOpen && (
        <div className="gift-pick">
          {backpackItems.length === 0 ? (
            <p className="gift-empty">背包里还没有东西，先去商店买点吧。</p>
          ) : (
            <>
              <p>{`从背包里挑一件送给${friend.name}`}</p>
              <div className="gift-row">
                {backpackItems.map((item) => (
                  <button
                    type="button"
                    key={item.backpackRowId}
                    disabled={busy}
                    onClick={() => run(() => onGift(friend, item.id))}
                  >
                    {item.name}<em>{`x${item.quantity}`}</em>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {friend.lastStory && (
        <div className="story">
          <b>{friend.lastStory.label}</b>
          {friend.lastStory.text}
        </div>
      )}
    </div>
  );
};

export default CompanionFriendMineCard;