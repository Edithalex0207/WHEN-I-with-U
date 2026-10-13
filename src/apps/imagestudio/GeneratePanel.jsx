// src/apps/imagestudio/GeneratePanel.jsx
//
// 生图室「展厅」页（原「生成」页），整体按一间小画廊来排：
//   1. 展墙：当前这幅画按真实比例挂在最上面，下面一张名牌写作品信息和操作。
//   2. 墙上的画：同时在画 / 已画好的几幅挂成一排，点哪幅就换到正中，
//      红点表示新画好、还没看过。
//   3. 作画台：选聊天、写画面内容、折叠的"固定前缀 / 负面提示词"、画幅、
//      同时作画张数（仅第三方）和开始按钮。
//
// 生成任务本身跑在 imageGenJobStore（模块级），支持同时多张，也不依赖任何组件是否挂载。
// 配置通过 useImageGenConfig 订阅，在设置里切换后端会立刻反映到这里，不用退出重进。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Download, ExternalLink, Minus, Plus } from 'lucide-react';

import db from '../../db';
import {
  STORAGE_WARNING_THRESHOLD_BYTES,
  formatBytes,
  getStorageUsageBytes,
} from '../../db/storageUtils';
import { patchNovelAiConfig, patchThirdPartyConfig } from './imageGenConfigService';
import { buildImageFileName, saveBlobToDevice } from './imageGenMedia';
import {
  buildGenerationPrompts,
  getMissingConfigItems,
  getPlannedImageSize,
} from './imageGenRequest';
import { loadPromptSources } from './imageGenRunner';
import { ensureNotifyPermission, getNotifySettings } from './imageGenNotify';
import {
  MAX_PARALLEL_JOBS,
  countRunningJobs,
  dismissImageGenJob,
  retryImageGenJob,
  selectImageGenJob,
  startImageGeneration,
  useImageGenJobs,
} from './imageGenJobStore';
import { BACKEND_NOVELAI } from './imageGenRules';
import { getGenerationStats } from './imageGenerationService';
import { useImageGenConfig } from './useImageGenConfig';
import {
  Field,
  SectionCard,
  SelectInput,
  StudioSectionHead,
  TextArea,
} from './StudioFormParts';

const NO_CHAT = '';
const CONCURRENCY_KEY = 'imagestudio_concurrency';

// 画幅选项：NovelAI 直接改宽高，第三方改"宽x高"字符串（可用的尺寸取决于对方服务）。
const NAI_RATIOS = [
  { id: 'portrait', label: '竖', width: 832, height: 1216 },
  { id: 'landscape', label: '横', width: 1216, height: 832 },
  { id: 'square', label: '方', width: 1024, height: 1024 },
];
const THIRD_RATIOS = [
  { id: 'portrait', label: '竖', width: 1024, height: 1792 },
  { id: 'landscape', label: '横', width: 1792, height: 1024 },
  { id: 'square', label: '方', width: 1024, height: 1024 },
];

const orientationOf = (width, height) => {
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
};

const readConcurrency = () => {
  try {
    const value = Math.round(Number(localStorage.getItem(CONCURRENCY_KEY)));
    return value >= 1 && value <= MAX_PARALLEL_JOBS ? value : 1;
  } catch {
    return 1;
  }
};

const formatElapsed = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const jobNumber = (id) => `No. ${String(id).padStart(4, '0')}`;

// 画框随图片比例撑开：高度最多约 60vh，所以横图宽、竖图窄，但都完整显示。
// 42px = 画框 7px*2 + 衬纸 14px*2。
const frameWidth = (ratio) => `min(100%, calc(60vh * ${ratio.toFixed(4)} + 42px))`;

const jobRatio = (job) => {
  const record = job?.outcome?.record;
  if (record && record.width > 0 && record.height > 0) return record.width / record.height;
  return job && job.width > 0 && job.height > 0 ? job.width / job.height : 1;
};

const FRAME_SHADOW = '0 24px 38px -14px rgba(0,0,0,0.35), 0 3px 6px -2px rgba(0,0,0,0.25)';

/** 显示一个任务的图：优先缩略图（小画用）或原图 Blob，没有就用外链。 */
const JobImage = ({ outcome, preferThumb = false }) => {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (preferThumb && outcome?.record?.thumbnail) {
      setUrl(outcome.record.thumbnail);
      return undefined;
    }

    if (outcome?.blob) {
      const objectUrl = URL.createObjectURL(outcome.blob);
      setUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }

    setUrl(outcome?.remoteUrl || outcome?.record?.thumbnail || '');
    return undefined;
  }, [outcome, preferThumb]);

  if (!url) {
    return (
      <span className="flex h-full w-full items-center justify-center text-xs opacity-60">
        没有拿到可显示的图片。
      </span>
    );
  }

  return (
    <img
      src={url}
      alt="生成的图片"
      className="animate-fade-in"
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  );
};

const GeneratePanel = ({ onGoSettings }) => {
  const config = useImageGenConfig();
  const [characters, setCharacters] = useState([]);
  const [chats, setChats] = useState([]);

  const [chatIdText, setChatIdText] = useState(NO_CHAT);
  const [includeCharacter, setIncludeCharacter] = useState(true);
  const [includeUser, setIncludeUser] = useState(false);
  const [scene, setScene] = useState('');
  const [concurrency, setConcurrency] = useState(readConcurrency);
  const [foldOpen, setFoldOpen] = useState(false);
  const [prefixDraft, setPrefixDraft] = useState('');
  const [negativeDraft, setNegativeDraft] = useState('');

  const [sources, setSources] = useState({
    characterAppearance: '',
    userAppearance: '',
    artistTags: '',
  });

  // 生成任务的状态放在模块级 store 里（imageGenJobStore），切 tab / 离开页面都不会丢。
  const jobState = useImageGenJobs();
  const jobs = jobState.jobs;
  const selectedJob = jobs.find((item) => item.id === jobState.selectedId) || null;
  const running = countRunningJobs(jobState);
  const [now, setNow] = useState(Date.now());
  const [saveMessage, setSaveMessage] = useState('');

  const [stats, setStats] = useState({ count: 0, originalBytes: 0, thumbnailBytes: 0 });
  const [storage, setStorage] = useState({ supported: false, usage: 0, quota: 0 });

  const selectedChat = useMemo(
    () => chats.find((item) => String(item.id) === chatIdText) || null,
    [chats, chatIdText]
  );
  const characterId = selectedChat ? selectedChat.characterId : null;
  const chatId = selectedChat ? selectedChat.id : null;

  const refreshStats = useCallback(async () => {
    const [nextStats, nextStorage] = await Promise.all([
      getGenerationStats(),
      getStorageUsageBytes(),
    ]);
    setStats(nextStats);
    setStorage(nextStorage);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [characterList, chatList] = await Promise.all([
          db.characters.toArray(),
          db.chats.toArray(),
        ]);

        if (cancelled) return;
        setCharacters(characterList);
        setChats(chatList);
      } catch (error) {
        console.warn('[ImageStudio] 读取生成面板数据失败：', error);
      }

      void refreshStats();
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshStats]);

  useEffect(() => {
    if (jobState.doneSeq > 0) void refreshStats();
  }, [jobState.doneSeq, refreshStats]);

  // 有任务在画时每秒刷新一次计时。
  useEffect(() => {
    if (running === 0) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    setSaveMessage('');
  }, [jobState.selectedId]);

  // 配置里的固定前缀 / 负面提示词变了（包括在设置里改的），同步到本地草稿。
  const configPrefix = config?.novelai.positivePrefix ?? '';
  const configNegative = config?.novelai.negativePrompt ?? '';
  useEffect(() => setPrefixDraft(configPrefix), [configPrefix]);
  useEffect(() => setNegativeDraft(configNegative), [configNegative]);

  // 提示词预览用的素材：选的聊天、勾选项或配置变了就重新读。
  useEffect(() => {
    if (!config) return undefined;

    let cancelled = false;

    loadPromptSources({
      config,
      chatId,
      characterId,
      includeCharacterAppearance: includeCharacter,
      includeUserAppearance: includeUser,
    })
      .then((loaded) => {
        if (!cancelled) setSources(loaded);
      })
      .catch((error) => console.warn('[ImageStudio] 读取提示词素材失败：', error));

    return () => {
      cancelled = true;
    };
  }, [config, chatId, characterId, includeCharacter, includeUser]);

  const characterNameById = (id) => characters.find((item) => item.id === id)?.name || '未知角色';

  const chatOptions = useMemo(
    () => [
      { value: NO_CHAT, label: '不关联聊天' },
      ...chats.map((item) => ({
        value: String(item.id),
        label: `${characterNameById(item.characterId)}${item.title ? ` / ${item.title}` : ''} (#${item.id})`,
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chats, characters]
  );

  if (!config) {
    return <p className="py-10 text-center text-xs opacity-50">读取中...</p>;
  }

  const missing = getMissingConfigItems(config);
  const isNovelAi = config.backend === BACKEND_NOVELAI;
  const maxRunning = isNovelAi ? 1 : MAX_PARALLEL_JOBS;
  const batchCount = isNovelAi ? 1 : concurrency;
  const planned = getPlannedImageSize(config);
  const prompts = buildGenerationPrompts({ config, sceneText: scene, ...sources });
  const overThreshold = storage.supported && storage.usage >= STORAGE_WARNING_THRESHOLD_BYTES;
  const full = running >= maxRunning;
  const canStart = Boolean(scene.trim()) && missing.length === 0 && !full;

  const ratios = isNovelAi ? NAI_RATIOS : THIRD_RATIOS;
  const rawSize = isNovelAi
    ? { width: config.novelai.width, height: config.novelai.height }
    : planned;
  const activeOrientation = orientationOf(rawSize.width, rawSize.height);

  const foldFilled = [prefixDraft, negativeDraft].filter((text) => text.trim()).length;

  const chipStyle = (on) => ({
    backgroundColor: on ? 'var(--accent-color)' : 'transparent',
    color: on ? 'var(--accent-foreground)' : 'var(--text-sub)',
    borderColor: on ? 'var(--accent-color)' : 'var(--divider)',
  });

  const handleGenerate = () => {
    if (!canStart) return;

    setSaveMessage('');

    // 点「开始作画」是用户手势，趁这时申请系统通知权限（已决定过的不会再弹）。
    if (getNotifySettings().notify) void ensureNotifyPermission();

    startImageGeneration({
      request: {
        sceneText: scene,
        chatId,
        characterId,
        includeCharacterAppearance: includeCharacter,
        includeUserAppearance: includeUser,
      },
      count: batchCount,
      maxRunning,
      planned,
    });
  };

  const handleAnother = (job) => {
    if (full) return;
    startImageGeneration({
      request: job.request,
      count: 1,
      maxRunning,
      planned: { width: job.width, height: job.height },
    });
  };

  const handleSave = async (job) => {
    const blob = job?.outcome?.blob;
    if (!blob) return;

    const how = await saveBlobToDevice(blob, buildImageFileName(blob));

    if (how === 'shared') setSaveMessage('已调起系统分享面板，选「存储图像」就能存进相册。');
    else if (how === 'downloaded') setSaveMessage('已开始下载，请在浏览器的下载列表里查看。');
    else setSaveMessage('');
  };

  const changeConcurrency = (delta) => {
    const next = Math.min(MAX_PARALLEL_JOBS, Math.max(1, concurrency + delta));
    setConcurrency(next);
    try {
      localStorage.setItem(CONCURRENCY_KEY, String(next));
    } catch {
      // 写不进去时本次仍按选的数量工作。
    }
  };

  const pickRatio = (option) => {
    if (isNovelAi) {
      void patchNovelAiConfig({ width: option.width, height: option.height });
    } else {
      void patchThirdPartyConfig({ size: `${option.width}x${option.height}` });
    }
  };

  const stageRatio = selectedJob ? jobRatio(selectedJob) : planned.width / planned.height;
  const outcome = selectedJob?.outcome || null;
  const record = outcome?.record || null;

  const specLine = (() => {
    if (!selectedJob) return '';
    if (selectedJob.status === 'pending') return '作画中';
    if (selectedJob.status === 'failed') return '这一张没有画成';
    if (!record) return '未存进画廊';

    const params = record.params || {};
    const size = record.width > 0 ? `${record.width}x${record.height}` : params.size || '';

    if (record.backend === BACKEND_NOVELAI) {
      return [
        record.model,
        size,
        params.steps ? `${params.steps} 步` : '',
        params.seed !== undefined ? `seed ${params.seed}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    }

    return [record.model, size].filter(Boolean).join(' · ');
  })();

  const goButtonLabel = (() => {
    if (full) {
      return isNovelAi ? '作画中…（切换页面也不会中断）' : `已有 ${running} 张在画，等一等再开始`;
    }
    return batchCount > 1 ? `开始作画 · 同时 ${batchCount} 张` : '开始作画';
  })();

  return (
    <div className="space-y-6">
      {/* ===== 展墙 ===== */}
      <section
        className="rounded-[28px] px-1 pb-2 pt-5"
        style={{
          background:
            'radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, var(--card-bg) 80%, transparent) 0%, transparent 70%)',
        }}
      >
        <div className="flex items-center justify-center">
          <div
            className="max-w-full p-[7px]"
            style={{
              width: frameWidth(stageRatio),
              backgroundColor: 'var(--text-main)',
              boxShadow: FRAME_SHADOW,
            }}
          >
            <div className="p-3.5" style={{ backgroundColor: 'var(--bg-surface)' }}>
              <div
                className="relative w-full overflow-hidden"
                style={{ aspectRatio: String(stageRatio), backgroundColor: 'var(--bg-surface-strong)' }}
              >
                {selectedJob?.status === 'done' ? <JobImage outcome={outcome} /> : null}

                {selectedJob?.status === 'pending' ? (
                  <div className="flex h-full animate-pulse flex-col items-center justify-center gap-1.5 px-3 text-center">
                    <span className="font-serif text-base italic">正在晕染…</span>
                    <span className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                      可以去别处逛逛，画好了会提醒你
                    </span>
                    <span className="mt-1 text-[10px] tabular-nums opacity-60">
                      {formatElapsed(now - selectedJob.startedAt)}
                    </span>
                  </div>
                ) : null}

                {selectedJob?.status === 'failed' ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                    <span className="font-serif text-base italic">这一张没画成</span>
                    <span className="text-[10px] leading-relaxed text-rose-500">
                      {selectedJob.errorText}
                    </span>
                    <button
                      type="button"
                      onClick={() => retryImageGenJob(selectedJob.id)}
                      className="rounded-full border px-4 py-1.5 text-[11px] font-semibold"
                      style={{ borderColor: 'var(--text-main)' }}
                    >
                      只重试这一张
                    </button>
                  </div>
                ) : null}

                {!selectedJob ? (
                  <div
                    className="flex h-full flex-col items-center justify-center gap-1 opacity-50"
                    style={{ outline: '1px dashed var(--divider)', outlineOffset: '-1px' }}
                  >
                    <span className="font-serif text-base italic">尚无新作</span>
                    <span className="text-[9px] uppercase tracking-[0.18em]">等你落笔</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* 名牌 */}
        {selectedJob ? (
          <div
            className="mx-auto mt-5 w-full max-w-[19rem] border px-3.5 pb-2.5 pt-3 shadow-md"
            style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
          >
            <p className="font-mono text-[9.5px] tracking-[0.1em] opacity-55">
              {jobNumber(selectedJob.id)}
            </p>
            <h2 className="mt-1 break-words font-serif text-lg font-semibold leading-snug">
              {selectedJob.sceneText}
            </h2>
            {specLine ? (
              <p className="mt-0.5 break-words font-mono text-[10px] leading-relaxed opacity-70">
                {specLine}
              </p>
            ) : null}

            {outcome?.adjustments?.length > 0 ? (
              <p className="mt-2 text-[10px] leading-relaxed text-amber-500">
                「允许消耗 Anlas」是关闭的，本次已按免费范围调整：{outcome.adjustments.join('；')}。
              </p>
            ) : null}

            {outcome?.saveError ? (
              <p className="mt-2 text-[11px] leading-relaxed text-rose-500">{outcome.saveError}</p>
            ) : null}

            {outcome?.remoteUrl && !outcome?.blob ? (
              <p className="mt-2 text-[10px] leading-relaxed opacity-60">
                这张图只拿到了外部链接（没能下载到本机），链接失效后就看不到了，建议尽快打开保存。
              </p>
            ) : null}

            {selectedJob.status !== 'pending' ? (
              <div
                className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-[11.5px]"
                style={{ borderColor: 'var(--divider)' }}
              >
                {outcome?.blob ? (
                  <button
                    type="button"
                    onClick={() => handleSave(selectedJob)}
                    className="flex items-center gap-1 border-b font-semibold"
                    style={{ borderColor: 'var(--text-main)' }}
                  >
                    <Download className="h-3.5 w-3.5" /> 保存到设备
                  </button>
                ) : null}

                {outcome?.remoteUrl ? (
                  <a
                    href={outcome.remoteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 border-b font-semibold"
                    style={{ borderColor: 'var(--text-main)' }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> 打开原链接
                  </a>
                ) : null}

                {selectedJob.status === 'done' ? (
                  <button
                    type="button"
                    disabled={full}
                    onClick={() => handleAnother(selectedJob)}
                    className="border-b font-semibold disabled:opacity-40"
                    style={{ borderColor: 'var(--text-main)' }}
                  >
                    再画一张
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => dismissImageGenJob(selectedJob.id)}
                  className="ml-auto text-[10px] opacity-50"
                >
                  收起
                </button>
              </div>
            ) : null}

            {saveMessage ? <p className="mt-2 text-[10px] opacity-60">{saveMessage}</p> : null}
          </div>
        ) : null}
      </section>

      {/* ===== 墙上的画 ===== */}
      {jobs.length > 0 ? (
        <section>
          <StudioSectionHead
            title="墙上的画"
            note={running > 0 ? `正在画 ${running} 张` : '点一幅换到正中'}
          />
          <div className="flex items-end gap-3 overflow-x-auto px-1 pb-3 pt-1">
            {[...jobs].reverse().map((job) => {
              const ratio = jobRatio(job);
              const width = Math.round(72 * ratio);
              const current = job.id === jobState.selectedId;

              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => selectImageGenJob(job.id)}
                  aria-current={current}
                  aria-label={jobNumber(job.id)}
                  className="relative shrink-0 text-center"
                >
                  {job.status === 'done' && !job.seen ? (
                    <i
                      className="absolute -right-1 -top-1 z-10 h-2.5 w-2.5 rounded-full bg-rose-500"
                      style={{ boxShadow: '0 0 0 2px var(--bg-main)' }}
                    />
                  ) : null}
                  <span
                    className="block p-[3px]"
                    style={{
                      backgroundColor: 'var(--text-main)',
                      boxShadow: '0 10px 14px -8px rgba(0,0,0,0.35)',
                      outline: current ? '2px solid var(--text-main)' : 'none',
                      outlineOffset: '3px',
                    }}
                  >
                    <span className="block p-1" style={{ backgroundColor: 'var(--bg-surface)' }}>
                      <span
                        className="relative flex items-center justify-center overflow-hidden"
                        style={{
                          width,
                          height: 72,
                          backgroundColor: 'var(--bg-surface-strong)',
                        }}
                      >
                        {job.status === 'done' ? <JobImage outcome={job.outcome} preferThumb /> : null}
                        {job.status === 'pending' ? (
                          <span className="font-mono text-[10px] tabular-nums opacity-70">
                            {formatElapsed(now - job.startedAt)}
                          </span>
                        ) : null}
                        {job.status === 'failed' ? (
                          <span className="text-base text-rose-500">×</span>
                        ) : null}
                      </span>
                    </span>
                  </span>
                  <span className="mt-1.5 block font-mono text-[9px] opacity-55">
                    {String(job.id).padStart(4, '0')}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ===== 作画台 ===== */}
      {missing.length > 0 ? (
        <SectionCard title="还不能生成">
          <p className="text-[11px] leading-relaxed">
            当前后端（{isNovelAi ? 'NovelAI' : '第三方接口'}）还缺少：{missing.join('、')}。
          </p>
          <button
            type="button"
            onClick={onGoSettings}
            className="rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-foreground)' }}
          >
            去设置
          </button>
        </SectionCard>
      ) : null}

      <section>
        <StudioSectionHead
          title="作画台"
          note={isNovelAi ? `NovelAI · ${config.novelai.model}` : '第三方接口'}
        />
        <SectionCard>
          <Field label="关联聊天">
            <SelectInput value={chatIdText} onChange={setChatIdText} options={chatOptions} />
          </Field>

          {selectedChat ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIncludeCharacter(!includeCharacter)}
                  className="rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all"
                  style={chipStyle(includeCharacter)}
                >
                  角色外貌
                </button>
                <button
                  type="button"
                  onClick={() => setIncludeUser(!includeUser)}
                  className="rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all"
                  style={chipStyle(includeUser)}
                >
                  用户外貌
                </button>
              </div>
              {includeCharacter && !sources.characterAppearance ? (
                <p className="text-[10px] italic opacity-50">
                  {characterNameById(characterId)} 还没有填写外貌，可以在「更多 → 外貌」里填写。
                </p>
              ) : null}
              {includeUser && !sources.userAppearance ? (
                <p className="text-[10px] italic opacity-50">
                  这个聊天和全局默认都没有填写用户外貌，可以在「更多 → 外貌」里填写。
                </p>
              ) : null}
            </div>
          ) : null}

          <Field
            label="画面内容"
            hint={
              isNovelAi
                ? 'NovelAI 建议写英文标签，比如：outdoors, rain, sitting by the window。'
                : '用自然语言描述画面即可。'
            }
          >
            <TextArea
              value={scene}
              onChange={setScene}
              placeholder={isNovelAi ? 'outdoors, rain, sitting by the window' : '雨天，坐在窗边看书'}
              rows={4}
            />
          </Field>

          {/* 固定前缀 / 负面提示词：只有 NovelAI 会用到，默认收起 */}
          {isNovelAi ? (
            <div className="rounded-2xl border border-dashed" style={{ borderColor: 'var(--divider)' }}>
              <button
                type="button"
                onClick={() => setFoldOpen(!foldOpen)}
                aria-expanded={foldOpen}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[11.5px] font-semibold"
              >
                固定前缀 / 负面提示词
                <span
                  className="rounded-full px-2 py-px text-[9.5px]"
                  style={{ backgroundColor: 'var(--control-soft-bg)' }}
                >
                  {foldFilled} 项已填
                </span>
                <span className="ml-auto text-[10px] opacity-60">{foldOpen ? '收起' : '展开'}</span>
              </button>

              {foldOpen ? (
                <div className="space-y-3 px-3 pb-3">
                  <Field label="固定正面前缀" hint="每次生成都放在最前面，比如质量词。">
                    <TextArea
                      value={prefixDraft}
                      onChange={setPrefixDraft}
                      onBlur={() => {
                        if (prefixDraft !== configPrefix) {
                          void patchNovelAiConfig({ positivePrefix: prefixDraft });
                        }
                      }}
                      placeholder="masterpiece, best quality"
                      rows={2}
                    />
                  </Field>
                  <Field label="负面提示词">
                    <TextArea
                      value={negativeDraft}
                      onChange={setNegativeDraft}
                      onBlur={() => {
                        if (negativeDraft !== configNegative) {
                          void patchNovelAiConfig({ negativePrompt: negativeDraft });
                        }
                      }}
                      placeholder="lowres, bad anatomy, ..."
                      rows={3}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}

          <Field
            label="画幅"
            hint={
              isNovelAi
                ? undefined
                : '具体可用的尺寸取决于你用的服务；要自定义可以在「设置」里直接填尺寸。'
            }
          >
            <div className="flex flex-wrap gap-2">
              {ratios.map((option) => {
                const on = option.id === activeOrientation;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => pickRatio(option)}
                    aria-pressed={on}
                    className="rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all"
                    style={chipStyle(on)}
                  >
                    {option.label} {option.width}x{option.height}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-[12px] font-semibold">同时作画</span>
              <span className="block text-[10px] leading-relaxed opacity-55">
                {isNovelAi
                  ? 'NovelAI 一次只能画 1 张（官方有并发限制）。'
                  : `一次同时出几张，最多 ${MAX_PARALLEL_JOBS} 张。其中一张失败不影响别的。`}
              </span>
            </div>
            <div
              className="flex shrink-0 items-center rounded-full border"
              style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--bg-surface)' }}
            >
              <button
                type="button"
                aria-label="减少"
                disabled={isNovelAi || concurrency <= 1}
                onClick={() => changeConcurrency(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-30"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <output className="min-w-[1.75rem] text-center font-mono text-[13px]">{batchCount}</output>
              <button
                type="button"
                aria-label="增加"
                disabled={isNovelAi || concurrency >= MAX_PARALLEL_JOBS}
                onClick={() => changeConcurrency(1)}
                className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-30"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <details className="text-[11px]">
            <summary className="cursor-pointer select-none opacity-60">查看最终发出去的提示词</summary>
            <div className="mt-2 space-y-2">
              <p
                className="break-words rounded-2xl border p-2.5 leading-relaxed"
                style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--bg-surface)' }}
              >
                {prompts.positive || '（还没有内容）'}
              </p>
              {isNovelAi ? (
                <p
                  className="break-words rounded-2xl border p-2.5 leading-relaxed opacity-80"
                  style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--bg-surface)' }}
                >
                  负面：{prompts.negative || '（空）'}
                </p>
              ) : null}
            </div>
          </details>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canStart}
            className="flex w-full items-center justify-between rounded-full py-1.5 pl-5 pr-1.5 text-xs font-semibold shadow-md transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-foreground)' }}
          >
            <span>{goButtonLabel}</span>
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: 'var(--accent-foreground)', color: 'var(--accent-color)' }}
            >
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        </SectionCard>
      </section>

      <section>
        <StudioSectionHead title="收藏概览" />
        <div className="flex gap-6">
          <Stat value={stats.count} label="Images" />
          <Stat value={formatBytes(stats.originalBytes)} label="Originals" />
          <Stat value={formatBytes(stats.thumbnailBytes)} label="Thumbs" />
        </div>

        {storage.supported ? (
          <p className="mt-3 text-[10px] leading-relaxed opacity-60">
            本应用整体占用约 {formatBytes(storage.usage)}，浏览器给的额度约 {formatBytes(storage.quota)}。
          </p>
        ) : null}

        {overThreshold ? (
          <p className="mt-2 text-[10px] leading-relaxed text-amber-500">
            整体占用已超过 {formatBytes(STORAGE_WARNING_THRESHOLD_BYTES)}。手机上占用太大会变卡，
            甚至被系统清理数据。建议把想留的图保存到设备，并在画廊里删除不要的图。
          </p>
        ) : null}

        <p className="mt-2 text-[10px] leading-relaxed opacity-45">
          备份（导出和 GitHub 备份）只包含生成记录和缩略图，不包含原图，原图请自己保存到设备。
        </p>
      </section>
    </div>
  );
};

const Stat = ({ value, label }) => (
  <div>
    <b className="block font-serif text-2xl font-normal leading-none">{value}</b>
    <span className="text-[9px] uppercase tracking-[0.18em] opacity-50">{label}</span>
  </div>
);

export default GeneratePanel;