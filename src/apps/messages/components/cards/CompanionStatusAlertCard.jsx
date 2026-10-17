import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Droplets, Sparkles, UtensilsCrossed } from 'lucide-react';

import { getCompanionByChat } from '../../../companion/companionService';
import './companionStatusAlertCard.css';

/*
 * #4 状态不佳卡片——小伙伴好几项状态同时偏低时，往聊天室发的提醒卡片。
 *
 * 2026-10 美化版：不再跟 theme.css 的 --card-bg/--accent-color 这些
 * 全局主题变量走，直接用小伙伴系统自己固定的那套白蓝配色（跟
 * companionPage.css 的 .cp-root 同源，具体变量定义在
 * companionStatusAlertCard.css 里，不 import 那份 CSS，避免耦合）——
 * 这是用户明确要求的：这张卡片要"看起来就是小伙伴系统自己的东西"，
 * 不随聊天窗当前选的主题变色。
 *
 * 低项小药丸的颜色也是从 companionPage.css 里 StatBar 三种 tone 抄过来的
 * 语义色（饱食度=黄油色、心情=粉色、清洁度=天蓝色），跟小伙伴页面里的
 * 进度条是同一套颜色记忆，图标也用回 CompanionPage.jsx 里 ACTIONS/StatBar
 * 用的那三个 lucide 图标，不额外发明新图标。
 *
 * 头像/名字是实时查的（像 CompanionOfferCard 那样）——这条消息可能是
 * 很久之前发的，中途换过头像/改过名字，要显示当下的样子。
 *
 * "知道了"：用户明确要求提示要"显示在卡片上"，不是另外弹一个悬浮通知。
 * 所以点了之后按钮行原地换成一句"小伙伴正在等你哦～"，卡片本身先不动，
 * 停留一小会儿，再让卡片整体收起来（不是瞬间消失）。
 */

const LOW_STAT_META = {
  satiety: { label: '饱食度偏低', icon: UtensilsCrossed, chipClass: 'satiety' },
  mood: { label: '心情偏低', icon: Sparkles, chipClass: 'mood' },
  cleanliness: { label: '清洁度偏低', icon: Droplets, chipClass: 'cleanliness' },
};

const ACK_HOLD_MS = 1200;
const COLLAPSE_MS = 320;

// 跟 CompanionPage.jsx 的 formatLogTime 一个思路，这里独立写一份，
// 不 import 那边（那边是页面内部工具，没有导出）。
const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} 小时前`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const PawIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <circle cx="7" cy="7" r="2.3" />
    <circle cx="12" cy="5" r="2.3" />
    <circle cx="17" cy="7" r="2.3" />
    <path d="M12 10c-4 0-6.5 2.6-6.5 5.3 0 2.2 1.9 3.2 3.6 2.4.9-.4 1.8-.7 2.9-.7s2 .3 2.9.7c1.7.8 3.6-.2 3.6-2.4 0-2.7-2.5-5.3-6.5-5.3Z" />
  </svg>
);

const CompanionStatusAlertCard = ({ message, chatId, onOpen }) => {
  // phase: 'visible'（正常展示）→ 'acked'（按钮行换成提示语，卡片不变）
  // → 'collapsing'（卡片收起动画）→ 'collapsed'（真正隐藏）
  const [phase, setPhase] = useState('visible');
  const [companionInfo, setCompanionInfo] = useState(null); // { name, avatarUrl } | null
  const ackTimerRef = useRef(null);
  const collapseTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    getCompanionByChat(chatId).then((companion) => {
      if (!cancelled && companion) {
        setCompanionInfo({ name: companion.name, avatarUrl: companion.avatarUrl });
      }
    }).catch(() => {
      // 查不到就用兜底文案，不影响卡片正常展示
    });

    return () => { cancelled = true; };
  }, [chatId]);

  useEffect(() => () => {
    if (ackTimerRef.current) window.clearTimeout(ackTimerRef.current);
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
  }, []);

  if (phase === 'collapsed') return null;

  const handleDismiss = () => {
    if (phase !== 'visible') return;
    setPhase('acked');
    ackTimerRef.current = window.setTimeout(() => {
      setPhase('collapsing');
      collapseTimerRef.current = window.setTimeout(() => setPhase('collapsed'), COLLAPSE_MS);
    }, ACK_HOLD_MS);
  };

  const lowKeys = Array.isArray(message?.metadata?.lowKeys) ? message.metadata.lowKeys : [];
  const companionName = companionInfo?.name || '小伙伴';
  const timeText = formatRelativeTime(message?.timestamp);

  return (
    <div className="my-1 w-full max-w-sm select-none">
      <div className={`csac-card animate-fade-in-up ${phase === 'collapsing' ? 'is-collapsing' : ''}`}>
        <i className="csac-blob-a" aria-hidden="true" />
        <i className="csac-blob-b" aria-hidden="true" />
        <PawIcon className="csac-paw" />

        <div className="csac-head">
          <div className="csac-avatar-wrap">
            <i className="csac-ring" aria-hidden="true" />
            <div className="csac-avatar">
              {companionInfo?.avatarUrl ? (
                <img src={companionInfo.avatarUrl} alt="" />
              ) : (
                <PawIcon />
              )}
            </div>
          </div>
          <div className="csac-head-text">
            <span className="csac-label">{companionName} · 小伙伴提醒</span>
            {timeText && <span className="csac-time">{timeText}</span>}
          </div>
        </div>

        <p className="csac-body">{message?.content}</p>

        {lowKeys.length > 0 && (
          <div className="csac-chip-row">
            {lowKeys.map((key) => {
              const meta = LOW_STAT_META[key];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <span key={key} className={`csac-chip ${meta.chipClass}`}>
                  <Icon />
                  {meta.label}
                </span>
              );
            })}
          </div>
        )}

        {phase === 'visible' ? (
          <div className="csac-btn-row">
            <button type="button" onClick={onOpen} className="csac-btn-main">
              去看看TA
              <ChevronRight />
            </button>
            <button type="button" onClick={handleDismiss} className="csac-btn-sub">
              知道了
            </button>
          </div>
        ) : (
          <div className="csac-ack-row">
            <PawIcon />
            小伙伴正在等你哦～
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanionStatusAlertCard;