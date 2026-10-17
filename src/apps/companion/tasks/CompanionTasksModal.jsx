import React from 'react';

import CompanionHeartIcon from '../CompanionHeartIcon';
import './companionTasksModal.css';

/*
 * 每日任务面板——"小记事本"视觉（用户要求做得更萌、更Q弹，参照螺旋
 * 装订本子 + 横线纸 + 胶带的样子，视觉预览确认过）。
 *
 * 纯展示组件，不改任何数据——任务是在各自的互动点（喂食/戳一戳/发
 * 表情包/上学/……）自动完成的，用户在这个面板里不需要点什么"完成"
 * 按钮，所以这里没有点击任务行的交互。勾选框变绿、文字划线、爱心进度
 * 点亮起来，这几个"做完一项"的小动效全部交给 companionStatusAlertCard
 * 同款思路——靠 CSS transition 在 task.done 从 false 变 true 时自动播放，
 * 不需要额外的 JS state。
 */
const HEART_PATH = 'M12,21.35l-1.45-1.32C5.4,15.36,2,12.28,2,8.5 C2,5.42,4.42,3,7.5,3c1.74,0,3.41,0.81,4.5,2.09 C13.09,3.81,14.76,3,16.5,3 C19.58,3,22,5.42,22,8.5 c0,3.78-3.4,6.86-8.55,11.54L12,21.35z';

const todayLabel = () => {
  const now = new Date();
  return `${now.getMonth() + 1}月${now.getDate()}日`;
};

const CompanionTasksModal = ({ view, onClose }) => {
  if (!view) return null;

  const { tasks, completedCount, totalCount, bonusHearts, allDone } = view;

  return (
    <div className="cp-overlay center ctn-overlay">
      <div className="cp-backdrop" onClick={onClose} />

      <div className="ctn-stage">
        <div className="ctn-notebook">
          <i className="ctn-back" aria-hidden="true" />

          <div className="ctn-page">
            <div className="ctn-rings" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, index) => <i key={index} className="ctn-ring" />)}
            </div>
            <i className="ctn-tape" aria-hidden="true" />

            <button type="button" onClick={onClose} className="ctn-close" aria-label="合上本子">×</button>

            <div className="ctn-title-row">
              <span className="ctn-title">今日任务</span>
              <span className="ctn-date">{todayLabel()}</span>
            </div>
            <p className="ctn-sub">做完一件划掉一件，心心就到账啦</p>

            <div className="ctn-progress-row">
              {tasks.map((task) => (
                <span key={task.id} className={`ctn-pip ${task.done ? 'is-on' : ''}`}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d={HEART_PATH} /></svg>
                </span>
              ))}
              <span className="ctn-progress-text">{completedCount} / {totalCount}</span>
            </div>

            <div className="ctn-lines">
              {tasks.map((task) => (
                <div key={task.id} className={`ctn-row ${task.done ? 'is-done' : ''}`}>
                  <span className="ctn-box">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <div className="ctn-text">
                    <span className="ctn-label">
                      {task.label}
                      {task.target > 1 && !task.done && (
                        <span className="ctn-count"> {task.progress}/{task.target}</span>
                      )}
                    </span>
                    {task.note && <div className="ctn-note">{task.note}</div>}
                  </div>
                  <span className={`ctn-reward ${task.reward >= 3 ? 'is-big' : ''}`}>
                    <CompanionHeartIcon className="ctn-reward-ic" />
                    +{task.reward}
                  </span>
                </div>
              ))}
            </div>

            <div className={`ctn-sticky ${allDone ? 'is-claimed' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="9" width="18" height="12" rx="2" />
                <path d="M12 9v12M3 13h18M12 9c-2.5 0-4.5-1-4.5-2.8S9 3.5 10.5 4.7 12 9 12 9zm0 0c2.5 0 4.5-1 4.5-2.8S15 3.5 13.5 4.7 12 9 12 9z" />
              </svg>
              {allDone ? (
                <span>额外奖励 <b>+{bonusHearts}</b> 心心已到账</span>
              ) : (
                <span>全部做完，再奖励 <b>+{bonusHearts}</b> 心心</span>
              )}
            </div>

            <p className="ctn-foot">
              {allDone ? '今天的页面写满啦，明天见' : `还差 ${totalCount - completedCount} 个，每天凌晨会换一页新的`}
            </p>

            {allDone && (
              <div className="ctn-stamp" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
                <span>全部</span>
                <span>完成</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanionTasksModal;