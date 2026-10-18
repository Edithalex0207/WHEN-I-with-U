/*
 * 好友广场 NPC 专属头像库——跟玩家自己领养的小伙伴头像（见
 * companionShopData.js 的 DEFAULT_AVATARS）完全分开的一套，可重复使用。
 *
 * 用户正在自己生图，生好后会给一份图片 URL 列表。在那之前，这里先放
 * 占位数据：每个池子条目只有 id / bg（名片卡顶部色块用）/ shape（对应
 * 下面 PLACEHOLDER_PET_PATHS 里的一个占位小动物形状），url 先留 null。
 *
 * 以后接入真图，只要把某个条目的 url 填上真实地址即可——渲染那边
 * （CompanionFriendCard.jsx 的 FriendAvatar）已经做好判断：有 url 就用
 * <img>，没有就退回占位 SVG，不需要再改这个文件以外的任何代码。
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

// ---- 头像池：12 条，shape 循环 + bg 轮换，保证连续几批候选不会撞脸 ----
// 等真图到位后，把对应条目的 url 换成真实地址就行。
const BG_CYCLE = ['#FFE9C7', '#D8ECFF', '#E3F5E8', '#FFEAEF', '#FFF4C9', '#EDE3FF'];

export const NPC_AVATAR_POOL = Array.from({ length: 12 }, (_, i) => ({
  id: `npc-avatar-${String(i + 1).padStart(2, '0')}`,
  url: null,
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