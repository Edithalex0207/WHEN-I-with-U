// src/apps/margin-notes/library/ReaderCommentSheet.jsx
//
// 「请 TA 一起读」面板：先选范围（这一段/这一章/你划线的地方），
// 再调一次 AI，结果只在这里展示一次，不写进聊天记录。
// 具体怎么生成由父组件的 onPickScope(scopeId) 决定（它知道怎么从阅读页
// 拿到对应范围的原文），这里只管选择、加载态、展示结果这几个状态。

import React, { useState } from 'react';
import { X } from 'lucide-react';

const SCOPES = [
  { id: 'para', label: '这一段', hint: '只看你正在读的这一段' },
  { id: 'chapter', label: '这一章', hint: '整章读完，说说整体感觉' },
  { id: 'highlights', label: '你划线的地方', hint: '只看你在这本书里划过的线和想法' },
];

export default function ReaderCommentSheet({
  characterName,
  canUseHighlights,
  onPickScope,
  onClose,
}) {
  const [step, setStep] = useState('pick'); // pick | loading | result | error
  const [scopeLabel, setScopeLabel] = useState('');
  const [text, setText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handlePick = async (scope) => {
    setScopeLabel(scope.label);
    setStep('loading');
    try {
      const result = await onPickScope(scope.id);
      if (!result) {
        setStep('error');
        setErrorMessage('这个范围还没有内容可以说。');
        return;
      }
      setText(result);
      setStep('result');
    } catch (error) {
      console.warn('[阅读器] 请 TA 一起读失败：', error);
      setStep('error');
      setErrorMessage(error?.message || '没能生成，请再试一次。');
    }
  };

  return (
    <div className="mn-rd-sheet-backdrop" onClick={onClose} role="presentation">
      <section
        className="mn-rd-comment"
        role="dialog"
        aria-modal="true"
        aria-label="请 TA 一起读"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mn-rd-comment__head">
          <span className="mn-rd-comment__title">请 {characterName} 一起读</span>
          <button
            type="button"
            className="mn-rd-comment__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        {step === 'pick' && (
          <div className="mn-rd-comment__body">
            <div className="mn-rd-comment__sub">选个范围，让 TA 读完说两句</div>
            {SCOPES.map((scope) => {
              const disabled = scope.id === 'highlights' && !canUseHighlights;
              return (
                <button
                  key={scope.id}
                  type="button"
                  className="mn-rd-comment__scope"
                  disabled={disabled}
                  onClick={() => handlePick(scope)}
                >
                  <span className="mn-rd-comment__scope-label">{scope.label}</span>
                  <span className="mn-rd-comment__scope-hint">
                    {disabled ? '还没有划过线' : scope.hint}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {step === 'loading' && (
          <div className="mn-rd-comment__body">
            <div className="mn-rd-comment__loading">
              正在读{scopeLabel}……
            </div>
          </div>
        )}

        {step === 'result' && (
          <div className="mn-rd-comment__body">
            <div className="mn-rd-comment__result">{text}</div>
            <button type="button" className="mn-rd-comment__again" onClick={() => setStep('pick')}>
              换个范围再问一次
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="mn-rd-comment__body">
            <div className="mn-rd-comment__error">{errorMessage}</div>
            <button type="button" className="mn-rd-comment__again" onClick={() => setStep('pick')}>
              重新选择
            </button>
          </div>
        )}
      </section>
    </div>
  );
}