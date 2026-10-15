import React, { useEffect, useState } from 'react';
import { IdCard } from 'lucide-react';

import UserCard from './UserCard';
import { getUserCardEnabled, setUserCardEnabled } from './userCardService';
import './userCard.css';

/**
 * 会话列表顶部的"名片区域"入口：一个很小的开关 + 名片本身。
 * 开关默认关闭；关闭时名片组件根本不会挂载（不读数据、不占位），
 * 等于整个功能被关掉，会话列表保持原样。
 */
export const UserCardArea = ({ characters = [] }) => {
  const [enabled, setEnabled] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const value = await getUserCardEnabled();

      if (!cancelled) {
        setEnabled(value);
        setIsReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async () => {
    const next = !enabled;

    setEnabled(next);

    try {
      await setUserCardEnabled(next);
    } catch (error) {
      console.error('[UserCardArea] 保存名片开关失败：', error);
      setEnabled(!next);
    }
  };

  if (!isReady) return null;

  return (
    <div className="space-y-2">
      <div className="uc-mini-row">
        <button
          type="button"
          className="uc-mini-btn"
          aria-pressed={enabled}
          title="开启或关闭个人名片功能"
          onClick={handleToggle}
        >
          <IdCard size={13} strokeWidth={2} />
          <span>{enabled ? '名片 开' : '名片 关'}</span>
        </button>
      </div>

      {enabled && <UserCard characters={characters} />}
    </div>
  );
};

export default UserCardArea;