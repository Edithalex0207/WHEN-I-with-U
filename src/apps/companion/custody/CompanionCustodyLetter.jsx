import React from 'react';

import { CUSTODY_SHORT_HEARTS_TEXT } from './companionCustodyService';
import './companionCustodyLetter.css';

const HEART_PATH = 'M12 21s-7.5-4.6-10-9.3C.5 8.1 2.3 5 5.7 5c2 0 3.5 1.1 4.3 2.6C10.8 6.1 12.3 5 14.3 5c3.4 0 5.2 3.1 3.7 6.7C19.5 16.4 12 21 12 21z';

const KIND_CHIPS = [
  { kind: 'feed', text: '吃饱饱' },
  { kind: 'clean', text: '洗香香' },
  { kind: 'play', text: '陪玩耍' },
];

/*
 * "贴心照顾"信件：托管执行后弹一次（取走即清空，见
 * companionCustodyService.takePendingCustodyLetter）。之后在"最近的动态"
 * 里用 .cp-tl-item.custody 的样子回看。
 *
 * 配色全部走 --cp-* 蓝/粉/黄油色，跟商店 chip、状态卡片同源，
 * 不单独引入暖色体系。标签只显示真正做过的动作；买了道具才有"为小伙伴买了"那一行；
 * 心心不够才有温和提示那一行。
 */
const CompanionCustodyLetter = ({ letter, characterName, onClose }) => {
  if (!letter) return null;

  const name = characterName || 'TA';
  const kinds = letter.kinds || [];
  const purchases = letter.purchases || [];
  const didSomething = kinds.length > 0 || purchases.length > 0;

  return (
    <div className="cp-overlay center ccl-overlay">
      <div className="cp-backdrop" onClick={onClose} />

      <div className="ccl-stage">
        <div className="ccl-letter" role="dialog" aria-label="贴心照顾小信笺">
          <i className="ccl-tape" aria-hidden="true" />

          <div className="ccl-seal" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d={HEART_PATH} /></svg>
          </div>

          <p className="ccl-title">{`来自${name}的小信笺`}</p>
          <p className="ccl-body">
            {didSomething ? '你不在的时候，我替我们俩照顾好小伙伴啦~' : '小伙伴好像需要照顾一下~'}
          </p>

          {kinds.length > 0 && (
            <div className="ccl-chips">
              {KIND_CHIPS.filter((chip) => kinds.includes(chip.kind)).map((chip) => (
                <span key={chip.kind} className={`ccl-chip ${chip.kind}`}>{`+ ${chip.text}`}</span>
              ))}
            </div>
          )}

          {purchases.length > 0 && (
            <p className="ccl-row buy">
              {`为小伙伴买了：${purchases.map((item) => item.name).join('、')}`}
            </p>
          )}

          {letter.short && (
            <p className="ccl-row short">{CUSTODY_SHORT_HEARTS_TEXT}</p>
          )}

          <button type="button" className="ccl-btn" onClick={onClose}>{`知道啦，谢谢${name}`}</button>
          <p className="ccl-sign">托管照顾 · 自动完成</p>
        </div>
      </div>
    </div>
  );
};

export default CompanionCustodyLetter;