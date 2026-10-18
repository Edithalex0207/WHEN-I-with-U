import React, { useEffect, useRef, useState } from 'react';

import {
  DAILY_SOCIAL_QUOTA,
  getFriendPlazaView,
  rerollFriendPlaza,
  sendFriendRequest,
  retryFriendRequest,
} from './companionFriendService';
import CompanionFriendCard from './CompanionFriendCard';
import CompanionFriendNoteModal from './CompanionFriendNoteModal';
import CompanionFriendAvatarView from './CompanionFriendAvatarView';
import './companionFriendPage.css';
import './companionFriendCard.css';

/*
 * 好友页：广场 / 我的朋友 两个标签（视觉预览 v2/v3 确认过）。
 *
 * 这一版（好友广场 slice）只做广场本身 + 我的朋友的只读列表——互动/
 * 送礼/串门三个社交按钮放在下一块交付，这里先让用户能看到已经加好的
 * 朋友、确认申请-等待-回复整条链路没问题。
 *
 * 渲染在 CompanionPage.jsx 的 .cp-root 里，直接用 cp-overlay 的壳子。
 */
const CompanionFriendPage = ({ companion, onClose, onRefresh }) => {
  const [tab, setTab] = useState('plaza');
  const [loading, setLoading] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  const [noteTarget, setNoteTarget] = useState(null); // { candidate, mode }
  const [noteBusy, setNoteBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const seenFriendCountRef = useRef(companion?.friends?.length || 0);
  const [hasNewFriend, setHasNewFriend] = useState(false);

  const plaza = companion?.friendPlaza || [];
  const friends = companion?.friends || [];

  // 第一次进来，广场还没有候选数据——初始化满 4 张（不是"自动刷新"）。
  useEffect(() => {
    if (!companion) return;
    if (Array.isArray(companion.friendPlaza) && companion.friendPlaza.length > 0) return;

    let cancelled = false;
    setLoading(true);
    getFriendPlazaView(companion.id)
      .then(() => { if (!cancelled) return onRefresh?.(); })
      .catch((error) => { if (!cancelled) setFeedback(error.message || '广场加载失败，请再试一次。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companion?.id]);

  // 本次进页面后，好友数变多了（有人同意申请了）就冒个粉色小红点。
  useEffect(() => {
    if (friends.length > seenFriendCountRef.current) setHasNewFriend(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends.length]);

  const showFeedback = (text) => {
    setFeedback(text);
    setTimeout(() => setFeedback(''), 2600);
  };

  const handleReroll = async () => {
    if (!companion || rerolling) return;
    setRerolling(true);
    try {
      await rerollFriendPlaza(companion.id);
      await onRefresh?.();
    } catch (error) {
      showFeedback(error.message || '换一批失败，请再试一次。');
    } finally {
      setRerolling(false);
    }
  };

  const handleConfirmNote = async (note) => {
    if (!noteTarget || !companion) return;
    setNoteBusy(true);
    try {
      if (noteTarget.mode === 'retry') {
        await retryFriendRequest(companion.id, noteTarget.candidate.id, note);
      } else {
        await sendFriendRequest(companion.id, noteTarget.candidate.id, note);
      }
      await onRefresh?.();
      setNoteTarget(null);
    } catch (error) {
      showFeedback(error.message || '发送失败，请再试一次。');
    } finally {
      setNoteBusy(false);
    }
  };

  const switchToMine = () => {
    setTab('mine');
    seenFriendCountRef.current = friends.length;
    setHasNewFriend(false);
  };

  if (!companion) return null;

  return (
    <div className="cp-overlay center cfp-overlay">
      <div className="cp-backdrop" onClick={onClose} />

      <div className="cfp-stage">
        <button type="button" className="cfp-close" onClick={onClose} aria-label="关闭好友页">×</button>

        <div className="cfp-tabs">
          <i className={`cfp-ind ${tab === 'mine' ? 'r' : ''}`} />
          <button type="button" className={tab === 'plaza' ? 'on' : ''} onClick={() => setTab('plaza')}>好友广场</button>
          <button type="button" className={tab === 'mine' ? 'on' : ''} onClick={switchToMine}>
            我的朋友 <span>{friends.length}</span>
            {hasNewFriend && <i className="cfp-tab-dot" />}
          </button>
        </div>

        {tab === 'plaza' && (
          <div className="cfp-pane">
            <div className="plaza-head">
              <div>
                <h4>今天广场上有谁</h4>
                <p>左右滑动看名片，点"换一批"才有新面孔</p>
              </div>
              <button type="button" className={`refresh ${rerolling ? 'spin' : ''}`} onClick={handleReroll} disabled={rerolling || loading}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
                </svg>
                换一批
              </button>
            </div>

            {loading && plaza.length === 0 ? (
              <div className="empty">广场正在准备候选，请稍等…</div>
            ) : plaza.length === 0 ? (
              <div className="empty">广场上暂时没人了<br />点"换一批"看看新面孔</div>
            ) : (
              <div className="deck">
                {plaza.map((candidate, index) => (
                  <CompanionFriendCard
                    key={candidate.id}
                    index={index}
                    candidate={candidate}
                    onSendRequest={(c) => setNoteTarget({ candidate: c, mode: 'send' })}
                    onRetryRequest={(c) => setNoteTarget({ candidate: c, mode: 'retry' })}
                    onGoToFriends={switchToMine}
                    onDue={onRefresh}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'mine' && (
          <div className="cfp-pane">
            {friends.length === 0 ? (
              <div className="empty">还没有朋友，去广场看看吧</div>
            ) : (
              <div className="cfp-mine-list">
                {friends.map((friend) => (
                  <div key={friend.id} className="cfp-mine-row">
                    <CompanionFriendAvatarView avatarId={friend.avatarId} className="sz-44" />
                    <div className="cfp-mine-info">
                      <p className="nm">{friend.name}</p>
                      <p className="bio">{`${friend.k1} · ${friend.k2}`}</p>
                    </div>
                    <div className="cfp-mine-pts">{`${friend.friendship} / 100`}</div>
                  </div>
                ))}
                <p className="cfp-mine-note">互动 / 送礼 / 串门即将上线，每位朋友每天共 {DAILY_SOCIAL_QUOTA} 次</p>
              </div>
            )}
          </div>
        )}

        {feedback && <div className="cfp-toast">{feedback}</div>}
      </div>

      {noteTarget && (
        <CompanionFriendNoteModal
          candidate={noteTarget.candidate}
          mode={noteTarget.mode}
          busy={noteBusy}
          onConfirm={handleConfirmNote}
          onClose={() => setNoteTarget(null)}
        />
      )}
    </div>
  );
};

export default CompanionFriendPage;