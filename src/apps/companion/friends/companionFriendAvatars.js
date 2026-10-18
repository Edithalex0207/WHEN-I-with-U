/*
 * 好友广场 NPC 专属头像库——跟玩家自己领养的小伙伴头像（见
 * companionShopData.js 的 DEFAULT_AVATARS）完全分开的一套，可重复使用。
 *
 * 渲染那边（CompanionFriendCard.jsx 的 FriendAvatar）已经做好判断：
 * 有 url 就用 <img>，没有就退回占位 SVG，不需要再改这个文件以外的任何代码。
 */

/*
 * 占位小动物形状：4 种简单线条小兽，每种由几个基础 SVG 元素描述
 * （viewBox 统一 0 0 40 40，样子照抄 friends_preview_v2.html 里的
 * #pet-a ~ #pet-d）。渲染这些元素的地方见 CompanionFriendAvatarView.jsx。
 */
export const PLACEHOLDER_PET_SHAPES = {
  a: { // 尖耳朵 + 圆脸（猫系），暖黄色
    base: '#F2B968',
    elements: [
      { tag: 'path', d: 'M10 14 8 5l8 5zM30 14l2-9-8 5z' },
      { tag: 'circle', cx: 20, cy: 22, r: 12 },
    ],
  },
  b: { // 垂耳朵 + 圆脸（兔系），浅蓝色
    base: '#B9D8F5',
    elements: [
      { tag: 'ellipse', cx: 9, cy: 14, rx: 4, ry: 8 },
      { tag: 'ellipse', cx: 31, cy: 14, rx: 4, ry: 8 },
      { tag: 'circle', cx: 20, cy: 22, r: 12 },
    ],
  },
  c: { // 圆耳朵 + 圆脸（熊系），薄荷绿
    base: '#C9E8D2',
    elements: [
      { tag: 'circle', cx: 10, cy: 12, r: 4.5 },
      { tag: 'circle', cx: 30, cy: 12, r: 4.5 },
      { tag: 'circle', cx: 20, cy: 22, r: 12 },
    ],
  },
  d: { // 尖耳朵变体（狐狸系），粉色
    base: '#F7C6D3',
    elements: [
      { tag: 'path', d: 'M12 12 10 4l7 5zM28 12l2-8-7 5z' },
      { tag: 'circle', cx: 20, cy: 22, r: 12 },
    ],
  },
};

const SHAPE_IDS = Object.keys(PLACEHOLDER_PET_SHAPES);

// ---- 头像图片列表 ----
export const NPC_AVATAR_URLS = [
  'https://img.pagehost.cn/autoupload/amqnh/20261018/0Jbs/1024X1024/d5e618e1-9c32-425d-99fd-37ad8d2ab93d.png/webp',
  'https://img.pagehost.cn/autoupload/amqnh/20261018/vSDs/1254X1254/gi2-e1792311723.png/webp',
  'https://img.pagehost.cn/autoupload/amqnh/20261018/x1gu/1024X1024/7f354e9d-af82-4c28-8fd6-c46251042e38.png/webp',
  'https://img.pagehost.cn/autoupload/amqnh/20261018/L5Gj/1024X1024/046f872d-58c6-41b0-92a7-e88b21cab227.png/webp',
  'https://img.pagehost.cn/autoupload/amqnh/20261018/JAW5/1024X1024/6b8dc8ce-05f4-4d6d-8933-e62406a70ef9.png/webp',
  'https://img.pagehost.cn/autoupload/amqnh/20261018/MxqR/1024X1024/d990bce1-3165-49ce-9f7a-f37e01839e93.png/webp',
  'https://img.pagehost.cn/autoupload/amqnh/20261018/iR2X/1254X1254/gi2-e1792313425.png/webp',
  'https://img.pagehost.cn/autoupload/amqnh/20261018/EZSu/1024X1024/342db750-6091-4695-9497-e6618862d7ad.png/webp',
];

// ---- 头像池：基于真图生成，shape 循环 + bg 轮换保证色块不撞脸 ----
const BG_CYCLE = ['#FFE9C7', '#D8ECFF', '#E3F5E8', '#FFEAEF', '#FFF4C9', '#EDE3FF'];

export const NPC_AVATAR_POOL = NPC_AVATAR_URLS.map((url, i) => ({
  id: `npc-avatar-${String(i + 1).padStart(2, '0')}`,
  url,
  shape: SHAPE_IDS[i % SHAPE_IDS.length],
  bg: BG_CYCLE[i % BG_CYCLE.length],
}));

export const findNpcAvatar = (avatarId) => (
  NPC_AVATAR_POOL.find((a) => a.id === avatarId) || NPC_AVATAR_POOL[0]
);

/*
 * 随机挑一个头像池条目，excludeIds 传入"这一批里已经用过的 id"，
 * 尽量不连续撞脸；池子用完了就允许重复（头像库本来就设计成可重复使用）。
 */
export const pickRandomAvatar = (excludeIds = []) => {
  const pool = NPC_AVATAR_POOL.filter((a) => !excludeIds.includes(a.id));
  const source = pool.length > 0 ? pool : NPC_AVATAR_POOL;
  return source[Math.floor(Math.random() * source.length)];
};
