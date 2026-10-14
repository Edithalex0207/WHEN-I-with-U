// src/apps/flightchess/FlightChessChatSheet.jsx
//
// 聊天抽屉：卡片翻开之后，从底部升起的毛玻璃对话面板。
//   - 轮到用户：用户写回应，角色多轮回复，直到角色「认可」才出现「继续」；
//     最多 MAX_CHAT_ROUNDS 轮，到了一定放行；
//   - 轮到角色：角色先自己完成任务，用户可以回一句（也可以不回），再继续；
//   - 任何一次请求失败都有「重试」和「直接放行」，不会卡住棋局。
// 本组件只管对话，不碰游戏规则；聊完调用 onComplete(transcript)，
// transcript 是 [{ who, text }]，由父组件写进对局日志。

import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';

import {
  MAX_CHAT_ROUNDS,
  generateTaskChatTurn,
  generateCharacterTaskAnswer,
  generateCharacterFollowUp,
} from './flightChessChatService';
import './flightChessChat.css';

const ORAL_REPLY = '（口头回应了）';

const Dots = () => (
  <span className="fc-dots" aria-label="正在输入"><span /><span /><span /></span>
);

const FlightChessChatSheet = ({
  task,
  mode, // 'user' = 用户完成任务；'char' = 角色自己完成任务
  character,
  characterName,
  userName,
  log,
  onComplete,
}) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [approved, setApproved] = useState(false);
  const [replied, setReplied] = useState(false); // 角色模式下用户是否已回过一句
  const [charAnswered, setCharAnswered] = useState(false);

  const messagesRef = useRef([]);
  const mountedRef = useRef(true);
  const startedRef = useRef(false);
  const threadRef = useRef(null);
  const pendingRef = useRef(null); // 失败后重试要重做的动作
  const idRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const pushMessage = useCallback((role, text) => {
    idRef.current += 1;
    const next = [...messagesRef.current, { id: idRef.current, role, text }];
    messagesRef.current = next;
    setMessages(next);
  }, []);

  // 新消息来了滚到底
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, failed]);

  const userRounds = () => messagesRef.current.filter((m) => m.role === 'user').length;

  /* ------------------------ 动作 ------------------------ */

  const doCharacterAnswer = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    const result = await generateCharacterTaskAnswer({
      character, userName, task, log,
    });
    if (!mountedRef.current) return;
    setBusy(false);
    if (result.failed) {
      pendingRef.current = doCharacterAnswer;
      setFailed(true);
      return;
    }
    pushMessage('char', result.text);
    setCharAnswered(true);
  }, [character, log, pushMessage, task, userName]);

  const doTaskTurn = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    const result = await generateTaskChatTurn({
      character,
      userName,
      task,
      history: messagesRef.current.map((m) => ({ role: m.role, text: m.text })),
      round: Math.max(1, userRounds()),
      log,
    });
    if (!mountedRef.current) return;
    setBusy(false);
    if (result.failed) {
      pendingRef.current = doTaskTurn;
      setFailed(true);
      return;
    }
    pushMessage('char', result.text);
    if (result.approved) setApproved(true);
  }, [character, log, pushMessage, task, userName]);

  const doFollowUp = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    const result = await generateCharacterFollowUp({
      character,
      userName,
      task,
      history: messagesRef.current.map((m) => ({ role: m.role, text: m.text })),
    });
    if (!mountedRef.current) return;
    setBusy(false);
    if (result.failed) {
      pendingRef.current = doFollowUp;
      setFailed(true);
      return;
    }
    pushMessage('char', result.text);
  }, [character, pushMessage, task, userName]);

  // 角色自己的任务：一打开就让它先答
  useEffect(() => {
    if (mode !== 'char' || startedRef.current) return;
    startedRef.current = true;
    doCharacterAnswer();
  }, [mode, doCharacterAnswer]);

  const send = useCallback((rawText) => {
    const text = String(rawText || '').trim();
    if (!text || busy) return;
    setInput('');
    pushMessage('user', text);
    if (mode === 'char') {
      setReplied(true);
      doFollowUp();
    } else {
      doTaskTurn();
    }
  }, [busy, doFollowUp, doTaskTurn, mode, pushMessage]);

  const handleRetry = () => {
    const action = pendingRef.current;
    if (action) action();
  };

  // 请求一直失败时的出口：直接放行
  const handleForcePass = () => {
    setFailed(false);
    setApproved(true);
    if (mode === 'char') setReplied(true);
  };

  const handleContinue = () => {
    const transcript = messagesRef.current.map((m) => ({
      who: m.role === 'user' ? userName : characterName,
      text: m.text,
    }));
    onComplete(transcript);
  };

  /* ------------------------ 渲染 ------------------------ */

  const lines = String(task.text || '').split('\n').filter(Boolean);
  const tone = task.tone || 'gray';
  const rounds = userRounds();

  const canContinue = mode === 'char'
    ? (charAnswered || failed) && !busy
    : approved && !busy;

  const canWrite = !busy && !failed && (
    mode === 'user' ? !approved : charAnswered && !replied
  );

  const placeholder = mode === 'user'
    ? `回应${characterName}...`
    : `想对${characterName}说点什么（可以不回）...`;

  return (
    <div className="fc-sheet-wrap">
      <div className={`fc-sheet tone-${tone}`} role="dialog" aria-label="任务对话">
        <div className="fc-sheet-grab" />

        <div className="fc-sheet-card">
          <div className="fc-sheet-card-head">
            <span className="fc-sheet-chip">{task.title}</span>
            {mode === 'user' && !approved && (
              <span className="fc-sheet-round">
                第 {Math.min(Math.max(rounds, 1), MAX_CHAT_ROUNDS)} / {MAX_CHAT_ROUNDS} 轮
              </span>
            )}
            {mode === 'user' && approved && <span className="fc-sheet-ok">已认可</span>}
          </div>
          <div className="fc-sheet-card-text">
            {lines.map((line, index) => (
              <p key={index} className={/^(网恋版|线下版)/.test(line) ? 'is-variant' : ''}>{line}</p>
            ))}
            {task.author && <span className="fc-sheet-author">—— {task.author} 写的</span>}
          </div>
          {task.effectHint && <span className="fc-effect-pill">{task.effectHint}</span>}
        </div>

        <div className="fc-sheet-thread" ref={threadRef}>
          {messages.length === 0 && !busy && !failed && (
            <div className="fc-sheet-empty">
              {mode === 'user' ? `把你的回应告诉${characterName}，等他点头再继续` : ''}
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`fc-bubble ${m.role === 'user' ? 'is-user' : 'is-char'}`}>
              {m.role === 'char' && <b className="fc-bubble-name">{characterName}</b>}
              <span>{m.text}</span>
            </div>
          ))}
          {busy && (
            <div className="fc-bubble is-char">
              <b className="fc-bubble-name">{characterName}</b>
              <Dots />
            </div>
          )}
          {failed && (
            <div className="fc-sheet-fail">
              <span>{characterName}好像没接上话</span>
              <div className="fc-sheet-fail-actions">
                <button type="button" className="fc-sheet-mini" onClick={handleRetry}>重试</button>
                <button type="button" className="fc-sheet-mini is-ghost" onClick={handleForcePass}>
                  直接放行
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="fc-sheet-foot">
          {canWrite && (
            <>
              <textarea
                className="fc-sheet-input"
                rows={2}
                value={input}
                placeholder={placeholder}
                onChange={(e) => setInput(e.target.value)}
              />
              <div className="fc-sheet-actions">
                {mode === 'user' && (
                  <button
                    type="button"
                    className="fc-sheet-mini is-ghost"
                    onClick={() => send(ORAL_REPLY)}
                  >
                    口头完成了
                  </button>
                )}
                {mode === 'char' && (
                  <button type="button" className="fc-sheet-mini is-ghost" onClick={handleContinue}>
                    不回了，继续
                  </button>
                )}
                <button
                  type="button"
                  className="fc-sheet-send"
                  disabled={!input.trim()}
                  onClick={() => send(input)}
                >
                  发送
                </button>
              </div>
            </>
          )}
          {canContinue && !(mode === 'char' && canWrite) && (
            <button type="button" className="fc-sheet-send is-wide" onClick={handleContinue}>
              继续
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FlightChessChatSheet;