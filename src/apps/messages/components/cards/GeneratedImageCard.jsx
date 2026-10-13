// src/apps/messages/components/cards/GeneratedImageCard.jsx
//
// 聊天里AI自己触发的真实生图消息卡片。跟 ImageCard.jsx（纯文字的拟物
// 拍立得卡片）完全独立——这张卡片显示的是生图室真的生成出来的图片。
// 状态来自 message.metadata.status（见 chatImageGenService.js）：
//   pending  排队/生成中，转圈
//   error    生成失败，带错误原因 + 重试按钮
//   done     成功。优先显示 metadata.thumbnail（384px 缩略图 data URL），
//            点一下懒加载原图（按 metadata.generationId 去
//            imageGenerationFiles 表查）；如果这次生成出来了但没能存进
//            画廊（metadata.unsaved === true），metadata.blob 本身就是
//            原图 Blob，没有 generationId 可查，直接显示它。
import React, { useEffect, useState } from 'react';
import { Loader2, ImageOff, RotateCw } from 'lucide-react';
import { getGenerationOriginal } from '../../../imagestudio/imageGenerationService';
import { retryChatImageGeneration } from '../../chatImageGen/chatImageGenService';

// 模块级缓存：messageId -> objectURL，道理跟 PhotoCard.jsx 一样——避免
// 消息列表因无关消息刷新就重新对同一张图调用一次
// createObjectURL/revokeObjectURL。
const originalUrlCache = new Map();

const getOrCreateObjectUrl = (key, blob) => {
  if (!key || !blob) return '';

  const cached = originalUrlCache.get(key);
  if (cached) return cached;

  const url = URL.createObjectURL(blob);
  originalUrlCache.set(key, url);
  return url;
};

/**
 * 聊天被清空/这条消息被删除时调用，释放对应缓存的 object URL。
 */
export const releaseGeneratedImageObjectUrl = (messageId) => {
  const cached = originalUrlCache.get(messageId);
  if (cached) {
    URL.revokeObjectURL(cached);
    originalUrlCache.delete(messageId);
  }
};

export const GeneratedImageCard = ({
  content,
  metadata = {},
  messageId,
  chatId,
  characterId,
}) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [originalUrl, setOriginalUrl] = useState('');
  const [isLoadingOriginal, setIsLoadingOriginal] = useState(false);

  const status = metadata.status || 'pending';

  useEffect(() => {
    if (metadata.blob instanceof Blob) {
      setOriginalUrl(getOrCreateObjectUrl(messageId, metadata.blob));
    }
  }, [messageId, metadata.blob]);

  const handleRetry = async () => {
    if (isRetrying) return;

    setIsRetrying(true);
    try {
      await retryChatImageGeneration({
        chatId,
        characterId,
        messageId,
        sceneText: content,
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleViewOriginal = async () => {
    if (originalUrl || isLoadingOriginal || !metadata.generationId) return;

    setIsLoadingOriginal(true);
    try {
      const blob = await getGenerationOriginal(metadata.generationId);
      if (blob) setOriginalUrl(getOrCreateObjectUrl(messageId, blob));
    } finally {
      setIsLoadingOriginal(false);
    }
  };

  if (status === 'pending') {
    return (
      <div
        className="flex items-center gap-2 rounded-2xl border px-3 py-2.5"
        style={{
          background: 'var(--control-soft-bg)',
          borderColor: 'var(--card-border)',
          maxWidth: '200px',
        }}
      >
        <Loader2 className="h-4 w-4 animate-spin opacity-60" />
        <span className="text-[11px] opacity-60">正在生成图片…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className="flex flex-col gap-1.5 rounded-2xl border px-3 py-2.5"
        style={{
          background: 'var(--control-soft-bg)',
          borderColor: 'var(--card-border)',
          maxWidth: '220px',
        }}
      >
        <div className="flex items-center gap-1.5 text-[11px] opacity-70">
          <ImageOff className="h-3.5 w-3.5" />
          <span>图片没能生成出来</span>
        </div>

        {metadata.errorMessage && (
          <p className="text-[10px] opacity-55 leading-relaxed">
            {metadata.errorMessage}
          </p>
        )}

        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          className="mt-0.5 flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[11px] active:scale-95"
          style={{ borderColor: 'var(--divider)' }}
        >
          <RotateCw className={`h-3 w-3 ${isRetrying ? 'animate-spin' : ''}`} />
          {isRetrying ? '重试中…' : '重试'}
        </button>
      </div>
    );
  }

  const previewUrl = originalUrl || metadata.thumbnail || '';

  return (
    <div className="my-1 flex flex-col items-start gap-1">
      <div
        className="relative overflow-hidden rounded-2xl border shadow-sm cursor-pointer"
        style={{ borderColor: 'var(--card-border)', maxWidth: '220px' }}
        onClick={handleViewOriginal}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={content || '生成的图片'}
            className="block h-auto w-full object-cover"
            loading="lazy"
            style={{ maxHeight: '280px' }}
            decoding="async"
          />
        ) : (
          <div
            className="flex h-32 w-40 items-center justify-center opacity-50"
            style={{ background: 'var(--control-soft-bg)' }}
          >
            <ImageOff className="h-5 w-5" />
          </div>
        )}

        {!originalUrl && metadata.generationId && (
          <div
            className="absolute bottom-1 right-1 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px]"
            style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}
          >
            {isLoadingOriginal && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
            {isLoadingOriginal ? '加载原图…' : '查看原图'}
          </div>
        )}
      </div>

      {metadata.unsaved && (
        <span className="text-[9px] opacity-50">
          这张图没有存进画廊{metadata.errorMessage ? `（${metadata.errorMessage}）` : ''}
        </span>
      )}
    </div>
  );
};

export default GeneratedImageCard;