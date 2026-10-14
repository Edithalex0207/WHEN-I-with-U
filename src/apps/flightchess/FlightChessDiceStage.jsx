// src/apps/flightchess/FlightChessDiceStage.jsx
//
// 全屏骰子：轮到某位玩家掷骰时盖满整个房间，一颗 3D 立方体骰子。
//   - 用户本人：骰子在空中慢慢转，等你「摇一摇手机 / 点一下 / 甩一下」
//     把它扔出去；
//   - 角色：稍等一下自动扔出去。
// 点数由父组件在打开前就定好（request.value），这里只负责把骰子翻到那一面、
// 播完动画后调用 onDone。本组件不含任何游戏规则。
//
// 父组件用 key={request.nonce} 渲染它，所以每次掷骰都是全新的实例，
// 不需要写重置逻辑。

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';

import {
  PLAYER_COLORS, PLAYER_GLOWS, TOKEN_KINDS, TokenIcon,
} from './FlightChessTokens';
import {
  useShakeDetector, hasMotionPermission, needsMotionPermission,
  requestMotionPermission, isShakeSupported, isTouchDevice,
} from './flightChessShake';
import './flightChessDice.css';

const FACE_PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// 要让第 n 面朝向镜头，立方体需要转到的 [rotateX, rotateY]
const FACE_TARGET = {
  1: [0, 0],
  2: [0, -90],
  3: [-90, 0],
  4: [90, 0],
  5: [0, 90],
  6: [0, 180],
};

const THROW_MS = 1900;
const AI_WAIT_MS = 1300;
const SHOW_RESULT_MS = 1000;
const LEAVE_MS = 300;
const FLICK_DISTANCE = 60;
const TAP_DISTANCE = 8;
const REST_ANGLES = { x: -24, y: 32 };

const vibrate = (pattern) => {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
  } catch (err) {
    // 部分浏览器不允许震动，忽略
  }
};

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const FlightChessDiceStage = ({ request, onDone }) => {
  const [stage, setStage] = useState('wait'); // wait | rolling | settled | leaving
  const [dragging, setDragging] = useState(false);
  const [dragRotate, setDragRotate] = useState({ x: 0, y: 0 });
  const [cubeStyle, setCubeStyle] = useState(null);
  const [shakeReady, setShakeReady] = useState(() => isTouchDevice() && hasMotionPermission());

  const stageRef = useRef('wait');
  const anglesRef = useRef({ ...REST_ANGLES });
  const timersRef = useRef([]);
  const pointerRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const showShakeButton = !request.isAI
    && isTouchDevice()
    && isShakeSupported()
    && needsMotionPermission()
    && !shakeReady;

  const later = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  const changeStage = useCallback((next) => {
    stageRef.current = next;
    setStage(next);
  }, []);

  const throwDice = useCallback(() => {
    if (stageRef.current !== 'wait') return;
    changeStage('rolling');
    setDragging(false);
    vibrate(25);

    const [targetX, targetY] = FACE_TARGET[request.value] || FACE_TARGET[1];
    const reduced = prefersReducedMotion();
    const turns = reduced ? 0 : 3;
    const nextX = targetX + 360 * (Math.floor(anglesRef.current.x / 360) + turns);
    const nextY = targetY + 360 * (Math.floor(anglesRef.current.y / 360) + turns);
    anglesRef.current = { x: nextX, y: nextY };
    const duration = reduced ? 80 : THROW_MS;

    setCubeStyle({
      transform: `rotateX(${nextX}deg) rotateY(${nextY}deg)`,
      transition: `transform ${duration}ms cubic-bezier(0.15, 0.7, 0.2, 1)`,
    });

    later(() => {
      changeStage('settled');
      vibrate([20, 40, 20]);
    }, duration + 80);
    later(() => changeStage('leaving'), duration + 80 + SHOW_RESULT_MS);
    later(() => onDoneRef.current?.(), duration + 80 + SHOW_RESULT_MS + LEAVE_MS);
  }, [changeStage, later, request.value]);

  // 角色的回合：稍等一下自动扔
  useEffect(() => {
    if (!request.isAI) return undefined;
    const id = setTimeout(throwDice, AI_WAIT_MS);
    return () => clearTimeout(id);
  }, [request.isAI, throwDice]);

  useEffect(() => () => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  }, []);

  // 摇一摇（只有轮到用户、还没扔、传感器可用时才监听）
  useShakeDetector(stage === 'wait' && !request.isAI && shakeReady, throwDice);

  const handleEnableShake = useCallback(async () => {
    const granted = await requestMotionPermission();
    setShakeReady(granted);
  }, []);

  /* ------------------------ 拖拽 / 点击 / 甩 ------------------------ */

  const handlePointerDown = (event) => {
    if (request.isAI || stageRef.current !== 'wait') return;
    pointerRef.current = { startX: event.clientX, startY: event.clientY, id: event.pointerId };
    setDragging(true);
    setDragRotate({ x: 0, y: 0 });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (err) {
      // 不支持指针捕获时忽略
    }
  };

  const handlePointerMove = (event) => {
    const pointer = pointerRef.current;
    if (!pointer) return;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    setDragRotate({ x: -dy * 0.6, y: dx * 0.6 });
  };

  const handlePointerUp = (event) => {
    const pointer = pointerRef.current;
    if (!pointer) return;
    pointerRef.current = null;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    const distance = Math.hypot(dx, dy);
    if (distance <= TAP_DISTANCE || distance >= FLICK_DISTANCE) {
      throwDice();
    } else {
      // 拖了一点又放开：当作取消，骰子弹回去继续等
      setDragging(false);
      setDragRotate({ x: 0, y: 0 });
    }
  };

  /* ------------------------ 渲染 ------------------------ */

  const color = PLAYER_COLORS[request.playerIndex % 4];
  const glow = PLAYER_GLOWS[request.playerIndex % 4];
  const kind = TOKEN_KINDS[request.playerIndex % 4];

  const faces = useMemo(() => [1, 2, 3, 4, 5, 6].map((face) => (
    <div className={`fc-dice-face is-f${face}`} key={face}>
      {Array.from({ length: 9 }, (_, index) => (
        <span
          key={index}
          className={`fc-dice-pip${FACE_PIPS[face].includes(index) ? ' is-on' : ''}`}
        />
      ))}
    </div>
  )), []);

  const isIdle = stage === 'wait' && !dragging;
  const resultVisible = stage === 'settled' || stage === 'leaving';

  let cubeInlineStyle = cubeStyle || undefined;
  if (stage === 'wait' && dragging) {
    cubeInlineStyle = {
      transform: `rotateX(${REST_ANGLES.x + dragRotate.x}deg) rotateY(${REST_ANGLES.y + dragRotate.y}deg)`,
      transition: 'none',
    };
  }

  let hint = '';
  if (stage === 'wait') {
    if (request.isAI) hint = `${request.actorName} 把骰子握在手里...`;
    else if (shakeReady) hint = '摇一摇手机，或者点一下、甩一下骰子';
    else hint = '点一下、甩一下骰子，把它扔出去';
  } else if (stage === 'rolling') {
    hint = '';
  } else {
    hint = `前进 ${request.value} 格`;
  }

  return (
    <div
      className={`fc-dice-stage${stage === 'leaving' ? ' is-leaving' : ''}`}
      style={{ '--dice-color': color, '--dice-glow': glow }}
    >
      <div className="fc-dice-who">
        <span className="fc-dice-who-icon"><TokenIcon kind={kind} /></span>
        {request.isAI ? `${request.actorName} 在掷骰子` : '轮到你掷骰子'}
      </div>

      <div
        className={`fc-dice-scene${stage === 'rolling' ? ' is-rolling' : ''}${request.isAI ? '' : ' is-touchable'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerRef.current = null;
          setDragging(false);
          setDragRotate({ x: 0, y: 0 });
        }}
        role={request.isAI ? undefined : 'button'}
        aria-label={request.isAI ? undefined : '掷骰子'}
        tabIndex={request.isAI ? undefined : 0}
        onKeyDown={(event) => {
          if (!request.isAI && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            throwDice();
          }
        }}
      >
        <span className="fc-dice-shadow" />
        <div className={`fc-dice-hop${stage === 'rolling' ? ' is-throwing' : ''}${stage === 'settled' ? ' is-settled' : ''}${isIdle ? ' is-idle' : ''}`}>
          <div className={`fc-dice-cube${isIdle ? ' is-idle' : ''}`} style={cubeInlineStyle}>
            {faces}
          </div>
        </div>
      </div>

      <div className={`fc-dice-result${resultVisible ? ' is-show' : ''}`}>{request.value}</div>
      <div className="fc-dice-hint">{hint}</div>

      {stage === 'wait' && !request.isAI && (
        <div className="fc-dice-actions">
          <button type="button" className="fc-dice-btn" onClick={throwDice}>掷出去</button>
          {showShakeButton && (
            <button type="button" className="fc-dice-btn is-ghost" onClick={handleEnableShake}>
              开启摇一摇
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FlightChessDiceStage;