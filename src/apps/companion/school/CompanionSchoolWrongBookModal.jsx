/*
 * CompanionSchoolWrongBookModal.jsx —— 错题本。
 *
 * 预览文件里没有专门给这一屏定稿，是我自己照着 school.css / quiz.css 已有的
 * 卡片风格设计的简单列表，不是"视觉定稿"——如果想要的样子不一样，告诉我改。
 *
 * 【显示什么】默认只看还没掌握的（跟 getWrongBook 默认行为一致）；可以切换
 * 成"也看已掌握的"。每道题显示：科目、题干、正确答案、解析、连续答对进度
 * （还差几次掌握 / 已掌握）。题目内容来自 snapshot（自己出的题被删了也不
 * 影响显示）。
 *
 * 【开始复习】有待复习的题时显示「只考错题」按钮，调用 onStartReview()
 * ——这个组件自己不开做题弹窗，交给首页弹窗决定（避免两个弹窗互相
 * import 造成循环依赖）。
 *
 * Props:
 *   companion      object   —— 当前小伙伴
 *   onClose        function —— 关闭弹窗
 *   onStartReview  function —— 点「只考错题」时调用
 */

import React, { useEffect, useState } from 'react';

import './school.css';
import './quiz.css';

import { findSubject, QUESTION_TYPE } from './companionSchoolData';
import { getWrongBook, WRONG_MASTER_STREAK } from './companionSchoolQuizService';
import { CloseGlyph, CheckGlyph } from './SchoolArt';

const answerText = (snapshot) => {
  if (!snapshot) return '';
  if (snapshot.type === QUESTION_TYPE.JUDGE) return snapshot.answer ? '对' : '错';
  return snapshot.options?.[snapshot.answer] ?? '';
};

const CompanionSchoolWrongBookModal = ({ companion, onClose, onStartReview }) => {
  const [rows, setRows] = useState([]);
  const [includeMastered, setIncludeMastered] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async (withMastered) => {
    setLoading(true);
    const list = await getWrongBook(companion.id, { includeMastered: withMastered });
    setRows(list);
    setLoading(false);
  };

  useEffect(() => {
    refresh(includeMastered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeMastered]);

  const pendingCount = rows.filter((r) => !r.mastered).length;

  return (
    <div className="cp-overlay center">
      <div className="cp-backdrop" onClick={onClose} />
      <div className="sd-root" role="dialog" aria-label="错题本">
        <div className="sd-head">
          <button type="button" className="sd-round" aria-label="关闭" onClick={onClose}><CloseGlyph /></button>
          <div className="sd-title"><b>错题本</b></div>
          <span className="sd-round is-ghost" aria-hidden="true" />
        </div>

        <div className="sd-body">
          <div className="qz-wb-head">
            <span className="qz-wb-count">
              {includeMastered ? `共 ${rows.length} 道` : `${pendingCount} 道待复习`}
            </span>
            <button type="button" className="sd-btn ghost" style={{ height: 34, minWidth: 0, padding: '0 14px', fontSize: 12 }} onClick={() => setIncludeMastered((v) => !v)}>
              {includeMastered ? '只看待复习' : '也看已掌握'}
            </button>
          </div>

          {!loading && rows.length === 0 && (
            <p className="qz-wb-empty">
              {includeMastered ? '还没有做错过题目，真棒！' : '待复习的题目都掌握啦，真棒！'}
            </p>
          )}

          {!loading && rows.length > 0 && (
            <div className="qz-wb-list">
              {rows.map((row) => {
                const snap = row.snapshot;
                const subject = findSubject(snap?.subject);
                const left = Math.max(0, WRONG_MASTER_STREAK - (row.streak || 0));
                return (
                  <div key={row.id} className="qz-wb-card">
                    <div className="qz-wb-top">
                      <span className="sh-chip sd-tone-sky">{subject?.label || '自选'}</span>
                      <span className="qz-wb-streak">
                        {row.mastered ? (
                          <span style={{ color: 'var(--cp-mint-fg)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <CheckGlyph size={12} />已掌握
                          </span>
                        ) : (
                          `再对 ${left} 次就掌握啦`
                        )}
                      </span>
                    </div>
                    <p className="qz-wb-stem">{snap?.stem}</p>
                    <p className="qz-wb-answer">正确答案：{answerText(snap)}</p>
                    {snap?.explain && <p className="qz-wb-explain">{snap.explain}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {pendingCount > 0 && (
          <div className="sd-foot">
            <button type="button" className="sd-btn heart" onClick={() => onStartReview?.()}>
              只考错题 · {pendingCount} 道
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanionSchoolWrongBookModal;