// src/apps/messages/chatImageGen/ChatImageGenSettingsSection.jsx
//
// 聊天设置里的"AI自动生图"区块：开关 + 本聊天的生图提示词指导。
// 两个字段都是 chats 表上新增的无索引字段（aiAutoImageGenEnabled /
// aiImageGenPromptGuide），不需要升级 db.version。
// 写法照抄 learningMode/LearningModeSettingsSection.jsx：自己持有状态、
// 自己读写 db.chats，通过 onUpdated 通知外层 ChatSettingsModal 重新拉取
// chat（外层传的就是 onUpdatedUserPersona，它自己会 loadChatData）。
import React, { useState } from 'react';
import { ImagePlus, Images } from 'lucide-react';
import db from '../../../db';
import ChatImageGenGalleryModal from './ChatImageGenGalleryModal';

export const ChatImageGenSettingsSection = ({ chat, onUpdated }) => {
  const [isBusy, setIsBusy] = useState(false);
  const [guideDraft, setGuideDraft] = useState(chat?.aiImageGenPromptGuide || '');
  const [showGallery, setShowGallery] = useState(false);

  const enabled = chat?.aiAutoImageGenEnabled === true;

  const commit = async (fields) => {
    if (!chat?.id || isBusy) return;

    setIsBusy(true);

    try {
      await db.chats.update(chat.id, fields);
      if (onUpdated) onUpdated(fields);
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggle = () => {
    void commit({ aiAutoImageGenEnabled: !enabled });
  };

  const handleGuideBlur = () => {
    const next = guideDraft.trim();
    if (next === (chat?.aiImageGenPromptGuide || '')) return;
    void commit({ aiImageGenPromptGuide: next });
  };

  return (
    <div
      className="space-y-2.5 p-3.5 rounded-2xl border w-full"
      style={{
        background: 'var(--control-soft-bg)',
        borderColor: 'var(--card-border)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold">
          <ImagePlus className="w-3.5 h-3.5" />
          <span>AI自动生图</span>
        </div>
        <span className="font-mono text-[9px] opacity-45">
          CHAT IMAGE GEN
        </span>
      </div>

      <p className="text-[10px] opacity-55 leading-relaxed">
        开启后，角色会自己判断时机，调用「生图室」真的生成一张图片发给你
        ，会自动带上角色和你各自设置的外貌。「设置 →
        生图室」要先配置好后端（填好 Key/模型）这个才会真的生效。没有
        次数限制，NovelAI 后端下会强制使用免费额度，不会花费
        Anlas；如果用的是第三方接口，每次生成都会按它自己的计费方式真实
        扣费，请自行评估开启后的频率和费用。
      </p>

      <button
        type="button"
        onClick={handleToggle}
        disabled={isBusy}
        className="w-full flex items-center justify-between p-2.5 rounded-xl border transition-all active:scale-95"
        style={{
          background: enabled ? 'var(--accent-color)' : 'var(--bg-main)',
          borderColor: enabled ? 'var(--accent-color)' : 'var(--divider)',
          color: enabled ? 'var(--accent-foreground)' : 'var(--text-main)',
        }}
      >
        <span className="text-[12px] font-medium">
          {enabled ? '已开启' : '已关闭'}
        </span>
        <span
          className="block w-9 h-5 rounded-full relative transition-colors"
          style={{
            background: enabled ? 'var(--accent-foreground)' : 'var(--divider)',
            opacity: enabled ? 0.9 : 0.6,
          }}
        >
          <span
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform"
            style={{
              background: enabled ? 'var(--accent-color)' : 'var(--bg-main)',
              transform: enabled ? 'translateX(16px)' : 'translateX(0)',
            }}
          />
        </span>
      </button>

      {enabled && (
        <div>
          <p className="text-[10px] opacity-55 mb-1">
            本聊天的生图提示词指导（可选）
          </p>
          <textarea
            value={guideDraft}
            onChange={(e) => setGuideDraft(e.target.value)}
            onBlur={handleGuideBlur}
            disabled={isBusy}
            rows={3}
            placeholder="比如：画风偏日系手绘、不要出现文字、构图尽量半身……"
            className="w-full p-2 rounded-lg border text-[12px] resize-none"
            style={{
              background: 'var(--bg-main)',
              borderColor: 'var(--divider)',
              color: 'var(--text-main)',
            }}
          />
        </div>
      )}

      {/* 不放进 enabled 分支里——关掉开关之后，之前生成过的图还在，
          仍然要能查看/打包/清空。 */}
      <button
        type="button"
        onClick={() => setShowGallery(true)}
        disabled={!chat?.id}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl border py-2 text-[11px] font-medium active:scale-95 disabled:opacity-30"
        style={{ borderColor: 'var(--divider)' }}
      >
        <Images className="h-3.5 w-3.5" />
        查看本聊天的生图
      </button>

      {showGallery && (
        <ChatImageGenGalleryModal
          chatId={chat.id}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  );
};

export default ChatImageGenSettingsSection;