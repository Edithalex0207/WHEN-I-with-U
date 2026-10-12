import React, { useState } from 'react';
import { Check, ImageIcon } from 'lucide-react';

const PRESET_ICONS = [
  { url: 'https://u2.fukit.cn/sT35T3Lxu', label: '浅色版' },
  { url: 'https://u2.fukit.cn/yM34PbfKB', label: '蓝色版' },
  { url: 'https://u2.fukit.cn/7dx2qbsOx', label: '银色版' },
  { url: 'https://u2.fukit.cn/Virddi9R6', label: '紫色版' },
  { url: 'https://u2.fukit.cn/MISS5gNdE', label: '紫色版2' },
  { url: 'https://u2.fukit.cn/4jN4PyW5c', label: '金属' },
  { url: 'https://u2.fukit.cn/H6FM3n8qf', label: '涂鸦版' },
  { url: 'https://u2.fukit.cn/vi4ZK7f7t', label: '涂鸦版2' },
  { url: 'https://u2.fukit.cn/cerzbXmOR', label: '万圣节版1' },
  { url: 'https://u2.fukit.cn/decElgZJw', label: '万圣节版3' },
  { url: 'https://u2.fukit.cn/ZYmw9r9II', label: '万圣节版2' },

];
export const PwaIconSettings = ({ value = '', onChange }) => {
  const [customUrl, setCustomUrl] = useState(
    value && !PRESET_ICONS.some((p) => p.url === value) ? value : '',
  );
  const [applyHint, setApplyHint] = useState(false);

  const isPreset = PRESET_ICONS.some((p) => p.url === value);
  const isCustomActive =
    value && !isPreset;

  const selectIcon = (url) => {
    onChange(url);
    setApplyHint(true);
    setTimeout(() => setApplyHint(false), 5000);
  };

  const handleApplyCustom = () => {
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    selectIcon(trimmed);
  };

  const handleClear = () => {
    onChange('');
    setCustomUrl('');
    setApplyHint(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">PWA 桌面图标</p>
        <p className="mt-1 text-[10px] leading-relaxed opacity-50">
          自定义安装到桌面后的应用图标。更换图标后桌面会在后台自动刷新，通常无需重新安装。
        </p>
      </div>

      {/* 预设图标网格 */}
      <div>
        <p className="mb-2 text-[11px] font-medium opacity-60">选择预设图标</p>
        <div className="grid grid-cols-4 gap-2">
          {PRESET_ICONS.map((preset) => {
            const active = value === preset.url;
            return (
              <button
                key={preset.url}
                type="button"
                onClick={() => selectIcon(preset.url)}
                className="group relative flex flex-col items-center gap-1.5 rounded-2xl p-2 transition-all active:scale-95"
                style={{
                  background: active
                    ? 'color-mix(in srgb, var(--text-main) 10%, transparent)'
                    : 'var(--control-soft-bg)',
                  outline: active ? '2px solid var(--text-main)' : '2px solid transparent',
                  outlineOffset: '1px',
                }}
              >
                <div className="relative">
                  <img
                    src={preset.url}
                    alt={preset.label}
                    className="h-14 w-14 rounded-[18px] object-cover shadow-sm"
                    loading="lazy"
                    decoding="async"
                  />
                  {active && (
                    <div
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full shadow-sm"
                      style={{ background: 'var(--text-main)', color: 'var(--bg-main)' }}
                    >
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <span className="text-[9px] leading-tight opacity-60">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 自定义 URL */}
      <div>
        <p className="mb-2 text-[11px] font-medium opacity-60">或输入图床链接</p>
        <div className="flex gap-2">
          <input
            type="url"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleApplyCustom()}
            placeholder="https://…"
            className="flex-1 rounded-xl border px-3.5 py-2.5 text-xs outline-none transition-colors focus:border-current"
            style={{
              background: 'var(--control-soft-bg)',
              borderColor: isCustomActive
                ? 'var(--text-main)'
                : 'var(--border-subtle, rgba(0,0,0,0.1))',
              color: 'var(--text-main)',
            }}
          />
          <button
            type="button"
            onClick={handleApplyCustom}
            disabled={!customUrl.trim()}
            className="rounded-xl px-4 py-2.5 text-xs font-semibold transition-transform active:scale-[0.97] disabled:opacity-40"
            style={{ background: 'var(--text-main)', color: 'var(--bg-main)' }}
          >
            应用
          </button>
        </div>
      </div>

      {/* 当前图标预览 */}
      {value ? (
        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{ background: 'var(--control-soft-bg)' }}
        >
          <img
            src={value}
            alt="当前图标"
            className="h-12 w-12 rounded-[14px] object-cover shadow-sm"
            loading="lazy"
            decoding="async"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium opacity-80">
              {PRESET_ICONS.find((p) => p.url === value)?.label ?? '自定义图标'}
            </p>
            {isCustomActive && (
              <p className="mt-0.5 truncate text-[9px] opacity-40" title={value}>
                {value}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 rounded-full px-2.5 py-1 text-[10px] opacity-50 transition-opacity hover:opacity-80 active:scale-95"
            style={{ background: 'color-mix(in srgb, var(--text-main) 8%, transparent)' }}
          >
            移除
          </button>
        </div>
      ) : (
        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{ background: 'var(--control-soft-bg)', color: 'var(--text-muted)' }}
        >
          <ImageIcon className="h-5 w-5 opacity-30" />
          <p className="text-[11px] opacity-50">使用应用默认图标</p>
        </div>
      )}

      {/* 应用后提示 */}
      {applyHint && (
        <div
          className="rounded-xl px-3.5 py-3 text-[10px] leading-relaxed"
          style={{
            background: 'color-mix(in srgb, var(--text-main) 6%, transparent)',
            color: 'var(--text-sub)',
          }}
        >
          <p className="font-medium">图标已更新，记得点页面底部的「保存配置」。</p>
          <p className="mt-1 opacity-70">
            桌面图标通常会在数小时内自动刷新。<br />
            如需立刻看到新图标，可以在浏览器里重新「添加到主屏幕」——
            <span className="font-medium text-rose-500/80"> 注意 iOS 上卸载 PWA 会删除本地数据，重装前请先做好备份。</span>
          </p>
        </div>
      )}

      <p className="text-[10px] leading-relaxed opacity-35">
        图标链接保存在本地，不会上传到服务器。
      </p>
    </div>
  );
};

export default PwaIconSettings;