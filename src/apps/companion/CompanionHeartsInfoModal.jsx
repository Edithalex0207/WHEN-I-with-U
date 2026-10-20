import React from 'react';
import { Sparkles } from 'lucide-react';

import CompanionHeartIcon from './CompanionHeartIcon';

/*
 * 心心说明弹窗：纯展示，点心心数字旁边的"？"图标打开。
 *
 * 列表里的数字是手写的说明文案，跟 companionService.js（FREE_ACTION_EFFECT/
 * CHAT_HEART_* 那几个常量）、companionEventService.js（选项事件奖励）里
 * 真正的数值没有代码层面的绑定——以后调整那边的数值，记得回来改一下这里
 * 的文案，不然会对不上。
 */
const HEART_SOURCES = [
  { label: '喂食 / 清洁 / 玩耍', desc: '每次互动 +2 心心。' },
  { label: '戳一戳', desc: '不会产生心心，只给小伙伴一点点心情加成。' },
  { label: '聊天里回应', desc: '当天第 10 次回应 +1，之后每 20 次 +0.5，单日最多 +5。' },
   { label: 'TA 自己顺路照顾小伙伴', desc: '角色不在你身边时自己去看了看，也会 +2。' },
  { label: '特殊事件', desc: '部分事件会额外给心心；选项事件给多给少看你选了哪个。' },
  { label: '小游戏：接住掉落物', desc: '每天前几局按发挥给心心，发挥越好给得越多。' },
  { label: '小游戏：小伙伴弹珠', desc: '每天前几关的通关奖励按关卡递增；当天三关都通关还有一份额外奖励。' },
  { label: '心心许愿池', desc: '每天最多投 3 次，投 1 / 5 / 10 颗；可能翻倍、拿回一半、中大奖，也可能被池水收下。' },
];

const CompanionHeartsInfoModal = ({ onClose }) => (
  <div className="cp-overlay center">
    <div className="cp-backdrop" onClick={onClose} />

    <div className="cp-panel cp-hearts-info-card">
      <div className="cp-hearts-info-icon" aria-hidden="true">
        <CompanionHeartIcon className="cp-heart-ic" />
      </div>

      <h4>心心是怎么来的</h4>

      <ul className="cp-hearts-info-list">
        {HEART_SOURCES.map((item) => (
          <li key={item.label}>
            <b>{item.label}</b>
            <span>{item.desc}</span>
          </li>
        ))}
      </ul>

      <p className="cp-note">
        <Sparkles className="cp-ic" />
        攒下的心心可以在商店换食物、衣服、新场景。
      </p>

      <button type="button" onClick={onClose} className="cp-btn main cp-hearts-info-close">
        知道啦
      </button>
    </div>
  </div>
);

export default CompanionHeartsInfoModal;