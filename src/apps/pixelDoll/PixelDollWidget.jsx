/*
 * 聊天窗悬浮挂件（像素衣橱）。
 *
 * 只有 ChatRoom.jsx 判断这个聊天的 pixelDollProfiles.widgetEnabled 为
 * true 时才会被懒加载挂上——挂载判断本身在 ChatRoom.jsx 里直接查
 * db.pixelDollProfiles，不 import 这个文件夹，所以这个文件只用管
 * "挂件长什么样、点了之后干什么"，不用再判断"要不要出现"。
 *
 *   <PixelDollWidget chatId={chatId} character={character} onOpen={...} />
 *
 * 用 liveQuery 订阅 readPixelDollState，所以衣橱页面/调度器/角色主动
 * 送礼随时改了外观，这里都会跟着更新，不需要用户手动刷新。
 */

import React, { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';

import PixelDollCanvas from './PixelDollCanvas';
import { readPixelDollState } from './pixelDollService';
import './pixelDollWidget.css';

const PixelDollWidget = ({ chatId, character, onOpen }) => {
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!chatId) {
      setState(null);
      return undefined;
    }

    const subscription = liveQuery(() => readPixelDollState(chatId)).subscribe({
      next: setState,
      error: (error) => {
        console.error('[PixelDollWidget] 读取挂件数据失败:', error);
        setState(null);
      },
    });

    return () => subscription.unsubscribe();
  }, [chatId]);

  // 防御性判断：正常情况下 ChatRoom.jsx 已经先确认过 widgetEnabled 才会
  // 挂载这个组件，这里再确认一次档案确实存在、挂件确实还开着，避免
  // 刚关掉挂件开关的那一瞬间残留一帧旧内容。
  if (!state?.profile || !state.profile.widgetEnabled) return null;

  const { profile, customParts } = state;

  return (
    <button
      type="button"
      className="pixel-doll-widget"
      onClick={onOpen}
      aria-label="打开像素衣橱"
      title="像素衣橱"
    >
      <PixelDollCanvas
        look={profile.charLook}
        customParts={customParts}
        kind="char"
        className="pixel-doll-widget-canvas pixel-doll-widget-canvas--char"
        label={`${character?.name || 'TA'}的像素小人`}
      />
      <PixelDollCanvas
        look={profile.userLook}
        customParts={customParts}
        kind="user"
        className="pixel-doll-widget-canvas pixel-doll-widget-canvas--user"
        label="我的像素小人"
      />
    </button>
  );
};

export default PixelDollWidget;