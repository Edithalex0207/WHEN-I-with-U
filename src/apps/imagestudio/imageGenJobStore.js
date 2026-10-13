// src/apps/imagestudio/imageGenJobStore.js
//
// 生图任务的"模块级"状态：任务跑在这里，而不是跑在某个 React 组件里。
// 这样切 tab、关弹窗、甚至离开生图室，请求都不会丢；回来时界面从这里读到
// 最新状态（进行中 / 已完成的结果 / 失败原因）。
//
// 支持同时跑多个任务（第三方接口可以并发）：每个任务是 jobs 数组里的一项，
// 各自独立成功或失败，一个失败不影响别的。同时进行的上限由调用方通过
// maxRunning 传入（NovelAI 传 1，第三方最多 MAX_PARALLEL_JOBS）。
// 用 useImageGenJobs() 在组件里订阅。
//
// 任务项字段：
//   id, status('pending'|'done'|'failed'), startedAt, sceneText, request,
//   width/height（预估尺寸，用来提前摆好占位画框）, outcome, errorText,
//   seen（完成后用户是否已经看过，没看过就在墙上亮红点）

import { useSyncExternalStore } from 'react';

import { ImageGenError } from './imageGenAdapters';
import { getImageGenConfig } from './imageGenConfigService';
import { notifyGenerationDone, notifyGenerationFailed } from './imageGenNotify';
import { runImageGeneration } from './imageGenRunner';

export const MAX_PARALLEL_JOBS = 4;
// 只在内存里保留最近这些张（原图 Blob 都挂在任务上），更早的已经存进画廊了。
export const MAX_RETAINED_JOBS = 12;

const INITIAL = {
  jobs: [],
  selectedId: null,
  doneSeq: 0, // 每次成功 +1，画廊等可据此刷新
};

let state = INITIAL;
let nextJobId = 1;
let lastSoundAt = 0;
const listeners = new Set();

const update = (updater) => {
  state = updater(state);
  listeners.forEach((listener) => listener());
};

const patchJob = (id, patch, extra = null) =>
  update((current) => ({
    ...current,
    ...(extra || {}),
    jobs: current.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
  }));

export const getImageGenJobs = () => state;

export const subscribeImageGenJobs = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useImageGenJobs = () => useSyncExternalStore(subscribeImageGenJobs, getImageGenJobs);

export const countRunningJobs = (snapshot = state) =>
  snapshot.jobs.filter((job) => job.status === 'pending').length;

const trimJobs = (jobs, selectedId) => {
  if (jobs.length <= MAX_RETAINED_JOBS) return jobs;

  const next = [...jobs];
  for (let index = 0; index < next.length && next.length > MAX_RETAINED_JOBS; ) {
    const job = next[index];
    if (job.status !== 'pending' && job.id !== selectedId) next.splice(index, 1);
    else index += 1;
  }

  return next;
};

const runJob = async (id) => {
  const job = state.jobs.find((item) => item.id === id);
  if (!job) return;

  try {
    // 每个任务启动时再读一次最新配置，保证用的是设置里刚保存的值。
    const config = await getImageGenConfig();
    const result = await runImageGeneration({ config, ...job.request });

    patchJob(
      id,
      { status: 'done', outcome: result, errorText: '', seen: state.selectedId === id },
      { doneSeq: state.doneSeq + 1 }
    );

    const quiet = Date.now() - lastSoundAt < 1500;
    if (!quiet) lastSoundAt = Date.now();
    notifyGenerationDone({ sceneText: job.sceneText, saved: Boolean(result.record), quiet });
  } catch (error) {
    const message =
      error instanceof ImageGenError ? error.message : `生成失败：${error?.message || '未知错误'}`;
    patchJob(id, { status: 'failed', errorText: message });
    notifyGenerationFailed({ message });
  }
};

/**
 * 开始 count 张生成，每张是一个独立任务。
 * 同时进行的数量不会超过 maxRunning：已有任务在跑时只补到上限，
 * 返回实际启动了几张（0 表示已经满了，什么都没做）。
 *
 * @param request  { sceneText, chatId, characterId, includeCharacterAppearance, includeUserAppearance }
 * @param planned  { width, height } 预估尺寸，仅用于占位画框的比例
 */
export const startImageGeneration = ({
  request,
  count = 1,
  maxRunning = MAX_PARALLEL_JOBS,
  planned = { width: 1024, height: 1024 },
}) => {
  const free = Math.max(0, maxRunning - countRunningJobs());
  const total = Math.min(Math.max(1, Math.floor(Number(count) || 1)), free);
  if (total <= 0) return 0;

  const now = Date.now();
  const created = [];

  for (let index = 0; index < total; index += 1) {
    created.push({
      id: nextJobId,
      status: 'pending',
      startedAt: now,
      sceneText: String(request?.sceneText || ''),
      request: { ...request },
      width: planned.width,
      height: planned.height,
      outcome: null,
      errorText: '',
      seen: false,
    });
    nextJobId += 1;
  }

  const selectedId = created[0].id;

  update((current) => ({
    ...current,
    selectedId,
    jobs: trimJobs([...current.jobs, ...created], selectedId),
  }));

  created.forEach((job) => {
    void runJob(job.id);
  });

  return total;
};

/** 只重试失败的那一张，其他不动。 */
export const retryImageGenJob = (id) => {
  const job = state.jobs.find((item) => item.id === id);
  if (!job || job.status !== 'failed') return false;
  if (countRunningJobs() >= MAX_PARALLEL_JOBS) return false;

  patchJob(id, { status: 'pending', startedAt: Date.now(), errorText: '', outcome: null, seen: false });
  void runJob(id);
  return true;
};

/** 把某一幅换到展墙正中，顺便算作已看过。 */
export const selectImageGenJob = (id) =>
  update((current) => ({
    ...current,
    selectedId: id,
    jobs: current.jobs.map((job) => (job.id === id ? { ...job, seen: true } : job)),
  }));

/** 收起一幅已完成 / 失败的画（进行中的不能收）。 */
export const dismissImageGenJob = (id) =>
  update((current) => {
    const target = current.jobs.find((job) => job.id === id);
    if (!target || target.status === 'pending') return current;

    const jobs = current.jobs.filter((job) => job.id !== id);
    const selectedId =
      current.selectedId === id ? (jobs.length ? jobs[jobs.length - 1].id : null) : current.selectedId;

    return { ...current, jobs, selectedId };
  });