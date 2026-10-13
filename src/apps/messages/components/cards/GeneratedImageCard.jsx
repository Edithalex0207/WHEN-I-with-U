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
//
// "done" 状态下还带两个动作（只有存进了画廊、即 metadata.generationId
// 存在时才给出"换一张"——没存进画廊的那次结果没法重roll）：
//   换一张    追加成消息的新版本（见 rerollChatImageGeneration），旧版本
//            保留，可以用 MessageRow.jsx 里原本就有的版本切换箭头翻回去——
//            这里不单独做"上一张/下一张"，跟文字消息共用同一套机制。
//   查看提示词 展开显示这张图实际发出去的正面/负面提示词和后端/模型，
//            纯本地展开，不发请求。
import React, { useEffect, useState } from 'react';
import { Loader2, ImageOff, RotateCw, Wand2, ChevronDown, ChevronUp } from 'lucide-react';
import { getGenerationOriginal } from '../../../imagestudio/imageGenerationService';
import {
  retryChatImageGeneration,
  rerollChatImageGeneration,
} from '../../chatImageGen/chatImageGenService';

// 模块级缓存：key -> { url, blob }，道理跟 PhotoCard.jsx 一样——避免
// 消息列表因无关消息刷新就重新对同一张图调用一次
// createObjectURL/revokeObjectURL。
//
// 存了 blob 本身一起比对（不是只看 key 存不存在）：这条消息"换一张"或
// 重试之后，拿到的是一张新图，但用的还是同一个 messageId/generationId
// 当缓存key的场景（见下面两处调用），如果只认key、不比对blob是否还是
// 同一个，就会把换完之后的新图错当成命中缓存，继续显示换之前的旧图。
const originalUrlCache = new Map();

const getOrCreateObjectUrl = (key, blob) => {
  if (!key || !blob) return '';

  const cached = originalUrlCache.get(key);
  if (cached && cached.blob === blob) return cached.url;

  if (cached) URL.revokeObjectURL(cached.url);

  const url = URL.createObjectURL(blob);
  originalUrlCache.set(key, { url, blob });
  return url;
};

/**
 * 聊天被清空/这条消息被删除时调用，释放对应缓存的 object URL。
 * key 跟上面创建时用的一致：有 generationId 时传 generationId，没有时
 * （没存进画廊的那种）传 messageId。
 */
export const releaseGeneratedImageObjectUrl = (key) => {
  const cached = originalUrlCache.get(key);
  if (cached) {
    URL.revokeObjectURL(cached.url);
    originalUrlCache.delete(key);
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
  const [isRerolling, setIsRerolling] = useState(false);
  const [rerollError, setRerollError] = useState('');
  const [showPromptDetails, setShowPromptDetails] = useState(false);

  const status = metadata.status || 'pending';

  // metadata.generationId 或 metadata.blob 任一变化，都意味着这条消息
  // 显示的已经是另一个版本（换一张/重试之后）——必须跟着重置，否则会
  // 一直停留在"点过一次查看原图"时缓存下来的那个旧版本原图地址上。
  useEffect(() => {
    if (metadata.blob instanceof Blob) {
      setOriginalUrl(getOrCreateObjectUrl(messageId, metadata.blob));
    } else {
      setOriginalUrl('');
    }
  }, [messageId, metadata.generationId, metadata.blob]);

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

  const handleRerollImage = async () => {
    if (isRerolling) return;

    setIsRerolling(true);
    setRerollError('');
    try {
      const result = await rerollChatImageGeneration({ chatId, characterId, messageId });
      if (!result?.ok) {
        setRerollError(result?.error || '换一张失败，请重试。');
      }
    } finally {
      setIsRerolling(false);
    }
  };

  const handleViewOriginal = async () => {
    if (originalUrl || isLoadingOriginal || !metadata.generationId) return;

    setIsLoadingOriginal(true);
    try {
      const blob = await getGenerationOriginal(metadata.generationId);
      // 用 generationId 当缓存key，不是 messageId——同一条消息换一张之后
      // generationId 会变，这样换过的新图和换之前的旧图天然不会互相撞缓存。
      if (blob) setOriginalUrl(getOrCreateObjectUrl(metadata.generationId, blob));
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

      <div className="flex items-center gap-2">
        {metadata.generationId && (
          <button
            type="button"
            onClick={handleRerollImage}
            disabled={isRerolling}
            className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] opacity-70 active:scale-95"
            style={{ borderColor: 'var(--divider)' }}
          >
            <Wand2 className={`h-2.5 w-2.5 ${isRerolling ? 'animate-pulse' : ''}`} />
            {isRerolling ? '换图中…' : '换一张'}
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowPromptDetails((prev) => !prev)}
          className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] opacity-70 active:scale-95"
          style={{ borderColor: 'var(--divider)' }}
        >
          {showPromptDetails ? (
            <ChevronUp className="h-2.5 w-2.5" />
          ) : (
            <ChevronDown className="h-2.5 w-2.5" />
          )}
          查看提示词
        </button>
      </div>

      {rerollError && (
        <span className="text-[9px]" style={{ color: 'var(--text-sub)' }}>
          {rerollError}
        </span>
      )}

      {showPromptDetails && (
        <div
          className="w-full space-y-1 rounded-xl border px-2.5 py-2 text-[9px] leading-relaxed"
          style={{
            background: 'var(--control-soft-bg)',
            borderColor: 'var(--card-border)',
            maxWidth: '220px',
          }}
        >
          <p className="opacity-50">场景描述</p>
          <p className="opacity-80">{content || '（空）'}</p>

          {metadata.prompt && (
            <>
              <p className="mt-1 opacity-50">实际发送的正面提示词</p>
              <p className="opacity-80 break-words">{metadata.prompt}</p>
            </>
          )}

          {metadata.negativePrompt && (
            <>
              <p className="mt-1 opacity-50">负面提示词</p>
              <p className="opacity-80 break-words">{metadata.negativePrompt}</p>
            </>
          )}

          {(metadata.backend || metadata.model) && (
            <p className="mt-1 opacity-50">
              {metadata.backend || ''}{metadata.model ? ` · ${metadata.model}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default GeneratedImageCard;