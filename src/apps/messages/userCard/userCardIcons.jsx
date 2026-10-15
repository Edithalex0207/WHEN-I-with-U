import React from 'react';
import {
  Circle,
  Moon,
  Briefcase,
  BookOpen,
  Coffee,
  Music,
  Heart,
  Star,
  Gamepad2,
} from 'lucide-react';

// 状态图标表：数据里只存 key（字符串），这里负责映射成图标组件。
const ICON_MAP = {
  online: Circle,
  moon: Moon,
  busy: Briefcase,
  book: BookOpen,
  coffee: Coffee,
  music: Music,
  heart: Heart,
  star: Star,
  game: Gamepad2,
};

export const USER_CARD_ICON_KEYS = Object.keys(ICON_MAP);

export const UserCardIcon = ({ name, className = '', size = 14 }) => {
  const Icon = ICON_MAP[name] || Star;

  return (
    <Icon
      className={className}
      size={size}
      strokeWidth={2}
      fill={name === 'online' ? 'currentColor' : 'none'}
      aria-hidden="true"
    />
  );
};

export default UserCardIcon;