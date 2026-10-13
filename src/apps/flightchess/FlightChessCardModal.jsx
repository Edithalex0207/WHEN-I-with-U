// src/apps/flightchess/FlightChessCardModal.jsx
//
// 踩到格子 / 抽到卡时弹出的翻牌弹窗。
//   - 抽卡格：先看到卡背（有 backUrl 就用图，没有就用渐变占位），点一下翻面
//   - 其它格子：卡背短暂出现后自动翻面
//   - 用户本人落子：翻面后出现输入框，写完点「回应完成」让角色做出反应
//   - 角色落子：翻面后由父组件调用 AI，这里只负责显示「正在回应」和回应内容
// 本组件不做任何规则判断，所有状态由 FlightChessRoom 管理。

import React, { useEffect, useState } from 'react';

const Dots = () => (
  <span className="fc-dots" aria-label="正在输入"><span /><span /><span /></span>
);

const FlightChessCardModal = ({
  modal,
  onFlip,
  onAnswerChange,
  onSubmitAnswer,
  onContinue,
}) => {
  const [localFlipHint, setLocalFlipHint] = useState(false);

  // 非抽卡格：卡背出现一小会儿后自动翻面
  useEffect(() => {
    if (!modal || modal.flipped || modal.needsFlip) return undefined;
    const timer = setTimeout(() => onFlip(), 650);
    return () => clearTimeout(timer);
  }, [modal, onFlip]);

  useEffect(() => {
    if (!modal || !modal.needsFlip || modal.flipped) {
      setLocalFlipHint(false);
      return undefined;
    }
    const timer = setTimeout(() => setLocalFlipHint(true), 900);
    return () => clearTimeout(timer);
  }, [modal]);

  if (!modal) return null;

  const deck = modal.deckMeta || {};
  const tone = deck.tone || modal.tone || 'gray';
  const lines = String(modal.text || '').split('\n').filter(Boolean);
  const backStyle = deck.backUrl ? { backgroundImage: `url(${deck.backUrl})` } : undefined;
  const canFlip = modal.needsFlip && !modal.flipped;

  return (
    <div className="fc-modal-backdrop">
      <div className="fc-modal">
        <div
          className={`fc-card3d${modal.flipped ? ' is-flipped' : ''}${canFlip ? ' can-flip' : ''}`}
          onClick={canFlip ? onFlip : undefined}
          role={canFlip ? 'button' : undefined}
        >
          <div className="fc-card3d-inner">
            <div className={`fc-card-face fc-card-back tone-${tone}`} style={backStyle}>
              <span className="fc-card-back-name">{deck.name || modal.title}</span>
              {deck.subtitle && <span className="fc-card-back-hint">{deck.subtitle}</span>}
              {canFlip && localFlipHint && (
                <span className="fc-card-back-hint">轻触翻开</span>
              )}
            </div>

            <div className="fc-card-face fc-card-front">
              <div className="fc-card-title">{modal.title}</div>
              <div className="fc-card-text">
                {lines.map((line, index) => (
                  <p
                    key={index}
                    className={/^(网恋版|线下版)/.test(line) ? 'is-variant' : ''}
                  >
                    {line}
                  </p>
                ))}
                {modal.author && <span className="fc-card-author">—— {modal.author} 写的</span>}
              </div>
              {modal.effectHint && <span className="fc-effect-pill">{modal.effectHint}</span>}
            </div>
          </div>
        </div>

        {modal.flipped && (
          <>
            <div className="text-xs opacity-60">
              轮到 <b>{modal.actorName}</b>
            </div>

            {!modal.actorIsCharacter && modal.stage === 'responding' && (
              <>
                <textarea
                  className="fc-answer-box"
                  placeholder="写下你的回应（也可以直接口头完成，不写也行）..."
                  value={modal.answer}
                  onChange={(e) => onAnswerChange(e.target.value)}
                  rows={3}
                />
                <button type="button" className="fc-btn" onClick={onSubmitAnswer}>
                  回应完成
                </button>
              </>
            )}

            {modal.loading && (
              <div className="fc-reaction">
                <b>{modal.reactorName}</b>
                <Dots />
              </div>
            )}

            {modal.stage === 'reaction' && !modal.loading && (
              <>
                <div className="fc-reaction">
                  <b>{modal.reactorName}</b>
                  {modal.reaction}
                </div>
                <button type="button" className="fc-btn" onClick={onContinue}>
                  继续
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default FlightChessCardModal;