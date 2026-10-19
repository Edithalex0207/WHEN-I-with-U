// src/apps/tripHome/TripRoom.jsx
//
// 「旅行小屋」的房间分页（切片 B1）：居民在地板上乱走、戳戳冒气泡、拖动
// 看景深、日夜切换、房间切换（含解锁）、地板标定工具、留言板界面。
//
// 跟房间预览（启动包里的链接）的一个重要区别：预览里那个手绘的等距小
// 屋（墙/窗/书架/床……）是预览自己用来演示效果的占位美术，不是真的要
// 照搬进正式应用——确认过的设计里，房间背景是用户自己跑的固定背景图
// （tripCatalog.js 的 TRIP_ROOMS[].bgImageUrl），3D 感靠这里做的景深缩放
// + 阴影 + 拖动/陀螺仪视差，不是靠手绘等距房间。所以这个文件不画墙、
// 不画家具，背景图没填的时候只显示一个朴素占位色块 + 提示文字。地板
// 标定工具因此是正式功能（不是预览才有的调试工具）：不管背景图长什么
// 样，标完就知道居民能在哪块范围里走。
//
// 动画用的是跟预览一样的"直接摆弄 DOM"思路：居民的位置/朝向/状态存在
// animRef（一个 Map，不是 React state）里，每一帧用 requestAnimationFrame
// 直接改对应 <g> 节点的 transform 属性，不走 React 重渲染——这么多居民
// 60fps 更新的话，每帧都 setState 重渲染一次太费了。只有气泡文字、面板
// 开关这类低频 UI 状态才用 useState。

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getTripRoom, TRIP_ROOMS } from './tripCatalog';
import { TripAnimalMark } from './TripParts';
import {
  DEFAULT_BLOCKS,
  DEFAULT_FLOOR,
  STAGE_H,
  STAGE_W,
  clamp,
  randomFloorPoint,
  resolveRoomFloor,
  scaleAtY,
  toPercentPolygon,
} from './tripRoomGeometry';
import {
  addUserBoardPost,
  ensureResidentPokeLines,
  getRoomState,
  listBoardPosts,
  pickPokeLine,
  saveRoomFloorConfig,
  setNightMode,
  setSelectedRoom,
  unlockRoom,
} from './tripRoomService';

const BUBBLE_MS = 2600;
const HOP_MS = 480;
const WALK_PX_PER_SEC_AT_SCALE1 = 42;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 顶层组件 ---------- */

const TripRoom = ({ residents, journeys, notify }) => {
  const [roomState, setRoomState] = useState(null);
  const [boardPosts, setBoardPosts] = useState([]);
  const [sheet, setSheet] = useState(null); // null | 'board' | 'unlock'
  const [unlockTarget, setUnlockTarget] = useState(null);
  const [calibOn, setCalibOn] = useState(false);
  const [calibMode, setCalibMode] = useState('floor');
  const [calibCurrent, setCalibCurrent] = useState([]);
  const [calibShapes, setCalibShapes] = useState([]);
  const [bubble, setBubble] = useState(null); // { residentId, text, left, top }
  const [now, setNow] = useState(() => Date.now());
  const [gyroOn, setGyroOn] = useState(false);
  const [gyroAvailable, setGyroAvailable] = useState(false);

  const stageRef = useRef(null);
  const bgLayerRef = useRef(null);
  const objLayerRef = useRef(null);
  const spriteRefs = useRef(new Map());
  const animRef = useRef(new Map());
  const floorRef = useRef({ floor: DEFAULT_FLOOR, blocks: DEFAULT_BLOCKS });
  const parallaxRef = useRef({ tx: 0, ty: 0, px: 0, py: 0 });
  const dragRef = useRef(null);
  const bubbleTimerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(bubbleTimerRef.current);
    };
  }, []);

  /* ---- 加载房间状态 + 留言板 ---- */

  const refreshRoomState = useCallback(async () => {
    const state = await getRoomState();
    if (mountedRef.current) setRoomState(state);
    return state;
  }, []);

  const refreshBoard = useCallback(async () => {
    const posts = await listBoardPosts();
    if (mountedRef.current) setBoardPosts(posts);
  }, []);

  useEffect(() => {
    refreshRoomState();
    refreshBoard();
  }, [refreshRoomState, refreshBoard]);

  // 每分钟刷新一次"现在"，给外出条的倒计时进度条用；不需要更精细。
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // 陀螺仪视差：能力检测，iOS 13+ 要手势触发权限请求，所以只露出一个
  // 按钮，不自动弹权限框。安卓/桌面大多不需要请求，直接可用。
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') return;
    setGyroAvailable(true);
  }, []);

  const room = useMemo(() => getTripRoom(roomState?.selectedRoomId), [roomState?.selectedRoomId]);
  const isNight = !!roomState?.isNight;

  // 房间或它的标定配置变化时，重新算一份地板/障碍物（像素坐标，给走路
  // 用），存进 ref 给动画循环读，同时让所有居民原地重新挑一次目的地。
  useEffect(() => {
    if (!roomState) return;
    const config = roomState.roomConfigs?.[roomState.selectedRoomId] || null;
    floorRef.current = resolveRoomFloor(config);
    animRef.current.forEach((anim) => {
      if (anim.fixed) return;
      anim.mode = 'idle';
      anim.wait = 0.3 + Math.random() * 1.2;
    });
  }, [roomState]);

  /* ---- 给每个居民准备/同步动画状态 ---- */

  const residentList = useMemo(() => residents || [], [residents]);

  const unclaimedByResident = useMemo(() => {
    const map = new Map();
    (journeys || []).forEach((journey) => {
      if (journey.status === 'arrived') map.set(journey.residentId, journey);
    });
    return map;
  }, [journeys]);

  useEffect(() => {
    const { floor, blocks } = floorRef.current;
    const liveIds = new Set();

    residentList.forEach((resident) => {
      liveIds.add(resident.id);
      const isAway = resident.status === 'away';
      const isReturned = unclaimedByResident.has(resident.id);
      let anim = animRef.current.get(resident.id);

      if (!anim) {
        const spawn = randomFloorPoint(floor, blocks) || floor[0];
        anim = {
          x: spawn[0],
          y: spawn[1],
          face: 1,
          mode: 'idle',
          wait: Math.random() * 2,
          hold: 0,
          fixed: false,
        };
        animRef.current.set(resident.id, anim);
      }

      anim.fixed = isReturned;
      anim.away = isAway;
    });

    // 清掉已经不在列表里的居民（角色被删除之类）。
    Array.from(animRef.current.keys()).forEach((id) => {
      if (!liveIds.has(id)) animRef.current.delete(id);
    });
  }, [residentList, unclaimedByResident]);

  /* ---- 摆放一个精灵节点（按 anim 的 x/y 直接设 transform，不走 state） ---- */

  const placeSprite = useCallback((residentId) => {
    const node = spriteRefs.current.get(residentId);
    const anim = animRef.current.get(residentId);
    if (!node || !anim) return;
    const scale = scaleAtY(anim.y, floorRef.current.floor);
    node.setAttribute('transform', `translate(${anim.x.toFixed(1)} ${anim.y.toFixed(1)}) scale(${scale.toFixed(3)})`);
    const flip = node.querySelector('.trip-sprite-flip');
    if (flip) flip.style.transform = `scaleX(${anim.face})`;
    node.classList.toggle('trip-sprite--walk', anim.mode === 'walk' && anim.hold <= 0);
  }, []);

  /* ---- 主动画循环：走路 + 景深排序 + 视差 ---- */

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const reduceMotion = prefersReducedMotion();

    const tick = (nowTs) => {
      const dt = Math.min(0.05, (nowTs - last) / 1000);
      last = nowTs;
      const { floor, blocks } = floorRef.current;
      const paused = calibOn;

      animRef.current.forEach((anim, residentId) => {
        if (anim.fixed || anim.away) {
          placeSprite(residentId);
          return;
        }
        if (anim.hold > 0) {
          anim.hold -= dt;
        } else if (!paused && !reduceMotion && anim.mode === 'walk') {
          const dx = anim.tx - anim.x;
          const dy = anim.ty - anim.y;
          const dist = Math.hypot(dx, dy);
          const step = WALK_PX_PER_SEC_AT_SCALE1 * scaleAtY(anim.y, floor) * dt;
          if (dist <= step) {
            anim.mode = 'idle';
            anim.wait = 1.5 + Math.random() * 4.5;
          } else {
            anim.x += (dx / dist) * step;
            anim.y += (dy / dist) * step;
            if (Math.abs(dx) > 1) anim.face = dx < 0 ? -1 : 1;
          }
        } else if (!paused && !reduceMotion && anim.mode === 'idle') {
          anim.wait -= dt;
          if (anim.wait <= 0) {
            const target = randomFloorPoint(floor, blocks, [anim.x, anim.y]);
            if (target) {
              anim.tx = target[0];
              anim.ty = target[1];
              anim.mode = 'walk';
            } else {
              anim.wait = 1.5;
            }
          }
        }
        placeSprite(residentId);
      });

      // 景深排序：简单起见每帧都按 y 重排一次 DOM 顺序（居民数量通常不多，
      // 这个开销可以接受；比预览里的"算出顺序字符串比对"更直白）。
      if (objLayerRef.current) {
        const entries = Array.from(spriteRefs.current.entries())
          .map(([id, node]) => ({ id, node, y: animRef.current.get(id)?.y ?? 0 }))
          .sort((a, b) => a.y - b.y);
        entries.forEach(({ node }) => objLayerRef.current.appendChild(node));
      }

      // 视差：目标值由拖拽/陀螺仪事件更新，这里只做缓动 + 应用到两层。
      const parallax = parallaxRef.current;
      parallax.px += (parallax.tx - parallax.px) * 0.12;
      parallax.py += (parallax.ty - parallax.py) * 0.12;
      if (bgLayerRef.current) {
        bgLayerRef.current.setAttribute(
          'transform',
          `translate(${(parallax.px * 0.3).toFixed(2)} ${(parallax.py * 0.3).toFixed(2)})`
        );
      }
      if (objLayerRef.current) {
        objLayerRef.current.setAttribute(
          'transform',
          `translate(${parallax.px.toFixed(2)} ${parallax.py.toFixed(2)})`
        );
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [calibOn, placeSprite]);

  /* ---- 拖动视差 ---- */

  const onStagePointerDown = useCallback(
    (event) => {
      if (calibOn) return;
      dragRef.current = { x: event.clientX, y: event.clientY };
    },
    [calibOn]
  );

  useEffect(() => {
    const onMove = (event) => {
      if (prefersReducedMotion()) return;
      if (dragRef.current) {
        parallaxRef.current.tx = clamp((event.clientX - dragRef.current.x) / 5, -10, 10);
        parallaxRef.current.ty = clamp((event.clientY - dragRef.current.y) / 7, -6, 6);
      }
    };
    const onUp = () => {
      dragRef.current = null;
      parallaxRef.current.tx = 0;
      parallaxRef.current.ty = 0;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const enableGyro = useCallback(async () => {
    try {
      if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
        const result = await window.DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') {
          notify?.('没有获得陀螺仪权限');
          return;
        }
      }
      setGyroOn(true);
    } catch (error) {
      notify?.('这台设备不支持陀螺仪视差');
    }
  }, [notify]);

  useEffect(() => {
    if (!gyroOn) return undefined;
    const onOrient = (event) => {
      if (event.beta == null || event.gamma == null) return;
      parallaxRef.current.tx = clamp(event.gamma / 3, -10, 10);
      parallaxRef.current.ty = clamp((event.beta - 45) / 4, -6, 6);
    };
    window.addEventListener('deviceorientation', onOrient);
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, [gyroOn]);

  /* ---- 戳一戳 ---- */

  const sayBubble = useCallback((residentId, text) => {
    const anim = animRef.current.get(residentId);
    if (!anim) return;
    anim.hold = 2.6;
    setBubble({
      residentId,
      text,
      left: clamp((anim.x / STAGE_W) * 100, 12, 88),
      top: clamp(((anim.y - 64 * scaleAtY(anim.y, floorRef.current.floor)) / STAGE_H) * 100, 6, 92),
    });
    clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setBubble(null);
    }, BUBBLE_MS);
  }, []);

  const handlePoke = useCallback(
    async (resident) => {
      if (calibOn) return;

      if (unclaimedByResident.has(resident.id)) {
        notify?.(`去"航班"页收下 ${resident.name} 带回来的东西`);
        return;
      }
      if (resident.status === 'away') return;

      const node = spriteRefs.current.get(resident.id);
      if (node) {
        node.classList.remove('trip-sprite--hop');
        // eslint-disable-next-line no-unused-expressions
        node.getBoundingClientRect();
        node.classList.add('trip-sprite--hop');
        setTimeout(() => node.classList.remove('trip-sprite--hop'), HOP_MS);
      }

      const lines = await ensureResidentPokeLines(resident);
      sayBubble(resident.id, pickPokeLine(lines));
    },
    [calibOn, notify, sayBubble, unclaimedByResident]
  );

  /* ---- 日夜 / 房间切换 / 解锁 ---- */

  const toggleNight = useCallback(async () => {
    const result = await setNightMode(!isNight);
    if (result.ok) setRoomState(result.state);
  }, [isNight]);

  const chooseRoom = useCallback(
    async (targetRoom) => {
      if (roomState?.unlockedRoomIds?.includes(targetRoom.id)) {
        const result = await setSelectedRoom(targetRoom.id);
        if (result.ok) setRoomState(result.state);
        return;
      }
      setUnlockTarget(targetRoom);
      setSheet('unlock');
    },
    [roomState]
  );

  const confirmUnlock = useCallback(async () => {
    if (!unlockTarget) return;
    const result = await unlockRoom(unlockTarget.id);
    if (result.ok) {
      setRoomState(result.roomState);
      setSheet(null);
      notify?.(`已解锁 ${unlockTarget.name}`);
    } else if (result.reason === 'not_enough_coins') {
      notify?.('旅费不够，去签到或玩小游戏攒一攒');
    } else {
      notify?.('出了点小问题，请刷新后再试');
    }
  }, [unlockTarget, notify]);

  /* ---- 留言板 ---- */

  const [noteDraft, setNoteDraft] = useState('');

  const submitNote = useCallback(async () => {
    const result = await addUserBoardPost(noteDraft);
    if (!result.ok) {
      notify?.('先写点什么再贴');
      return;
    }
    setNoteDraft('');
    await refreshBoard();
  }, [noteDraft, notify, refreshBoard]);

  /* ---- 地板标定 ---- */

  const toggleCalib = useCallback(() => {
    setCalibOn((prev) => {
      const next = !prev;
      if (next) {
        const { floor, blocks } = floorRef.current;
        setCalibShapes([
          { type: 'floor', points: floor },
          ...blocks.map((points) => ({ type: 'block', points })),
        ]);
      }
      setCalibCurrent([]);
      setBubble(null);
      return next;
    });
  }, []);

  const onCalibPointerDown = useCallback(
    (event) => {
      if (!calibOn || !stageRef.current) return;
      event.stopPropagation();
      const rect = stageRef.current.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * STAGE_W;
      const y = ((event.clientY - rect.top) / rect.height) * STAGE_H;
      setCalibCurrent((prev) => [...prev, [x, y]]);
    },
    [calibOn]
  );

  const finishCalibShape = useCallback(() => {
    if (calibCurrent.length < 3) {
      notify?.('至少点三个点');
      return;
    }
    setCalibShapes((prev) => {
      const rest = calibMode === 'floor' ? prev.filter((shape) => shape.type !== 'floor') : prev;
      return [...rest, { type: calibMode, points: calibCurrent }];
    });
    setCalibCurrent([]);
  }, [calibCurrent, calibMode, notify]);

  const undoCalibPoint = useCallback(() => {
    setCalibCurrent((prev) => prev.slice(0, -1));
  }, []);

  const clearCalibShapes = useCallback(() => {
    setCalibShapes([]);
    setCalibCurrent([]);
  }, []);

  const applyCalibShapes = useCallback(async () => {
    const floorShape = calibShapes.find((shape) => shape.type === 'floor');
    if (!floorShape) {
      notify?.('还没有画地板');
      return;
    }
    const config = {
      floor: toPercentPolygon(floorShape.points),
      blocks: calibShapes.filter((shape) => shape.type === 'block').map((shape) => toPercentPolygon(shape.points)),
    };
    const result = await saveRoomFloorConfig(room.id, config);
    if (result.ok) {
      setRoomState(result.state);
      setCalibOn(false);
      notify?.('已应用，居民会在你画的范围里走');
    }
  }, [calibShapes, room?.id, notify]);

  const calibConfigPreview = useMemo(() => {
    const floorShape = calibShapes.find((shape) => shape.type === 'floor');
    const blockShapes = calibShapes.filter((shape) => shape.type === 'block');
    return JSON.stringify({
      floor: floorShape ? toPercentPolygon(floorShape.points) : null,
      blocks: blockShapes.map((shape) => toPercentPolygon(shape.points)),
    });
  }, [calibShapes]);

  const copyCalibConfig = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(calibConfigPreview);
      notify?.('已复制配置');
    } catch (error) {
      notify?.('复制失败，请手动选中文字复制');
    }
  }, [calibConfigPreview, notify]);

  const awayJourneys = useMemo(
    () => (journeys || []).filter((journey) => journey.status === 'away').sort((a, b) => a.arriveAt - b.arriveAt),
    [journeys]
  );

  if (!roomState) {
    return <p className="trip-empty">正在布置房间……</p>;
  }

  return (
    <div className="trip-room">
      <div
        ref={stageRef}
        className="trip-stage"
        data-time={isNight ? 'night' : 'day'}
        onPointerDown={onStagePointerDown}
      >
        <svg className="trip-stage-svg" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} role="img" aria-label="旅行小屋房间">
          <g ref={bgLayerRef}>
            {room.bgImageUrl ? (
              <image
                href={room.bgImageUrl}
                x="0"
                y="0"
                width={STAGE_W}
                height={STAGE_H}
                preserveAspectRatio="xMidYMid slice"
              />
            ) : (
              <>
                <rect width={STAGE_W} height={STAGE_H} className="trip-stage-placeholder" />
                <text x={STAGE_W / 2} y={STAGE_H / 2 - 10} textAnchor="middle" className="trip-stage-placeholder-text">
                  {room.name}
                </text>
                <text
                  x={STAGE_W / 2}
                  y={STAGE_H / 2 + 14}
                  textAnchor="middle"
                  className="trip-stage-placeholder-hint"
                >
                  还没有背景图，去 tripCatalog.js 填一个链接
                </text>
              </>
            )}
            <ellipse cx={STAGE_W / 2} cy={STAGE_H - 24} rx={STAGE_W * 0.42} ry="15" className="trip-stage-floorshadow" />
          </g>

          <g ref={objLayerRef}>
            {residentList.map((resident) => (
              <ResidentSprite
                key={resident.id}
                resident={resident}
                isAway={resident.status === 'away'}
                isReturned={unclaimedByResident.has(resident.id)}
                registerNode={(node) => {
                  if (node) spriteRefs.current.set(resident.id, node);
                  else spriteRefs.current.delete(resident.id);
                }}
                onPoke={() => handlePoke(resident)}
              />
            ))}
          </g>

          <rect width={STAGE_W} height={STAGE_H} className="trip-stage-tint" />
          <ellipse cx={STAGE_W * 0.26} cy={STAGE_H * 0.35} rx="64" ry="52" className="trip-stage-glow" />

          {calibOn && (
            <CalibOverlay
              shapes={calibShapes}
              current={calibCurrent}
              mode={calibMode}
              onPointerDown={onCalibPointerDown}
            />
          )}
        </svg>

        {bubble && (
          <div className="trip-bubble" style={{ left: `${bubble.left}%`, top: `${bubble.top}%` }}>
            <b>{residentList.find((r) => r.id === bubble.residentId)?.name || ''}</b>
            {bubble.text}
          </div>
        )}

        <div className="trip-stage-top">
          <div className="trip-stage-pill trip-stage-pill--name">{room.name}</div>
          <button type="button" className="trip-round trip-round--sm" onClick={() => setSheet('board')} aria-label="打开留言板">
            <BoardIcon />
          </button>
        </div>
      </div>

      {awayJourneys.length > 0 && (
        <section className="trip-away-list" aria-label="外出中的居民">
          {awayJourneys.map((journey) => {
            const resident = residentList.find((r) => r.id === journey.residentId);
            const total = Math.max(1, journey.arriveAt - journey.departAt);
            const pct = clamp(((now - journey.departAt) / total) * 100, 2, 100);
            const remainMin = Math.max(0, Math.round((journey.arriveAt - now) / 60000));
            const remainLabel = remainMin >= 60 ? `约 ${Math.round(remainMin / 60)} 小时后回来` : `约 ${remainMin} 分钟后回来`;
            return (
              <div className="trip-away-row" key={journey.id}>
                <div className="trip-away-dot">{(resident?.name || '?').slice(0, 1)}</div>
                <div className="trip-away-text">
                  <div className="trip-away-line">
                    <strong>{resident?.name || '未知居民'}</strong>
                    <small>{journey.destinationName}</small>
                  </div>
                  <small>{remainLabel}</small>
                  <div className="trip-away-bar">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="trip-room-dock">
        <div className="trip-chips" role="group" aria-label="房间切换">
          {TRIP_ROOMS.map((r) => {
            const unlocked = roomState.unlockedRoomIds.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                className="trip-chip"
                aria-pressed={roomState.selectedRoomId === r.id}
                onClick={() => chooseRoom(r)}
              >
                {!unlocked && <LockIcon />}
                {unlocked ? r.name : `${r.name} ${r.unlockCost}`}
              </button>
            );
          })}
        </div>

        <div className="trip-room-tools">
          <button type="button" className="trip-tool" aria-pressed={isNight} onClick={toggleNight}>
            <MoonIcon />
            日 / 夜
          </button>
          <button type="button" className="trip-tool" aria-pressed={calibOn} onClick={toggleCalib}>
            <CalibIcon />
            标定地板
          </button>
          {gyroAvailable && (
            <button type="button" className="trip-tool" aria-pressed={gyroOn} onClick={() => (gyroOn ? setGyroOn(false) : enableGyro())}>
              <GyroIcon />
              陀螺仪视差
            </button>
          )}
        </div>

        <p className="trip-hint">拖动房间看景深，戳戳居民。{gyroAvailable ? '开启陀螺仪视差后，倾斜手机也会有视差。' : ''}</p>

        {calibOn && (
          <div className="trip-calib-panel">
            <strong>标定地板</strong>
            <p className="trip-hint">在房间上依次点出轮廓，点满三个以上再按"完成形状"。蓝色是能走的地板，红色是家具这类要绕开的障碍。</p>
            <div className="trip-chips">
              <button type="button" className="trip-chip" aria-pressed={calibMode === 'floor'} onClick={() => setCalibMode('floor')}>
                画地板
              </button>
              <button type="button" className="trip-chip" aria-pressed={calibMode === 'block'} onClick={() => setCalibMode('block')}>
                画障碍
              </button>
            </div>
            <div className="trip-calib-actions">
              <button type="button" className="trip-btn trip-btn--sm" onClick={finishCalibShape}>完成形状</button>
              <button type="button" className="trip-btn trip-btn--sm trip-btn--ghost" onClick={undoCalibPoint}>撤销一点</button>
              <button type="button" className="trip-btn trip-btn--sm trip-btn--ghost" onClick={clearCalibShapes}>清空</button>
              <button type="button" className="trip-btn trip-btn--sm" onClick={applyCalibShapes}>应用到房间</button>
            </div>
            <pre className="trip-calib-json">{calibConfigPreview}</pre>
            <button type="button" className="trip-btn trip-btn--sm trip-btn--ghost" onClick={copyCalibConfig}>复制配置</button>
          </div>
        )}
      </section>

      {sheet && (
        <div className="trip-scrim" onClick={() => setSheet(null)}>
          <div className="trip-sheet" onClick={(event) => event.stopPropagation()}>
            {sheet === 'board' && (
              <>
                <div className="trip-sheet-row">
                  <h2 className="trip-sheet-title">留言板</h2>
                  <button type="button" className="trip-btn trip-btn--sm trip-btn--ghost" onClick={() => setSheet(null)}>关闭</button>
                </div>
                <p className="trip-hint">居民回来时会贴上旅途见闻。你留的话，TA们下次回来时会回应。</p>
                <div className="trip-board-list">
                  {boardPosts.length === 0 && <p className="trip-hint">还没有留言，写一句吧。</p>}
                  {boardPosts.map((post) => (
                    <div className="trip-board-post" key={post.id}>
                      <small>{post.authorType === 'user' ? '你' : '居民'}</small>
                      <p>{post.text}</p>
                      {post.status === 'pending' && <span className="trip-board-pending">待回应</span>}
                    </div>
                  ))}
                </div>
                <textarea
                  className="trip-textarea"
                  placeholder="给大家留句话"
                  aria-label="留言内容"
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                />
                <div className="trip-sheet-row">
                  <small className="trip-hint">贴上后会显示"待回应"</small>
                  <button type="button" className="trip-btn" onClick={submitNote}>贴上去</button>
                </div>
              </>
            )}

            {sheet === 'unlock' && unlockTarget && (
              <>
                <h2 className="trip-sheet-title">{unlockTarget.name}</h2>
                <p className="trip-hint">用 {unlockTarget.unlockCost} 旅费解锁这个房间，之后可以随时切换。</p>
                <div className="trip-sheet-row trip-sheet-row--end">
                  <button type="button" className="trip-btn trip-btn--ghost" onClick={() => setSheet(null)}>先不用</button>
                  <button type="button" className="trip-btn" onClick={confirmUnlock}>解锁</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- 子组件 ---------- */

const ResidentSprite = ({ resident, isAway, isReturned, registerNode, onPoke }) => {
  if (isAway) return null;

  return (
    <g
      ref={registerNode}
      className="trip-sprite"
      tabIndex={0}
      role="button"
      aria-label={`戳戳${resident.name}`}
      onClick={onPoke}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPoke();
        }
      }}
    >
      <ellipse cx="0" cy="0" rx="15" ry="5" className="trip-sprite-shadow" />
      <g className="trip-sprite-flip">
        <TripAnimalMark animalId={resident.animalId} />
      </g>
      {isReturned && (
        <g className="trip-sprite-badge" transform="translate(0,-66)">
          <rect x="-10" y="-7" width="20" height="14" rx="2.5" className="trip-sprite-badge-bg" />
          <path d="M-10,-6L0,2L10,-6" className="trip-sprite-badge-mark" />
        </g>
      )}
    </g>
  );
};

const CalibOverlay = ({ shapes, current, mode, onPointerDown }) => {
  const colorFor = (type) => (type === 'floor' ? '#2aa7d6' : '#e0456b');
  const renderShape = (points, type, closed) => (
    <>
      {closed ? (
        <polygon points={points.map((p) => p.join(',')).join(' ')} className={`trip-calib-shape trip-calib-shape--${type}`} />
      ) : (
        <polyline points={points.map((p) => p.join(',')).join(' ')} className={`trip-calib-shape trip-calib-shape--${type} trip-calib-shape--open`} />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3.2" fill={colorFor(type)} stroke="#fff" />
      ))}
    </>
  );

  return (
    <svg
      className="trip-calib-svg"
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      onPointerDown={onPointerDown}
    >
      {shapes.map((shape, i) => (
        <g key={i}>{renderShape(shape.points, shape.type, true)}</g>
      ))}
      {current.length > 0 && renderShape(current, mode, false)}
    </svg>
  );
};

/* ---------- 图标 ---------- */

const BoardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M8 9h8M8 13h5" />
  </svg>
);

const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </svg>
);

const MoonIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />
  </svg>
);

const CalibIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l9 5-9 5-9-5z" />
    <path d="M3 13l9 5 9-5" />
  </svg>
);

const GyroIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <ellipse cx="12" cy="12" rx="4" ry="9" />
  </svg>
);

export default TripRoom;