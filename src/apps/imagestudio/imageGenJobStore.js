// src/apps/imagestudio/imageGenJobStore.js
//
// 生图任务的"模块级"状态：任务跑在这里，而不是跑在某个 React 组件里。
// 这样切 tab、关弹窗、甚至离开生图室，请求都不会丢；回来时界面从这里读到
// 最新状态（进行中 / 已完成的结果 / 失败原因）。
//
// 同一时间只允许一个任务（跟之前"生成中按钮置灰"的行为一致）。
// 用 useImageGenJob() 在组件里订阅。

import { useSyncExternalStore } from 'react';

import { ImageGenError } from './imageGenAdapters';
import { getImageGenConfig } from './imageGenConfigService';
import { notifyGenerationDone, notifyGenerationFailed } from './imageGenNotify';
import { runImageGeneration } from './imageGenRunner';

const IDLE = {
  status: 'idle', // idle | running | done | error
  startedAt: 0,
  sceneText: '',
  outcome: null,
  errorText: '',
  doneSeq: 0, // 每次成功 +1，画廊等可据此刷新
};

let state = IDLE;
const listeners = new Set();

const setState = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const getImageGenJob = () => state;

export const subscribeImageGenJob = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useImageGenJob = () => useSyncExternalStore(subscribeImageGenJob, getImageGenJob);

/**
 * 开始一次生成。已有任务在跑时直接忽略（返回 false）。
 * 结果通过 store 状态 + 完成提醒送出，调用方不需要 await。
 */
export const startImageGeneration = ({
  sceneText,
  chatId = null,
  characterId = null,
  includeCharacterAppearance = false,
  includeUserAppearance = false,
}) => {
  if (state.status === 'running') return false;

  setState({
    status: 'running',
    startedAt: Date.now(),
    sceneText: String(sceneText || ''),
    outcome: null,
    errorText: '',
  });

  const run = async () => {
    try {
      // 点击时再读一次最新配置，保证用的是设置里刚保存的值。
      const config = await getImageGenConfig();
      const result = await runImageGeneration({
        config,
        sceneText,
        chatId,
        characterId,
        includeCharacterAppearance,
        includeUserAppearance,
      });

      setState({ status: 'done', outcome: result, doneSeq: state.doneSeq + 1 });
      notifyGenerationDone({ sceneText, saved: Boolean(result.record) });
    } catch (error) {
      const message =
        error instanceof ImageGenError ? error.message : `生成失败：${error?.message || '未知错误'}`;
      setState({ status: 'error', errorText: message });
      notifyGenerationFailed({ message });
    }
  };

  void run();
  return true;
};

/** 清掉上一次的结果/错误（任务进行中不动）。 */
export const dismissImageGenResult = () => {
  if (state.status === 'running') return;
  setState({ status: 'idle', outcome: null, errorText: '' });
};