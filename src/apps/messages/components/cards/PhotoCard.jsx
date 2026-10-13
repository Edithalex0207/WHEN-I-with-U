import React, { useEffect, useState } from 'react';
import { Loader2, ImageOff } from 'lucide-react';

// 模块级缓存：messageId -> objectURL。
// 避免每次消息列表整体刷新（哪怕只是别的消息变化）
// 都重新对同一张照片调用一次 createObjectURL/revokeObjectURL。
const photoUrlCache = new Map();

const getOrCreateObjectUrl = (messageId, blob) => {
  if (!messageId || !blob) return '';

  const cached = photoUrlCache.get(messageId);
  if (cached) return cached;

  const url = URL.createObjectURL(blob);
  photoUrlCache.set(messageId, url);
  return url;
};

/**
 * 聊天被清空/照片消息被删除时调用，释放对应缓存的 object URL。
 * ChatRoom 的 handleClearHistory / handleDeleteMessage 可以在
 * 删除 photo 类型消息时调用它，防止内存缓慢累积。
 */
export const releasePhotoObjectUrl = (messageId) => {
  const cached = photoUrlCache.get(messageId);
  if (cached) {
    URL.revokeObjectURL(cached);
    photoUrlCache.delete(messageId);
  }
};

export const PhotoCard = ({ metadata, messageId, isUser = false }) => {
  const [objectUrl, setObjectUrl] = useState('');

  useEffect(() => {
    const blob = metadata?.blob;

    if (!blob) {
      setObjectUrl('');
      return;
    }

    setObjectUrl(getOrCreateObjectUrl(messageId, blob));

    // 注意：这里不再 revoke —— URL 生命周期跟随消息本身，
    // 而不是跟随组件的挂载/卸载，这样消息列表因无关消息
    // 刷新而重新渲染时，已经显示过的照片不需要重新解码。
  }, [messageId, metadata?.blob]);

  const visionStatus = metadata?.visionStatus;

  return (
    <div className="my-1 flex flex-col items-start gap-1">
      <div
        className="overflow-hidden rounded-2xl border shadow-sm"
        style={{
          borderColor: 'var(--card-border, rgba(0,0,0,0.08))',
          maxWidth: '200px',
        }}
      >
        {objectUrl ? (
          <img
            src={objectUrl}
            alt="真实照片"
            className="block h-auto w-full object-cover"
            loading="lazy"
            style={{ maxHeight: '260px' }} 
            decoding="async" />
        ) : (
          <div
            className="flex h-32 w-40 items-center justify-center opacity-50"
            style={{ background: 'var(--control-soft-bg)' }}
          >
            <ImageOff className="h-5 w-5" />
          </div>
        )}
      </div>

      {/* photo 类型消息目前只会是用户自己发的（sender 永远是 'user'），
          isUser 对这条消息恒为 true——之前这里写的是 `!isUser && ...`，
          导致这两条状态提示永远不会渲染，是一段死代码。这里去掉
          isUser 这个条件，只按 visionStatus 本身判断，用户才能看到
          "正在识别/识别失败"的真实反馈。 */}
      {visionStatus === 'pending' && (
        <span className="flex items-center gap-1 text-[9px] opacity-50">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          正在查看这张照片...
        </span>
      )}

      {visionStatus === 'error' && (
        <span className="text-[9px] opacity-50">
          未能识别这张照片的内容
        </span>
      )}
    </div>
  );
};

export default PhotoCard;