// src/apps/flightchess/flightChessShake.js
//
// 「摇一摇」检测：监听手机的运动传感器（devicemotion），在短时间内连续出现
// 几次明显的加速度突变就算一次摇晃。纯工具，不碰 Dexie、不碰游戏规则。
//
// iOS 要求在用户手势里调用 DeviceMotionEvent.requestPermission() 才会给数据，
// 所以界面上要有一个按钮去触发 requestMotionPermission；安卓和桌面浏览器
// 不需要授权。桌面一般没有传感器数据，摇一摇自然不会触发，点击/拖拽兜底。

import { useEffect, useRef } from 'react';

// 相邻两次采样的加速度变化量（三轴绝对值之和）超过它，算一次「猛」的动作
const SPIKE_DELTA = 25;
// 在这个时间窗口内出现这么多次，才算摇晃（避免走路、抬手误触发）
const SPIKE_WINDOW_MS = 700;
const SPIKES_REQUIRED = 3;
// 触发一次之后的冷却时间
const COOLDOWN_MS = 1500;

let motionGranted = false;

export const isShakeSupported = () => (
  typeof window !== 'undefined' && typeof window.DeviceMotionEvent !== 'undefined'
);

export const needsMotionPermission = () => (
  isShakeSupported() && typeof window.DeviceMotionEvent.requestPermission === 'function'
);

/** 是不是触屏设备（桌面浏览器不提示摇一摇） */
export const isTouchDevice = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: coarse)').matches
);

/** 现在是否已经可以收到运动数据（不需要授权，或者已经授权过） */
export const hasMotionPermission = () => (
  isShakeSupported() && (!needsMotionPermission() || motionGranted)
);

/** 必须在点击等用户手势里调用。返回是否授权成功。 */
export const requestMotionPermission = async () => {
  if (!isShakeSupported()) return false;
  if (!needsMotionPermission()) {
    motionGranted = true;
    return true;
  }
  try {
    const result = await window.DeviceMotionEvent.requestPermission();
    motionGranted = result === 'granted';
  } catch (err) {
    console.warn('[flightChessShake] 申请运动传感器权限失败:', err);
    motionGranted = false;
  }
  return motionGranted;
};

/**
 * enabled 为 true 时监听摇晃，摇到了调用 onShake（始终调用最新的回调）。
 */
export const useShakeDetector = (enabled, onShake) => {
  const callbackRef = useRef(onShake);
  callbackRef.current = onShake;

  useEffect(() => {
    if (!enabled || !isShakeSupported()) return undefined;

    let last = null;
    let spikes = [];
    let cooldownUntil = 0;

    const handler = (event) => {
      const accel = event.accelerationIncludingGravity || event.acceleration;
      if (!accel || accel.x == null || accel.y == null || accel.z == null) return;

      const now = Date.now();
      if (last) {
        const delta = Math.abs(accel.x - last.x)
          + Math.abs(accel.y - last.y)
          + Math.abs(accel.z - last.z);
        if (delta > SPIKE_DELTA && now > cooldownUntil) {
          spikes = spikes.filter((time) => now - time < SPIKE_WINDOW_MS);
          spikes.push(now);
          if (spikes.length >= SPIKES_REQUIRED) {
            spikes = [];
            cooldownUntil = now + COOLDOWN_MS;
            callbackRef.current?.();
          }
        }
      }
      last = { x: accel.x, y: accel.y, z: accel.z };
    };

    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
  }, [enabled]);
};