/*
 * companionClawData.js —— #2 娃娃机的奖品静态数据（8 款娃娃）。
 *
 * 跟 companionShopData.js 的商品完全不共用：娃娃机的奖品是永久收藏，走
 * companionInventory 表（category: 'clawPrize'），不走 companionBackpack/
 * findShopItem 那一套"必须能在商店数据里查到否则当脏数据过滤"的逻辑。
 *
 * url 先留空字符串，等图做好了直接填进来就行，不用改其他任何文件。
 */

export const CLAW_RARITY = {
  COMMON: 'common',
  RARE: 'rare',
  HIDDEN: 'hidden',
};

export const CLAW_RARITY_LABELS = {
  [CLAW_RARITY.COMMON]: '普通',
  [CLAW_RARITY.RARE]: '稀有',
  [CLAW_RARITY.HIDDEN]: '隐藏',
};

// 4 普通 + 3 稀有 + 1 隐藏。隐藏款（claw-star）在图鉴里的显示逻辑由
// companionClawService.js 的 getClawCollection 负责（没集到之前整条都不
// 返回，不在这个数据文件里处理"要不要显示"）。
export const CLAW_PRIZES = [
  { id: 'claw-cat', name: '布丁猫', rarity: CLAW_RARITY.COMMON, url: '' },
  { id: 'claw-bear', name: '蜂蜜小熊', rarity: CLAW_RARITY.COMMON, url: '' },
  { id: 'claw-bunny', name: '棉花兔', rarity: CLAW_RARITY.COMMON, url: '' },
  { id: 'claw-penguin', name: '糖霜企鹅', rarity: CLAW_RARITY.COMMON, url: '' },
  { id: 'claw-fox', name: '奶油狐狸', rarity: CLAW_RARITY.RARE, url: '' },
  { id: 'claw-unicorn', name: '星砂独角兽', rarity: CLAW_RARITY.RARE, url: '' },
  { id: 'claw-owl', name: '夜读猫头鹰', rarity: CLAW_RARITY.RARE, url: '' },
  { id: 'claw-star', name: '流星仔', rarity: CLAW_RARITY.HIDDEN, url: '' },
];

export const findClawPrize = (id) => CLAW_PRIZES.find((item) => item.id === id) || null;