// src/apps/flightchess/FlightChessExitConfirm.jsx
//
// 离开对局前的二次确认，防止误触返回键。
// 只负责显示和回调；是否需要确认由 FlightChessRoom 决定。

import React from 'react';
import './flightChessExit.css';

const FlightChessExitConfirm = ({ hasPendingTask, onStay, onLeave }) => (
  <div className="fc-exit-backdrop" role="dialog" aria-modal="true" aria-label="离开确认">
    <div className="fc-exit-card">
      <h3>要离开这局飞行棋吗？</h3>
      <p>
        进度会自动保存。
        {hasPendingTask
          ? '你正在做的这张卡的任务还没聊完，下次回来会从这张卡重新开始。'
          : '下次回来会接着玩。'}
      </p>
      <div className="fc-exit-actions">
        <button type="button" className="fc-exit-btn is-ghost" onClick={onLeave}>离开</button>
        <button type="button" className="fc-exit-btn" onClick={onStay}>继续玩</button>
      </div>
    </div>
  </div>
);

export default FlightChessExitConfirm;