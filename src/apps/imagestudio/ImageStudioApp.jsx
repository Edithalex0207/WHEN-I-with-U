// src/apps/imagestudio/ImageStudioApp.jsx
//
// 生图室（Image Studio）顶层 app。切片A只做数据模型 + 设置 + 画师串 + 外貌锁定，
// 「生成」和「画廊」两页先放占位说明：
//   - 切片B：打通真实生图（第三方接口 + NovelAI），生成面板上线。
//   - 切片C：画廊（重 roll / 打包下载 / 删除）。
//   - 切片D：聊天里 AI 用 [AI_IMAGE: ...] 标签触发生图。
//
// 这不是聊天室类 app，所以不接收也不调用 onChatRoomStateChange，
// 只需要一个返回首页的回调（跟 DiaryApp 一样）。

import React, { useState } from 'react';
import { ArrowLeft, Image as ImageIcon } from 'lucide-react';

import ImageStudioSettingsPanel from './ImageStudioSettingsPanel';
import ArtistTagPanel from './ArtistTagPanel';
import AppearancePanel from './AppearancePanel';

const TABS = [
  { id: 'generate', label: '生成' },
  { id: 'gallery', label: '画廊' },
  { id: 'artist', label: '画师串' },
  { id: 'appearance', label: '外貌' },
  { id: 'settings', label: '设置' },
];

const PLACEHOLDER_TEXT = {
  generate:
    '生成面板会在下一轮开放。现在可以先在「设置」里填好生图后端，在「画师串」和「外貌」里把素材准备好。',
  gallery: '画廊会在后续轮次开放，届时支持重 roll、打包下载和删除。',
};

const ComingSoonPanel = ({ text }) => (
  <div
    className="rounded-3xl border px-6 py-14 text-center"
    style={{
      backgroundColor: 'var(--card-bg)',
      borderColor: 'var(--card-border)',
      color: 'var(--text-main)',
    }}
  >
    <ImageIcon className="mx-auto mb-3 h-8 w-8 opacity-40" />
    <p className="text-xs leading-relaxed opacity-60">{text}</p>
  </div>
);

const ImageStudioApp = ({ onBackHub }) => {
  const [activeTab, setActiveTab] = useState('settings');

  return (
    <div className="animate-fade-in space-y-4 pb-12">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBackHub}
          className="flex items-center gap-1 text-xs font-semibold opacity-70 hover:opacity-100"
          style={{ color: 'var(--text-main)' }}
        >
          <ArrowLeft className="h-4 w-4" /> 返回主页
        </button>
        <h2
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: 'var(--text-main)' }}
        >
          Studio • 生图室
        </h2>
        <span className="w-16" aria-hidden="true" />
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="rounded-xl border px-1 py-2 text-xs font-semibold transition-all"
              style={{
                backgroundColor: active ? 'var(--accent-color)' : 'var(--card-bg)',
                color: active ? 'var(--accent-foreground)' : 'var(--text-main)',
                borderColor: 'var(--card-border)',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'generate' || activeTab === 'gallery' ? (
        <ComingSoonPanel text={PLACEHOLDER_TEXT[activeTab]} />
      ) : null}
      {activeTab === 'artist' ? <ArtistTagPanel /> : null}
      {activeTab === 'appearance' ? <AppearancePanel /> : null}
      {activeTab === 'settings' ? <ImageStudioSettingsPanel /> : null}
    </div>
  );
};

export default ImageStudioApp;