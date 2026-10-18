/*
 * CompanionFriendAvatarView.jsx —— 好友广场/我的朋友共用的头像渲染：
 * 有真图（avatar.url）就用 <img>，没有就用占位小动物 SVG
 * （见 companionFriendAvatars.js 的 PLACEHOLDER_PET_SHAPES）。
 *
 * 以后头像池换上真图，这里完全不用改——判断逻辑已经做好了。
 */

import React from 'react';

import { findNpcAvatar, PLACEHOLDER_PET_SHAPES } from './companionFriendAvatars';

const PlaceholderPet = ({ shapeId }) => {
  const shape = PLACEHOLDER_PET_SHAPES[shapeId] || PLACEHOLDER_PET_SHAPES.a;
  return (
    <svg viewBox="0 0 40 40" width="100%" height="100%">
      {shape.elements.map((el, i) => {
        const key = `${shapeId}-${i}`;
        if (el.tag === 'circle') {
          return <circle key={key} cx={el.cx} cy={el.cy} r={el.r} fill={shape.base} />;
        }
        if (el.tag === 'ellipse') {
          return <ellipse key={key} cx={el.cx} cy={el.cy} rx={el.rx} ry={el.ry} fill={shape.base} />;
        }
        return <path key={key} d={el.d} fill={shape.base} />;
      })}
      <circle cx="16" cy="21" r="1.6" fill="#24415A" />
      <circle cx="24" cy="21" r="1.6" fill="#24415A" />
      <ellipse cx="20" cy="26" rx="2.2" ry="1.5" fill="#FF86A0" />
    </svg>
  );
};

/*
 * size: 'sm' | 'md' | 'lg'（分别对应我的朋友列表头像 / 蹭饭信头像 /
 * 名片卡大头像），只决定外层容器大小，具体像素由调用方的 className
 * 配合 css 控制，这里只给一个合理默认值。
 */
const CompanionFriendAvatarView = ({ avatarId, className = '', style = {} }) => {
  const avatar = findNpcAvatar(avatarId);
  return (
    <span className={`cf-avatar ${className}`} style={{ background: avatar.url ? 'transparent' : avatar.bg, ...style }}>
      {avatar.url ? (
        <img src={avatar.url} alt="" />
      ) : (
        <PlaceholderPet shapeId={avatar.shape} />
      )}
    </span>
  );
};

export default CompanionFriendAvatarView;