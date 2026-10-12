// src/apps/imagestudio/GeneratePanel.jsx
//
// 生图室「生成」页：选聊天（可不关联）-> 写想画的内容 -> 生成 -> 看结果、保存到设备。
// 选了聊天就能带上该角色的外貌和该聊天里的用户外貌（在「外貌」页填写）。
// 生成的图会自动存进数据库（画廊在后续轮次开放）。
//
// 这一版没有"AI 分析聊天内容写提示词"，那一块留到聊天室里的生图一起设计。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Download, ExternalLink } from 'lucide-react';

import db from '../../db';
import {
  STORAGE_WARNING_THRESHOLD_BYTES,
  formatBytes,
  getStorageUsageBytes,
} from '../../db/storageUtils';
import { getImageGenConfig } from './imageGenConfigService';
import { buildImageFileName, saveBlobToDevice } from './imageGenMedia';
import { buildGenerationPrompts, getMissingConfigItems } from './imageGenRequest';
import { loadPromptSources } from './imageGenRunner';
import { ensureNotifyPermission, getNotifySettings } from './imageGenNotify';
import { dismissImageGenResult, startImageGeneration, useImageGenJob } from './imageGenJobStore';
import { BACKEND_NOVELAI } from './imageGenRules';
import { getGenerationStats } from './imageGenerationService';
import {
  Field,
  SectionCard,
  SelectInput,
  StudioSectionHead,
  TextArea,
} from './StudioFormParts';

const NO_CHAT = '';

const GeneratePanel = ({ onGoSettings }) => {
  const [config, setConfig] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [chats, setChats] = useState([]);

  const [chatIdText, setChatIdText] = useState(NO_CHAT);
  const [includeCharacter, setIncludeCharacter] = useState(true);
  const [includeUser, setIncludeUser] = useState(false);
  const [scene, setScene] = useState('');

  const [sources, setSources] = useState({
    characterAppearance: '',
    userAppearance: '',
    artistTags: '',
  });

  // 生成任务的状态放在模块级 store 里（imageGenJobStore），切 tab / 离开页面都不会丢。
  const job = useImageGenJob();
  const busy = job.status === 'running';
  const outcome = job.outcome;
  const errorText = job.errorText;
  const [imageUrl, setImageUrl] = useState('');
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
        const [loadedConfig, characterList, chatList] = await Promise.all([
          getImageGenConfig(),
          db.characters.toArray(),
          db.chats.toArray(),
        ]);

        if (cancelled) return;
        setConfig(loadedConfig);
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
    if (job.doneSeq > 0) void refreshStats();
  }, [job.doneSeq, refreshStats]);

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

  // 结果图的临时地址：换图或离开页面时释放，避免内存一直被占着。
  useEffect(() => {
    if (!outcome?.blob) {
      setImageUrl(outcome?.remoteUrl || '');
      return undefined;
    }

    const url = URL.createObjectURL(outcome.blob);
    setImageUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [outcome]);

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

  const handleGenerate = () => {
    if (busy) return;

    setSaveMessage('');

    // 点「开始作画」是用户手势，趁这时申请系统通知权限（已决定过的不会再弹）。
    if (getNotifySettings().notify) void ensureNotifyPermission();

    startImageGeneration({
      sceneText: scene,
      chatId,
      characterId,
      includeCharacterAppearance: includeCharacter,
      includeUserAppearance: includeUser,
    });
  };

  const handleSave = async () => {
    if (!outcome?.blob) return;

    const how = await saveBlobToDevice(outcome.blob, buildImageFileName(outcome.blob));

    if (how === 'shared') setSaveMessage('已调起系统分享面板，选「存储图像」就能存进相册。');
    else if (how === 'downloaded') setSaveMessage('已开始下载，请在浏览器的下载列表里查看。');
    else setSaveMessage('');
  };

  if (!config) {
    return <p className="py-10 text-center text-xs opacity-50">读取中...</p>;
  }

  const missing = getMissingConfigItems(config);
  const isNovelAi = config.backend === BACKEND_NOVELAI;
  const prompts = buildGenerationPrompts({ config, sceneText: scene, ...sources });
  const overThreshold = storage.supported && storage.usage >= STORAGE_WARNING_THRESHOLD_BYTES;
  const coverState = busy ? 'waiting' : outcome ? 'done' : 'idle';

  const chipStyle = (on) => ({
    backgroundColor: on ? 'var(--accent-color)' : 'transparent',
    color: on ? 'var(--accent-foreground)' : 'var(--text-sub)',
    borderColor: on ? 'var(--accent-color)' : 'var(--divider)',
  });

  return (
    <div className="space-y-6">
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
          no="01"
          title="想画什么"
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
            disabled={busy || !scene.trim() || missing.length > 0}
            className="flex w-full items-center justify-between rounded-full py-1.5 pl-5 pr-1.5 text-xs font-semibold shadow-md transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-foreground)' }}
          >
            <span>{busy ? '作画中…（切换页面也不会中断）' : '开始作画'}</span>
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: 'var(--accent-foreground)', color: 'var(--accent-color)' }}
            >
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>

          {errorText ? (
            <p className="text-[11px] leading-relaxed text-rose-500">{errorText}</p>
          ) : null}
        </SectionCard>
      </section>

      <section>
        <StudioSectionHead no="02" title="本期封面" />
        <div
          className="relative overflow-hidden rounded-[28px] border shadow-lg"
          style={{
            aspectRatio: '4 / 5',
            borderColor: 'var(--card-border)',
            backgroundColor: 'color-mix(in srgb, var(--card-bg) 60%, transparent)',
          }}
        >
          {coverState === 'done' && imageUrl ? (
            <img src={imageUrl} alt="生成的图片" className="h-full w-full object-cover animate-fade-in" />
          ) : null}

          {coverState === 'done' && !imageUrl ? (
            <div className="flex h-full items-center justify-center text-xs opacity-60">
              没有拿到可显示的图片。
            </div>
          ) : null}

          {coverState === 'waiting' ? (
            <div className="flex h-full animate-pulse flex-col items-center justify-center gap-1.5">
              <span className="font-serif text-sm italic">正在晕染…</span>
              <span className="text-[9px] uppercase tracking-[0.18em] opacity-50">
                可以去别处逛逛，画好了会提醒你
              </span>
            </div>
          ) : null}

          {coverState === 'idle' ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 opacity-45">
              <span className="font-serif text-sm italic">尚无新作</span>
              <span className="text-[9px] uppercase tracking-[0.18em]">等你落笔</span>
            </div>
          ) : null}
        </div>

        {outcome ? (
          <div className="mt-3 space-y-2">
            {outcome.adjustments.length > 0 ? (
              <p className="text-[10px] leading-relaxed text-amber-500">
                「允许消耗 Anlas」是关闭的，本次已按免费范围调整：{outcome.adjustments.join('；')}。
              </p>
            ) : null}

            {outcome.saveError ? (
              <p className="text-[11px] leading-relaxed text-rose-500">{outcome.saveError}</p>
            ) : null}

            {outcome.remoteUrl && !outcome.blob ? (
              <p className="text-[10px] leading-relaxed opacity-60">
                这张图只拿到了外部链接（没能下载到本机），链接失效后就看不到了，建议尽快打开保存。
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-5 text-xs">
              {outcome.blob ? (
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center gap-1 border-b pb-0.5"
                  style={{ borderColor: 'var(--text-main)' }}
                >
                  <Download className="h-3.5 w-3.5" /> 保存到设备
                </button>
              ) : null}

              {outcome.remoteUrl ? (
                <a
                  href={outcome.remoteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 border-b pb-0.5"
                  style={{ borderColor: 'var(--text-main)' }}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> 打开原链接
                </a>
              ) : null}

              <button
                type="button"
                onClick={dismissImageGenResult}
                className="ml-auto text-[10px] opacity-50"
              >
                清除
              </button>
            </div>

            {saveMessage ? <p className="text-[10px] opacity-60">{saveMessage}</p> : null}
          </div>
        ) : null}
      </section>

      <section>
        <StudioSectionHead no="03" title="收藏概览" />
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