import React from 'react';

import CompanionFriendAvatarView from './CompanionFriendAvatarView';
import '../custody/companionCustodyLetter.css';
import './companionFriendMealLetter.css';

const HEART_PATH = 'M12 21s-7.5-4.6-10-9.3C.5 8.1 2.3 5 5.7 5c2 0 3.5 1.1 4.3 2.6C10.8 6.1 12.3 5 14.3 5c3.4 0 5.2 3.1 3.7 6.7C19.5 16.4 12 21 12 21z';

/*
 * "蹭饭"信件：友谊值 >= 50 的朋友趁托管时跑来蹭了顿饭之后弹一次
 * （取走即清空，见 companionFriendMealService.takePendingFriendMealLetter）。
 *
 * 壳子直接复用 companionCustodyLetter.css 的 .ccl-* 样式（信纸/胶带/
 * 按钮），只多一个"两个头像 + 中间爱心"的专属头图，所以单独写了
 * companionFriendMealLetter.css 补这一小块，不碰 custody 原样式表。
 * 时间线里回看的样子也在这个新 css 里（.cp-tl-item.friend_meal）。
 */
const CompanionFriendMealLetter = ({ letter, companionName, companionAvatarUrl, onClose }) => {
  if (!letter) return null;

  const name = companionName || '小伙伴';

  return (
    <div className="cp-overlay center ccl-overlay">
      <div className="cp-backdrop" onClick={onClose} />

      <div className="ccl-stage">
        <div className="ccl-letter cfm-letter" role="dialog" aria-label="蹭饭小信笺">
          <i className="ccl-tape" aria-hidden="true" />

          <div className="cfm-duo">
            <span className="cfm-av companion">
              {companionAvatarUrl ? <img src={companionAvatarUrl} alt={name} /> : null}
            </span>
            <span className="cfm-heart">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d={HEART_PATH} /></svg>
            </span>
            <span className="cfm-av friend">
              <CompanionFriendAvatarView avatarId={letter.friendAvatarId} />
            </span>
          </div>

          <p className="ccl-title">{`${letter.friendName}来蹭饭啦`}</p>
          <p className="ccl-body">{letter.line || '趁托管的时候，溜达过来蹭了一顿。'}</p>

          <div className="ccl-chips">
            <span className="ccl-chip feed">{`+${letter.satietyGain} 饱食度`}</span>
            <span className="ccl-chip play">{`+${letter.friendshipGain} 友谊值`}</span>
          </div>

          <button type="button" className="ccl-btn" onClick={onClose}>知道啦</button>
          <p className="ccl-sign">{`${letter.friendName} · 蹭饭 · 自动触发`}</p>
        </div>
      </div>
    </div>
  );
};

export default CompanionFriendMealLetter;