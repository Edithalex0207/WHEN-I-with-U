import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  DAILY_SOCIAL_QUOTA,
  FRIENDSHIP_DELTA,
  isFriendSocialExhausted,
} from '../companionFriendService';
import { describeChatResetTime } from '../../chat/companionChatService';
import {
  LIVE_CHAT_TOTAL_ROUNDS,
  getLiveChatOrEmpty,
  startFriendLiveChat,
  runFriendLiveChatRound,
} from './companionFriendLiveService';
import CompanionFriendAvatarView from '../CompanionFriendAvatarView';
import './companionFriendLive.css';

/*
 * "看它们聊聊天"弹窗：user 只是旁观者，没有输入框。
 *
 * 界面状态全部从 liveChat（见 companionFriendLiveService.js 的注释）
 * 和 friend.daily 算出来，不另外维护一套"状态机"：
 *   notStarted  今天还没聊过（liveChat.sceneSeed 是空的）
 *   resumable   已经开了头但还没聊完（不管是手动"先停一下"还是某一轮
 *               失败），按钮是"接着聊"，不用再弹成本提醒
 *   finished    这一场的 LIVE_CHAT_TOTAL_ROUNDS 轮已经聊完
 * "开始聊"/"再聊一次"（开始新的一场）每次都会先弹成本提醒面板；
 * "接着聊"（继续没聊完的一场）直接继续，不用再确认一次。
 *
 * 轮与轮之间可以"先停一下"：点了之后让当前这一轮（已经在请求中的）
 * 跑完，不再开始下一轮——继续加载中的那次请求没法真的取消，只是不再
 * 排下一个。
 */
const CompanionFriendLiveModal = ({ companion, friend, character, onClose, onRefresh }) => {
  const [friendState, setFriendState] = useState(friend);
  const [liveChat, setLiveChat] = useState(() => getLiveChatOrEmpty(friend));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmCost, setConfirmCost] = useState(false);
  const keepGoingRef = useRef(true);
  const listRef = useRef(null);

  const petName = companion?.name || '小伙伴';
  const friendName = friendState?.name || '朋友';

  const notStarted = !liveChat.sceneSeed;
  const finished = liveChat.roundsCompleted >= LIVE_CHAT_TOTAL_ROUNDS;
  const resumable = !notStarted && !finished;
  const exhausted = isFriendSocialExhausted(friendState || {});
  const used = friendState?.daily?.used || 0;
  const left = Math.max(0, DAILY_SOCIAL_QUOTA - used);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [liveChat.lines.length, busy]);

  const syncFromResult = (result) => {
    if (!result) return;
    if (result.friend) setFriendState(result.friend);
    if (result.liveChat) setLiveChat(result.liveChat);
  };

  // 跑完一轮就顺手让父级（"我的朋友"页）刷新一次 companion——友谊值/
  // 今日额度/lastStory 这些别处也要看的东西才能跟着更新。
  const notifyRefresh = () => { onRefresh?.(); };

  const runLoop = async () => {
    setBusy(true);
    setError('');
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const result = await runFriendLiveChatRound(companion.id, friendState.id, { character });
        syncFromResult(result);
        notifyRefresh();
        if (result.finished) break;
        if (!keepGoingRef.current) break;
      }
    } catch (err) {
      setError(err?.message || '这一轮没聊成功，请再试一次。');
    } finally {
      setBusy(false);
    }
  };

  const beginFreshSession = async () => {
    setConfirmCost(false);
    setBusy(true);
    setError('');
    try {
      const { friend: startedFriend, liveChat: startedLiveChat } = await startFriendLiveChat(companion.id, friend.id);
      setFriendState(startedFriend);
      setLiveChat(startedLiveChat);
      keepGoingRef.current = true;
      setBusy(false);
      await runLoop();
    } catch (err) {
      setError(err?.message || '没能开始这次聊天，请再试一次。');
      setBusy(false);
    }
  };

  const handleResume = () => {
    if (busy) return;
    keepGoingRef.current = true;
    runLoop();
  };

  const handleStop = () => {
    keepGoingRef.current = false;
  };

  const openCostConfirm = () => {
    if (busy) return;
    setConfirmCost(true);
  };

  const renderAvatar = (speaker) => (
    speaker === 'friend' ? (
      <span className="cfl-avatar is-friend">
        <CompanionFriendAvatarView avatarId={friendState?.avatarId} style={{ width: '100%', height: '100%', border: 'none', boxShadow: 'none' }} />
      </span>
    ) : (
      <span className="cfl-avatar">
        {companion?.avatarUrl
          ? <img src={companion.avatarUrl} alt="" />
          : <span className="cfl-avatar-letter">{Array.from(petName)[0]}</span>}
      </span>
    )
  );

  const headerSubtitle = useMemo(() => {
    if (notStarted) return '今天还没聊过';
    if (busy) return `第 ${Math.min(liveChat.roundsCompleted + 1, LIVE_CHAT_TOTAL_ROUNDS)}/${LIVE_CHAT_TOTAL_ROUNDS} 轮`;
    if (finished) return '刚刚聊完';
    return '聊到一半';
  }, [notStarted, busy, finished, liveChat.roundsCompleted]);

  let footerLeft;
  if (resumable || busy) {
    const nowIndex = busy ? liveChat.roundsCompleted : -1;
    footerLeft = (
      <>
        <span className="cfl-rounds">
          {Array.from({ length: LIVE_CHAT_TOTAL_ROUNDS }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <i key={i} className={i < liveChat.roundsCompleted ? 'done' : (i === nowIndex ? 'now' : '')} />
          ))}
          {`第 ${Math.min(liveChat.roundsCompleted + (busy ? 1 : 0), LIVE_CHAT_TOTAL_ROUNDS)}/${LIVE_CHAT_TOTAL_ROUNDS} 轮`}
        </span>
        <span className="cfl-cost">{busy ? '先停一下，可以省下后面的调用' : '已经聊的内容都保留着'}</span>
      </>
    );
  } else {
    footerLeft = (
      <>
        <span className="cfl-quota">
          {Array.from({ length: DAILY_SOCIAL_QUOTA }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <i key={i} className={i < used ? 'used' : ''} />
          ))}
          {`今天还能聊 ${left} 次`}
        </span>
        <span className="cfl-cost">
          {finished
            ? (exhausted ? `明天再来找${friendName}吧` : `再聊一次，约 ${LIVE_CHAT_TOTAL_ROUNDS} 次 AI 调用`)
            : `连聊 ${LIVE_CHAT_TOTAL_ROUNDS} 轮，约 ${LIVE_CHAT_TOTAL_ROUNDS} 次 AI 调用`}
        </span>
      </>
    );
  }

  let actionButton;
  if (busy) {
    actionButton = (
      <button type="button" className="cfl-btn is-stop" onClick={handleStop}>
        <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4.5" height="14" rx="1.5" /><rect x="13.5" y="5" width="4.5" height="14" rx="1.5" /></svg>
        先停一下
      </button>
    );
  } else if (exhausted && !resumable) {
    actionButton = (
      <button type="button" className="cfl-btn" disabled>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
        聊够啦
      </button>
    );
  } else if (resumable) {
    actionButton = (
      <button type="button" className="cfl-btn is-resume" onClick={handleResume}>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
        接着聊
      </button>
    );
  } else {
    actionButton = (
      <button type="button" className="cfl-btn" onClick={openCostConfirm}>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
        {finished ? '再聊一次' : '开始聊'}
      </button>
    );
  }

  if (!companion || !friendState) return null;

  return (
    <div className="cp-overlay center cfl-overlay">
      <div className="cp-backdrop" onClick={onClose} />

      <div className="cfl-stage">
        <header className="cfl-header">
          <span className="cfl-pair">
            {renderAvatar('pet')}
            {renderAvatar('friend')}
          </span>
          <div className="cfl-title">
            <b>{`${petName} 和 ${friendName}`}</b>
            <span>{headerSubtitle}</span>
          </div>
          <button type="button" className="cfl-close" onClick={onClose} aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="cfl-list" ref={listRef}>
          <div className="cfl-notice">
            今天的聊天记录会在<b>{`明天${describeChatResetTime()}清空`}</b>，想留住的内容不会被保存。
          </div>

          {!notStarted && (
            <div className="cfl-scene">
              <small>这次的开场</small>
              {liveChat.sceneSeed}
            </div>
          )}

          {notStarted && !busy && (
            <p className="cfl-empty">{`${petName}和${friendName}还没碰面，`}<br />点开始，看看它们今天聊什么。</p>
          )}

          {liveChat.lines.map((line, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} className={`cfl-row is-${line.speaker}`}>
              {renderAvatar(line.speaker)}
              <div className="cfl-col">
                <span className="cfl-who">{line.speaker === 'friend' ? friendName : petName}</span>
                <div className="cfl-bubble">{line.text}</div>
              </div>
            </div>
          ))}

          {busy && (
            <div className={`cfl-row is-${liveChat.openingSpeaker}`}>
              {renderAvatar(liveChat.openingSpeaker)}
              <div className="cfl-col">
                <span className="cfl-who">{liveChat.openingSpeaker === 'friend' ? friendName : petName}</span>
                <div className="cfl-bubble cfl-typing"><i /><i /><i />正在想</div>
              </div>
            </div>
          )}

          {finished && !busy && (
            <div className="cfl-reward">
              <i />
              {`友谊值 +${FRIENDSHIP_DELTA.talk}`}
              <span>{exhausted ? '今天的次数用完了' : `今天还剩 ${left} 次`}</span>
            </div>
          )}
        </div>

        {error && <p className="cfl-error">{error}</p>}

        <div className="cfl-footer">
          <div className="cfl-left">{footerLeft}</div>
          {actionButton}
        </div>

        {confirmCost && (
          <div className="cfl-sheet">
            <div className="cfl-sheet-scrim" onClick={() => setConfirmCost(false)} />
            <div className="cfl-sheet-card">
              <h4>开始这次聊天？</h4>
              <p>每聊一轮会调用 <b>1 次 AI</b>，这次会连聊 {LIVE_CHAT_TOTAL_ROUNDS} 轮，大约 <b>{LIVE_CHAT_TOTAL_ROUNDS} 次</b>，会消耗一些 token。</p>
              <p>你只是在旁边看着，聊的过程中可以随时先停一下。</p>
              <div className="cfl-sheet-actions">
                <button type="button" className="cfl-btn is-stop" onClick={() => setConfirmCost(false)}>先不了</button>
                <button type="button" className="cfl-btn" onClick={beginFreshSession}>开始聊</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanionFriendLiveModal;