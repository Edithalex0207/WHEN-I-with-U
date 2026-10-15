/*
 * CompanionDailyQaModal.jsx —— 每日问答弹窗。
 *
 * 外层弹窗壳沿用项目里其它 companion 弹窗的 .cp-overlay / .cp-backdrop /
 * .cp-panel.bottom 约定；今天/历史切换复用底部抽屉已有的 .cp-tabs 滑块
 * 样式；提交前的二次确认、清空历史前的确认都复用 CompanionSceneModal.jsx
 * 里"解锁确认"那一套 .cp-confirm / .cp-btn 结构。
 *
 * 打开弹窗时才按需生成当天的题目（ensureTodayQA），不依赖任何定时器；
 * 角色回答失败只留空状态 + 重roll 按钮，不会连累题目本身也不会卡死
 * 一整天（见 companionDailyQaService.js 的注释）。用户的回答提交后
 * 不可修改，这里只负责 UI 层面的二次确认，真正的锁定校验在
 * submitUserAnswer 里。
 *
 * Props:
 *   chatId     number   —— 当前聊天窗 id，用来取 chat/character 人设上下文
 *   character  object   —— 当前角色
 *   companion  object   —— 当前小伙伴
 *   onClose    function —— 关闭整个弹窗
 */

import React, { useEffect, useMemo, useState } from 'react';

import db from '../../../db';
import {
  ensureTodayQA,
  rerollCharAnswer,
  submitUserAnswer,
  getHistory,
  clearHistory,
  getTodayDateStr,
} from './companionDailyQaService';
import './dailyQa.css';

const QuestionGlyph = ({ color = '#FF86A0', size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path d="M9 9a3 3 0 1 1 4 2.8c-1 .4-1.5 1-1.5 2.2" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="12" cy="18" r="1" fill={color} />
  </svg>
);

const RerollGlyph = ({ color = '#2F86CC', size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path
      d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const parseDateStr = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const formatDayLabel = (dateStr, todayStr) => {
  if (dateStr === todayStr) return '今天';
  const diffDays = Math.round((parseDateStr(todayStr) - parseDateStr(dateStr)) / 86400000);
  if (diffDays === 1) return '昨天';
  return `${diffDays}天前`;
};

const formatMonthDay = (dateStr) => {
  const [, m, d] = dateStr.split('-');
  return `${m}/${d}`;
};

const CompanionDailyQaModal = ({ chatId, character, companion, onClose }) => {
  const todayStr = useMemo(() => getTodayDateStr(), []);

  const [tab, setTab] = useState('today');
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState(null);
  const [rerolling, setRerolling] = useState(false);

  const [answerDraft, setAnswerDraft] = useState('');
  const [answerError, setAnswerError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [openedDate, setOpenedDate] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const buildCtx = async () => {
    const chat = await db.chats.get(chatId);
    return { chatId, chat, character, companion };
  };

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      try {
        const ctx = await buildCtx();
        const todayRecord = await ensureTodayQA(ctx);
        if (active) setRecord(todayRecord);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, companion?.id]);

  const loadHistory = async () => {
    const rows = await getHistory(companion.id);
    setHistoryRows(rows);
    setHistoryLoaded(true);
  };

  const handleTab = (next) => {
    setTab(next);
    setOpenedDate(null);
    if (next === 'history' && !historyLoaded) {
      loadHistory();
    }
  };

  const handleReroll = async () => {
    if (!record || rerolling) return;
    setRerolling(true);
    try {
      const ctx = await buildCtx();
      const updated = await rerollCharAnswer(ctx, record.date);
      if (updated) setRecord(updated);
    } finally {
      setRerolling(false);
    }
  };

  const handleOpenConfirm = () => {
    if (!answerDraft.trim()) {
      setAnswerError('先写点什么再回答吧');
      return;
    }
    setAnswerError('');
    setShowConfirm(true);
  };

  const handleConfirmSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const updated = await submitUserAnswer(companion.id, record.date, answerDraft);
      if (updated) setRecord(updated);
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  };

  const handleClearHistory = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      await clearHistory(companion.id);
      await loadHistory();
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  };

  const openedRecord = openedDate ? historyRows.find((row) => row.date === openedDate) : null;

  return (
    <div className="cp-overlay">
      <div className="cp-backdrop" onClick={onClose} />

      <div className="cp-panel bottom qa-panel">
        <i className="cp-handle" />

        <h3 className="cp-panel-title">
          <span>每日问答</span>
        </h3>

        <div className="cp-tabs">
          <i className="ind" style={{ transform: tab === 'today' ? 'translateX(0)' : 'translateX(100%)' }} />
          <button type="button" className={tab === 'today' ? 'is-on' : ''} onClick={() => handleTab('today')}>
            今天
          </button>
          <button type="button" className={tab === 'history' ? 'is-on' : ''} onClick={() => handleTab('history')}>
            历史
          </button>
        </div>

        <div className="cp-panel-scroll qa-scroll">
          {tab === 'today' ? (
            loading ? (
              <p className="cp-empty">正在想问题…</p>
            ) : !record ? (
              <p className="cp-empty">今天还没能出题，晚点再来看看吧。</p>
            ) : (
              <>
                <div className="qa-card qa-card-char">
                  <div className="qa-card-head">
                    <p className="qa-card-label qa-label-char">
                      <QuestionGlyph color="#2F86CC" />
                      问 TA 的问题
                    </p>
                    <button
                      type="button"
                      className="qa-reroll-btn"
                      onClick={handleReroll}
                      disabled={rerolling}
                      aria-label="换一个回答"
                    >
                      <RerollGlyph color="#2F86CC" />
                    </button>
                  </div>
                  <p className="qa-question">{record.questionForChar}</p>
                  {record.charAnswer ? (
                    <p className="qa-char-answer">{record.charAnswer}</p>
                  ) : (
                    <p className="qa-char-answer is-empty">
                      {rerolling ? 'TA 正在想…' : 'TA 还没想好，点右上角的小箭头再试一次吧'}
                    </p>
                  )}
                </div>

                <div className="qa-card qa-card-user">
                  <p className="qa-card-label qa-label-user">
                    <QuestionGlyph color="#FF86A0" />
                    问你的问题
                  </p>
                  <p className="qa-question">{record.questionForUser}</p>

                  {record.userAnswer ? (
                    <p className="qa-user-answer">{record.userAnswer}</p>
                  ) : (
                    <>
                      <textarea
                        className="qa-input"
                        placeholder="写下你的回答…"
                        value={answerDraft}
                        onChange={(event) => {
                          setAnswerDraft(event.target.value);
                          if (answerError) setAnswerError('');
                        }}
                        rows={3}
                      />
                      {answerError && <p className="qa-error">{answerError}</p>}
                      <div className="qa-submit-row">
                        <button type="button" className="qa-submit-btn" onClick={handleOpenConfirm}>
                          回答
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <p className="qa-hint">明天这个时间会换一对新问题</p>
              </>
            )
          ) : (
            <div className="qa-history">
              {historyRows.length > 0 && (
                <p className="qa-history-note">
                  历史最多留 5 天，到期自动清理 ·{' '}
                  <button type="button" className="qa-clear-link" onClick={() => setShowClearConfirm(true)}>
                    现在清空
                  </button>
                </p>
              )}

              {!historyLoaded ? (
                <p className="cp-empty">加载中…</p>
              ) : historyRows.length === 0 ? (
                <p className="cp-empty">还没有问答记录</p>
              ) : openedRecord ? (
                <div className="qa-opened-card">
                  <p className="qa-opened-date">
                    {formatMonthDay(openedRecord.date)} · {formatDayLabel(openedRecord.date, todayStr)}
                  </p>

                  <div className="qa-opened-block">
                    <p className="qa-card-label qa-label-char">
                      <QuestionGlyph color="#2F86CC" />
                      问 TA 的问题
                    </p>
                    <p className="qa-question">{openedRecord.questionForChar}</p>
                    <p className={`qa-char-answer ${openedRecord.charAnswer ? '' : 'is-empty'}`}>
                      {openedRecord.charAnswer || 'TA 那天没想出来'}
                    </p>
                  </div>

                  <div className="qa-opened-block">
                    <p className="qa-card-label qa-label-user">
                      <QuestionGlyph color="#FF86A0" />
                      问你的问题
                    </p>
                    <p className="qa-question">{openedRecord.questionForUser}</p>
                    <p className={`qa-user-answer ${openedRecord.userAnswer ? '' : 'is-empty'}`}>
                      {openedRecord.userAnswer || '那天没有回答'}
                    </p>
                  </div>

                  <button type="button" className="cp-close-link" onClick={() => setOpenedDate(null)}>
                    合上，回到卡盒
                  </button>
                </div>
              ) : (
                <div className="qa-grid">
                  {historyRows.map((row) => (
                    <button
                      key={row.date}
                      type="button"
                      className="qa-day-card"
                      onClick={() => setOpenedDate(row.date)}
                    >
                      <QuestionGlyph color="#2F86CC" size={18} />
                      <span className="qa-day-date">{formatMonthDay(row.date)}</span>
                      <span className="qa-day-tag">{formatDayLabel(row.date, todayStr)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {showConfirm && (
          <div className="cp-confirm" role="dialog" aria-modal="true" aria-label="确认提交回答">
            <div
              className="cp-confirm-dim"
              onClick={() => { if (!submitting) setShowConfirm(false); }}
            />
            <div className="cp-confirm-card">
              <h4>确定要这样回答吗？</h4>
              <p className="cp-confirm-text">提交之后就不能修改啦</p>
              <div className="cp-btn-row">
                <button type="button" className="cp-btn" disabled={submitting} onClick={() => setShowConfirm(false)}>
                  再想想
                </button>
                <button type="button" className="cp-btn main" disabled={submitting} onClick={handleConfirmSubmit}>
                  {submitting ? '提交中…' : '确定提交'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showClearConfirm && (
          <div className="cp-confirm" role="dialog" aria-modal="true" aria-label="确认清空历史">
            <div
              className="cp-confirm-dim"
              onClick={() => { if (!clearing) setShowClearConfirm(false); }}
            />
            <div className="cp-confirm-card">
              <h4>清空历史问答？</h4>
              <p className="cp-confirm-text">今天这条还在进行中的不会被清掉，之前的记录会全部删除，不能恢复</p>
              <div className="cp-btn-row">
                <button type="button" className="cp-btn" disabled={clearing} onClick={() => setShowClearConfirm(false)}>
                  先不清
                </button>
                <button type="button" className="cp-btn main" disabled={clearing} onClick={handleClearHistory}>
                  {clearing ? '清空中…' : '清空'}
                </button>
              </div>
            </div>
          </div>
        )}

        <button type="button" className="cp-close-link" onClick={onClose}>
          先收起来
        </button>
      </div>
    </div>
  );
};

export default CompanionDailyQaModal;