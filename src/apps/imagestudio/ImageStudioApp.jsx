// src/apps/imagestudio/ImageStudioApp.jsx
//
// 生图室（Image Studio）顶层 app。
//   - 切片A：数据模型 + 设置 + 画师串 + 外貌锁定。
//   - 切片B：打通真实生图（第三方接口 + NovelAI），「生成」页上线。
//   - 切片C：「画廊」页（重 roll / 打包下载 / 保存到相册 / 删除）。
//   - 切片D：聊天里 AI 用 [AI_IMAGE: ...] 标签触发生图。
//   - 画廊化改版：「生成」页改成「展厅」，成品图挂在最上面的展墙，支持同时多张作画。
//
// 版面（杂志风）：主页面有「展厅」「画廊」「画师串」，用底部悬浮 dock 切换；
// 画师串单独成一页；外貌 / 设置收进 dock 右侧「更多」，以底部弹窗的形式打开。
// 「生成」页始终保持挂载（只是隐藏），所以切 tab 不会丢输入内容；
// 生成任务本身跑在 imageGenJobStore（模块级），也不依赖任何组件是否挂载。
//
// 这不是聊天室类 app，所以不接收也不调用 onChatRoomStateChange，
// 只需要一个返回首页的回调（跟 DiaryApp 一样）。

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Images, MoreHorizontal, Palette, Sparkles, Wand2, X } from 'lucide-react';

import GalleryPanel from './GalleryPanel';
import GeneratePanel from './GeneratePanel';
import ImageStudioSettingsPanel from './ImageStudioSettingsPanel';
import NotifySettingsSection from './NotifySettingsSection';
import ArtistTagPanel from './ArtistTagPanel';
import AppearancePanel from './AppearancePanel';
import PromptComposerPanel from './PromptComposerPanel';
import { countRunningJobs, useImageGenJobs } from './imageGenJobStore';

const PAGES = {
  // compact：展厅页不放大标题，让成品图直接出现在最上面。
  generate: { kicker: 'No.01 — Create', title: '为 TA 画一幅', deck: '把此刻的心情，慢慢洇成一张画。', compact: true },
  gallery: { kicker: 'No.02 — Archive', title: '你的画廊', deck: '按时间排开，每一张都是某个瞬间。' },
  artist: { kicker: 'No.03 — Style', title: '画师串', deck: '像索引卡一样收着，每张都能写备注。' },
  compose: { kicker: 'No.04 — AI Draft', title: 'AI 拼词', deck: '说一句想要的画面，剩下的交给 AI 拼。' },
};

const SHEETS = {
  appearance: { kicker: 'No.05 — Looks', title: '外貌', no: '01' },
  settings: { kicker: 'No.06 — Setup', title: '设置', no: '02' },
};

const formatElapsed = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const serifStyle = { fontFamily: "'Cormorant Garamond', 'Noto Serif SC', Georgia, serif" };

const GlassStyle = {
  backgroundColor: 'color-mix(in srgb, var(--card-bg) 78%, transparent)',
  borderColor: 'var(--card-border)',
  backdropFilter: 'blur(24px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
  boxShadow: 'var(--card-shadow)',
};

const ImageStudioApp = ({ onBackHub }) => {
  // 有设置缺项时默认先落在「生成」页，由页面里的提示引导去设置。
  const [page, setPage] = useState('generate');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [seenDoneSeq, setSeenDoneSeq] = useState(0);
  const [now, setNow] = useState(Date.now());

  const jobState = useImageGenJobs();
  const runningCount = countRunningJobs(jobState);
  const running = runningCount > 0;
  const earliestStart = jobState.jobs
    .filter((item) => item.status === 'pending')
    .reduce((min, item) => Math.min(min, item.startedAt), Infinity);

  // 生成中每秒刷新一次计时。
  useEffect(() => {
    if (!running) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  // 在「画廊」页时看过新图就算已读；不在画廊页则 dock 上亮小红点。
  useEffect(() => {
    if (page === 'gallery') setSeenDoneSeq(jobState.doneSeq);
  }, [page, jobState.doneSeq]);

  useEffect(() => {
    if (!sheet && !menuOpen) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setSheet(null);
      setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, menuOpen]);

  const galleryDot = page !== 'gallery' && jobState.doneSeq > seenDoneSeq;
  const meta = PAGES[page];

  const openSheet = (id) => {
    setMenuOpen(false);
    setSheet(id);
  };

  const goSettings = () => openSheet('settings');

  const dockButton = (id, label, Icon) => {
    const active = page === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          setMenuOpen(false);
          setPage(id);
        }}
        className="relative flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold transition-all duration-300"
        style={{
          backgroundColor: active ? 'var(--accent-color)' : 'transparent',
          color: active ? 'var(--accent-foreground)' : 'var(--text-sub)',
        }}
        aria-label={label}
      >
        <Icon className="h-4 w-4" />
        {active ? <span>{label}</span> : null}
        {id === 'gallery' && galleryDot ? (
          <i
            className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-rose-500"
            style={{ boxShadow: '0 0 0 2px var(--bg-main)' }}
          />
        ) : null}
      </button>
    );
  };

  return (
    <div className="relative animate-fade-in pb-32" style={{ color: 'var(--text-main)' }}>
      {/* 弥散背景：几团缓慢漂移的模糊色块，颜色取自当前主题 */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -right-24 -top-16 h-72 w-72 rounded-full opacity-80"
          style={{ background: 'var(--bg-blob-1)', filter: 'blur(60px)' }}
        />
        <div
          className="absolute -left-28 top-1/3 h-64 w-64 rounded-full opacity-70"
          style={{ background: 'var(--bg-blob-2)', filter: 'blur(60px)' }}
        />
        <div
          className="absolute -bottom-16 -right-16 h-60 w-60 rounded-full opacity-60"
          style={{ background: 'var(--bg-blob-3)', filter: 'blur(60px)' }}
        />
      </div>

      {/* 刊头 */}
      <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.18em] opacity-60">
        <button type="button" onClick={onBackHub} className="flex items-center gap-1 py-1">
          <ArrowLeft className="h-3.5 w-3.5" /> 主页
        </button>
        <span>Studio · 生图室</span>
      </div>

      {meta.compact ? (
        <div className="mb-3 mt-2" />
      ) : (
        <div className="mb-5 mt-4">
          <p className="mb-1.5 text-[9.5px] uppercase tracking-[0.18em] opacity-50">{meta.kicker}</p>
          <h1 className="text-[28px] font-medium leading-tight" style={serifStyle}>
            {meta.title}
          </h1>
          <p className="mt-2 max-w-[18rem] text-xs italic leading-relaxed opacity-70" style={serifStyle}>
            {meta.deck}
          </p>
          <hr className="mt-4 border-0 border-t" style={{ borderColor: 'var(--divider)' }} />
        </div>
      )}

      {/* 「生成」页一直挂载，只是切走时隐藏，保住输入内容 */}
      <div className={page === 'generate' ? 'block' : 'hidden'}>
        <GeneratePanel onGoSettings={goSettings} />
      </div>
      {page === 'artist' ? <ArtistTagPanel /> : null}
      {page === 'compose' ? <PromptComposerPanel /> : null}
      {page === 'gallery' ? <GalleryPanel onGoSettings={goSettings} refreshSignal={jobState.doneSeq} /> : null}

      {/* 生成中悬浮胶囊：在展厅以外的页面都看得到（展厅里画框上就有计时） */}
      {running && page !== 'generate' ? (
        <div
          className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full border py-2 pl-3 pr-4 text-xs"
          style={GlassStyle}
        >
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'var(--accent-color)', borderTopColor: 'transparent' }}
          />
          <span style={serifStyle} className="text-sm">
            {runningCount > 1 ? `正在作画 · ${runningCount} 张` : '正在作画'}
          </span>
          <span className="tabular-nums opacity-60">{formatElapsed(now - earliestStart)}</span>
        </div>
      ) : null}

      {/* 「更多」菜单 */}
      {menuOpen ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} role="presentation" />
          <div
            className="fixed bottom-24 right-5 z-50 flex min-w-[9.5rem] flex-col rounded-3xl border p-1.5"
            style={GlassStyle}
          >
            {Object.entries(SHEETS).map(([id, item]) => (
              <button
                key={id}
                type="button"
                onClick={() => openSheet(id)}
                className="flex items-baseline gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-black/5"
              >
                <span className="text-[8.5px] uppercase tracking-[0.18em] opacity-50">{item.no}</span>
                <span style={serifStyle}>{item.title}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* 底部悬浮 dock */}
      <nav
        className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-full border p-1.5"
        style={GlassStyle}
      >
        {dockButton('generate', '展厅', Sparkles)}
        {dockButton('gallery', '画廊', Images)}
        {dockButton('artist', '画师串', Palette)}
        {dockButton('compose', 'AI拼词', Wand2)}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex items-center rounded-full px-4 py-2.5 transition-all"
          style={{
            backgroundColor: menuOpen ? 'var(--accent-color)' : 'transparent',
            color: menuOpen ? 'var(--accent-foreground)' : 'var(--text-sub)',
          }}
          aria-label="更多"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </nav>

      {/* 外貌 / 设置：底部弹窗 */}
      {sheet ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center p-3"
          style={{ backgroundColor: 'rgba(10,10,14,0.3)', backdropFilter: 'blur(6px)' }}
          onClick={() => setSheet(null)}
          role="presentation"
        >
          <div
            className="max-h-[78vh] w-full max-w-md overflow-y-auto rounded-[28px] border p-4"
            style={{ ...GlassStyle, backgroundColor: 'color-mix(in srgb, var(--card-bg) 90%, transparent)' }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="text-[8.5px] uppercase tracking-[0.18em] opacity-50">
                  {SHEETS[sheet].kicker}
                </p>
                <h3 className="mt-1 text-[17px] font-medium" style={serifStyle}>
                  {SHEETS[sheet].title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSheet(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full border"
                style={{ borderColor: 'var(--divider)' }}
                aria-label="关闭"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-4">
              {sheet === 'appearance' ? <AppearancePanel /> : null}
              {sheet === 'settings' ? (
                <>
                  <NotifySettingsSection />
                  <ImageStudioSettingsPanel />
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ImageStudioApp;