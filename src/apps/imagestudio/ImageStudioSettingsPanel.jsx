// src/apps/imagestudio/ImageStudioSettingsPanel.jsx
//
// 生图室「设置」页：后端选择、跨域 Worker、第三方接口、NovelAI 全部参数。
// 配置整份存在 db.settings 的 imageGenConfig（见 imageGenConfigService.js）。
//
// 保存方式：文本框输入时只改本地状态，失焦才存库；下拉、开关、按钮点一下立刻存库。
// 当前配置同时放在 state（驱动渲染）和 ref（保证连续操作时拿到的永远是最新值，
// 不会因为 React 状态还没刷新而用旧快照覆盖）。
//
// 固定正面前缀和负面提示词已经挪到「展厅」页的折叠区里编辑（同一份配置，改哪边都行），
// 这里不再重复放。保存配置后会广播给展厅页，切换后端不需要退出生图室。

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { getImageGenConfig, saveImageGenConfig } from './imageGenConfigService';
import { getCachedAnlas, refreshAnlas } from './novelAiBalanceService';
import {
  AI_IMAGE_MODE_AUTO,
  AI_IMAGE_MODE_CONFIRM,
  BACKEND_NOVELAI,
  BACKEND_THIRD_PARTY,
  FREE_MAX_PIXELS,
  FREE_MAX_STEPS,
  NOVELAI_MODELS,
  NOVELAI_NOISE_SCHEDULES,
  NOVELAI_SAMPLERS,
  NOVELAI_SIZE_PRESETS,
  NOVELAI_UC_PRESETS,
  THIRD_PARTY_SIZE_SUGGESTIONS,
  clampNovelAiParams,
  snapTo64,
} from './imageGenRules';
import {
  Field,
  NumberField,
  SectionCard,
  SegmentedButtons,
  SelectInput,
  TextArea,
  TextInput,
  ToggleRow,
} from './StudioFormParts';

const CUSTOM_MODEL_OPTION = '__custom__';

const ImageStudioSettingsPanel = () => {
  const [config, setConfig] = useState(null);
  const [customModel, setCustomModel] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [anlas, setAnlas] = useState(() => getCachedAnlas());
  const [anlasBusy, setAnlasBusy] = useState(false);
  const [anlasError, setAnlasError] = useState('');

  const configRef = useRef(null);
  const flashTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    getImageGenConfig().then((loaded) => {
      if (cancelled) return;
      configRef.current = loaded;
      setConfig(loaded);
    });

    return () => {
      cancelled = true;
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  const flashStatus = useCallback((status) => {
    setSaveStatus(status);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setSaveStatus('idle'), 1600);
  }, []);

  const persist = useCallback(async () => {
    if (!configRef.current) return;

    try {
      await saveImageGenConfig(configRef.current);
      flashStatus('saved');
    } catch (error) {
      console.warn('[ImageStudio] 保存生图配置失败：', error);
      flashStatus('error');
    }
  }, [flashStatus]);

  const handleRefreshAnlas = async () => {
    if (anlasBusy) return;

    // 先把输入框里还没失焦保存的 Token / 代理地址存下来，再用最新配置去查。
    await persist();

    setAnlasBusy(true);
    setAnlasError('');

    try {
      setAnlas(await refreshAnlas());
    } catch (error) {
      setAnlasError(error?.message || '查询失败，请稍后再试。');
    } finally {
      setAnlasBusy(false);
    }
  };

  const change = useCallback((mutator) => {
    if (!configRef.current) return;
    const next = mutator(configRef.current);
    configRef.current = next;
    setConfig(next);
  }, []);

  const setTop = (field) => (value) =>
    change((current) => ({ ...current, [field]: value }));

  const setThird = (field) => (value) =>
    change((current) => ({
      ...current,
      thirdParty: { ...current.thirdParty, [field]: value },
    }));

  const setNai = (field) => (value) =>
    change((current) => ({
      ...current,
      novelai: { ...current.novelai, [field]: value },
    }));

  // 下拉 / 开关 / 按钮：改完立刻存。
  const withSave = (setter) => (value) => {
    setter(value);
    void persist();
  };

  if (!config) {
    return <p className="py-10 text-center text-xs opacity-50">读取配置中...</p>;
  }

  const nai = config.novelai;
  const third = config.thirdParty;
  const isKnownModel = NOVELAI_MODELS.some((item) => item.value === nai.model);
  const showCustomModelInput = customModel || !isKnownModel;
  const modelSelectValue = showCustomModelInput ? CUSTOM_MODEL_OPTION : nai.model;
  const clamp = clampNovelAiParams(nai, nai.allowAnlas);

  const statusText =
    saveStatus === 'saved' ? '已保存' : saveStatus === 'error' ? '保存失败，请重试' : '';

  return (
    <div className="space-y-4">
      <div className="h-4 text-right text-[10px] opacity-60" aria-live="polite">
        {statusText}
      </div>

      <SectionCard
        title="当前使用的后端"
        subtitle="全局只启用一个。聊天里的生图和生图室里的生成都会用这里选中的后端。"
      >
        <SegmentedButtons
          value={config.backend}
          onChange={withSave(setTop('backend'))}
          options={[
            { value: BACKEND_THIRD_PARTY, label: '第三方接口' },
            { value: BACKEND_NOVELAI, label: 'NovelAI' },
          ]}
        />
      </SectionCard>

      <SectionCard title="通用">
        <Field
          label="跨域代理 Worker 地址（可选）"
          hint="目前只用于 NovelAI。留空表示浏览器直连，可能被跨域限制拦住。填写后，请求会发到这个地址，而不是 https://image.novelai.net，路径和 Authorization 头原样转发。"
        >
          <TextInput
            value={config.corsProxyUrl}
            onChange={setTop('corsProxyUrl')}
            onBlur={persist}
            placeholder="https://your-worker.example.workers.dev"
          />
        </Field>

        <Field
          label="聊天里 AI 决定生图时"
          hint="自动：AI 在回复里写了生图标签就直接生成。先确认：先显示一张占位卡片，点一下才真正生成。"
        >
          <SelectInput
            value={config.aiImageMode}
            onChange={withSave(setTop('aiImageMode'))}
            options={[
              { value: AI_IMAGE_MODE_AUTO, label: '自动生成' },
              { value: AI_IMAGE_MODE_CONFIRM, label: '先确认再生成' },
            ]}
          />
        </Field>
      </SectionCard>

      <SectionCard
        title={config.backend === BACKEND_THIRD_PARTY ? '第三方接口（当前使用）' : '第三方接口'}
        subtitle="兼容 OpenAI images/generations 格式：POST {接口地址}/images/generations。"
        dimmed={config.backend !== BACKEND_THIRD_PARTY}
      >
        <Field label="接口地址（Base URL）">
          <TextInput
            value={third.baseUrl}
            onChange={setThird('baseUrl')}
            onBlur={persist}
            placeholder="https://api.example.com/v1"
          />
        </Field>

        <Field label="API Key">
          <TextInput
            type="password"
            value={third.apiKey}
            onChange={setThird('apiKey')}
            onBlur={persist}
            placeholder="sk-..."
          />
        </Field>

        <Field label="模型">
          <TextInput
            value={third.model}
            onChange={setThird('model')}
            onBlur={persist}
            placeholder="例如 dall-e-3"
          />
        </Field>

        <Field label="图片尺寸" hint="格式为 宽x高，具体可用的尺寸取决于你用的服务。">
          <TextInput
            value={third.size}
            onChange={setThird('size')}
            onBlur={persist}
            placeholder="1024x1024"
            list="image-studio-size-suggestions"
          />
          <datalist id="image-studio-size-suggestions">
            {THIRD_PARTY_SIZE_SUGGESTIONS.map((size) => (
              <option key={size} value={size} />
            ))}
          </datalist>
        </Field>
      </SectionCard>

      <SectionCard
        title={config.backend === BACKEND_NOVELAI ? 'NovelAI（当前使用）' : 'NovelAI'}
        subtitle="需要 NovelAI 的持久 API Token（pst- 开头）。"
        dimmed={config.backend !== BACKEND_NOVELAI}
      >
        <Field label="API Token">
          <TextInput
            type="password"
            value={nai.token}
            onChange={setNai('token')}
            onBlur={persist}
            placeholder="pst-..."
          />
        </Field>

        <Field
          label="账户余额"
          hint="手动点击才会查询，不会每次打开设置页自动请求。余额接口在 api.novelai.net；如果用了跨域代理 Worker，需要它也转发 /user/ 开头的请求。"
        >
          <div
            className="flex items-center gap-3 rounded-2xl border p-3"
            style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--bg-surface)' }}
          >
            <div>
              <b className="block font-serif text-2xl font-semibold leading-none tabular-nums">
                {anlas ? anlas.total.toLocaleString('en-US') : '--'}
              </b>
              <span className="text-[9px] uppercase tracking-[0.16em] opacity-50">Anlas 剩余</span>
            </div>
            <button
              type="button"
              onClick={handleRefreshAnlas}
              disabled={anlasBusy || !nai.token}
              className="ml-auto whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40"
              style={{ borderColor: 'var(--divider)' }}
            >
              {anlasBusy ? '查询中...' : '刷新余额'}
            </button>
          </div>
          {anlas ? (
            <span className="mt-1 block text-[10px] opacity-50">
              上次刷新：{new Date(anlas.at).toLocaleString('zh-CN', { hour12: false })}
              {anlas.purchased > 0 ? `（其中购买的 ${anlas.purchased.toLocaleString('en-US')}）` : ''}
            </span>
          ) : null}
          {anlasError ? (
            <span className="mt-1 block text-[11px] leading-relaxed text-rose-500">{anlasError}</span>
          ) : null}
        </Field>

        <Field label="模型" hint="下拉里没有的模型可以选「自定义」后直接填写模型 id。">
          <SelectInput
            value={modelSelectValue}
            onChange={(value) => {
              if (value === CUSTOM_MODEL_OPTION) {
                setCustomModel(true);
                return;
              }
              setCustomModel(false);
              withSave(setNai('model'))(value);
            }}
            options={[
              ...NOVELAI_MODELS,
              { value: CUSTOM_MODEL_OPTION, label: '自定义...' },
            ]}
          />
          {showCustomModelInput ? (
            <div className="mt-2">
              <TextInput
                value={nai.model}
                onChange={setNai('model')}
                onBlur={persist}
                placeholder="例如 nai-diffusion-4-5-full"
              />
            </div>
          ) : null}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="采样器">
            <SelectInput
              value={nai.sampler}
              onChange={withSave(setNai('sampler'))}
              options={NOVELAI_SAMPLERS}
            />
          </Field>
          <Field label="噪声调度">
            <SelectInput
              value={nai.noiseSchedule}
              onChange={withSave(setNai('noiseSchedule'))}
              options={NOVELAI_NOISE_SCHEDULES}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="步数（steps）">
            <NumberField
              value={nai.steps}
              integer
              min={1}
              onCommit={withSave(setNai('steps'))}
            />
          </Field>
          <Field label="提示词引导（scale）">
            <NumberField value={nai.scale} min={0} onCommit={withSave(setNai('scale'))} />
          </Field>
          <Field label="CFG Rescale（0 到 1）">
            <NumberField
              value={nai.cfgRescale}
              min={0}
              max={1}
              onCommit={withSave(setNai('cfgRescale'))}
            />
          </Field>
          <Field label="UC 预设" hint="官方没有公开各编号的含义，按你的实际效果选。">
            <SelectInput
              value={nai.ucPreset}
              onChange={(value) => withSave(setNai('ucPreset'))(Number(value))}
              options={NOVELAI_UC_PRESETS}
            />
          </Field>
        </div>

        <Field label="图片尺寸" hint="宽高会自动对齐到 64 的倍数。">
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              value={nai.width}
              integer
              min={64}
              onCommit={(value) => withSave(setNai('width'))(snapTo64(value))}
            />
            <NumberField
              value={nai.height}
              integer
              min={64}
              onCommit={(value) => withSave(setNai('height'))(snapTo64(value))}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {NOVELAI_SIZE_PRESETS.map((preset) => {
              const active = preset.width === nai.width && preset.height === nai.height;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    change((current) => ({
                      ...current,
                      novelai: {
                        ...current.novelai,
                        width: preset.width,
                        height: preset.height,
                      },
                    }));
                    void persist();
                  }}
                  className="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
                  style={{
                    backgroundColor: active ? 'var(--accent-color)' : 'var(--bg-surface)',
                    color: active ? 'var(--accent-foreground)' : 'var(--text-main)',
                    borderColor: 'var(--card-border)',
                  }}
                >
                  {preset.label} {preset.width}x{preset.height}
                </button>
              );
            })}
          </div>
        </Field>

        <div
          className="space-y-2 rounded-2xl border p-3"
          style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--bg-surface)' }}
        >
          <ToggleRow
            label="允许消耗 Anlas"
            hint={`关闭时，生成前会把参数限制在 Opus 免费范围内：1 张图、步数不超过 ${FREE_MAX_STEPS}、宽x高不超过 ${FREE_MAX_PIXELS}。上面填的数值不会被改动，只影响实际发出去的那一次。`}
            checked={nai.allowAnlas}
            onChange={withSave(setNai('allowAnlas'))}
          />

          {clamp.adjustments.length > 0 ? (
            <p className="text-[10px] leading-relaxed text-amber-500">
              按当前设置，生成时会自动调整：{clamp.adjustments.join('；')}。
              打开「允许消耗 Anlas」可取消限制。
            </p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
};

export default ImageStudioSettingsPanel;