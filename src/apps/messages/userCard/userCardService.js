import db from '../../../db';

// ============================================================
// 会话列表顶部的"用户名片"（个人主页式）的数据层。
//
// 头像 / 名字 / @标识 / 个性签名 直接复用首页（Hub）那份全局资料
// （db.profile 里 id = 'main' 的那一行，见 hub/ProfileHeader.jsx），
// 不再另建一份。名片自己独有的内容（装饰文字、状态、可见范围、
// 自动回复）统一放在同一行的 `card` 字段里（未建索引的新增字段，
// 不需要升级数据库版本）。
//
// "名片区域是否显示"是一个独立的开关，存在 db.settings 里，默认关闭，
// 关闭时整个名片功能不渲染、不读数据。
// ============================================================

export const PROFILE_ID = 'main';
export const USER_CARD_ENABLED_KEY = 'userCardEnabled';
export const USER_CARD_EVENT = 'user-card-updated';

// 状态预设。icon 是 userCardIcons.jsx 里的图标 key；tone 决定状态文字的颜色。
// 'custom' 是"添加自己的状态"的入口，选中后文字和图标都由用户自己定。
export const STATUS_PRESETS = [
  { id: 'online', name: '在线', desc: '正常回复', icon: 'online', tone: 'online', text: '在线' },
  { id: 'busy', name: '忙碌中', desc: '在做别的事，回得慢', icon: 'busy', tone: 'busy', text: '在忙，回得慢' },
  { id: 'away', name: '暂时不在线', desc: '一段时间不看手机', icon: 'moon', tone: 'away', text: '暂时不在线' },
  { id: 'book', name: '在看书', desc: '安静地读一会儿', icon: 'book', tone: 'plain', text: '在看书' },
  { id: 'coffee', name: '在喝咖啡', desc: '歇一口气', icon: 'coffee', tone: 'plain', text: '在喝咖啡' },
  { id: 'music', name: '在听歌', desc: '戴着耳机', icon: 'music', tone: 'plain', text: '在听歌' },
  { id: 'custom', name: '自定义', desc: '自己写，图标也能换', icon: 'star', tone: 'plain', text: '' },
];

export const AWAY_PRESET_ID = 'away';
export const DEFAULT_AUTO_REPLY = '现在暂时不在线，晚点回你。';

export const getPreset = (id) => (
  STATUS_PRESETS.find((item) => item.id === id) || STATUS_PRESETS[0]
);

const DEFAULT_CARD = Object.freeze({
  title: 'HELLO!',
  bannerText: '( ˘ ᵕ ˘ )',
  mood: '',
  doing: '',
  listen: '',
  statusPreset: 'online',
  statusText: '在线',
  statusIcon: 'online',
  // 当前这个状态是什么时候设上的（ISO 时间）。用来区分"同一段不在线时间"，
  // 自动回复在同一段不在线时间里每个聊天窗只发一次。
  statusSince: '',
  // 记录"看不到这条状态"的角色 id；新增的角色默认看得到。
  hiddenCharacterIds: [],
  autoReplyOn: true,
  autoReplyText: DEFAULT_AUTO_REPLY,
});

const asString = (value, fallback = '') => (typeof value === 'string' ? value : fallback);

export const normalizeUserCard = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const preset = getPreset(source.statusPreset);
  const statusText = asString(source.statusText, preset.text);

  return {
    title: asString(source.title, DEFAULT_CARD.title),
    bannerText: asString(source.bannerText, DEFAULT_CARD.bannerText),
    mood: asString(source.mood),
    doing: asString(source.doing),
    listen: asString(source.listen),
    statusPreset: preset.id,
    statusText,
    statusIcon: asString(source.statusIcon, preset.icon) || preset.icon,
    statusSince: asString(source.statusSince),
    hiddenCharacterIds: Array.isArray(source.hiddenCharacterIds) ? source.hiddenCharacterIds : [],
    autoReplyOn: source.autoReplyOn !== false,
    autoReplyText: asString(source.autoReplyText, DEFAULT_AUTO_REPLY),
  };
};

export const getUserCardEnabled = async () => {
  try {
    const row = await db.settings.get(USER_CARD_ENABLED_KEY);
    return row?.value === true;
  } catch (error) {
    console.error('[userCard] 读取名片开关失败：', error);
    return false;
  }
};

export const setUserCardEnabled = async (enabled) => {
  await db.settings.put({ key: USER_CARD_ENABLED_KEY, value: Boolean(enabled) });
};

/** 读出名片需要的全部数据：Hub 资料里的基础字段 + 名片自己的 card 字段。 */
export const loadUserCard = async () => {
  const saved = await db.profile.get(PROFILE_ID);

  return {
    name: asString(saved?.name),
    handle: asString(saved?.handle),
    bio: asString(saved?.bio),
    avatar: asString(saved?.avatar),
    card: normalizeUserCard(saved?.card),
  };
};

/**
 * 保存名片。先读出 profile 整行再合并写回，保证 Hub 资料卡里的
 * banner / location / joined 等其他字段原样保留。
 */
export const saveUserCard = async ({ name, handle, bio, avatar, card }) => {
  const existing = (await db.profile.get(PROFILE_ID)) || {};

  await db.profile.put({
    ...existing,
    id: PROFILE_ID,
    name,
    handle,
    bio,
    avatar,
    card: normalizeUserCard(card),
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(USER_CARD_EVENT));
  }
};

/**
 * 给后续"让角色知道用户状态"用的纯函数（第二步接入，这里先备好）：
 * 这条状态对这个角色是否可见。
 */
export const isStatusVisibleToCharacter = (card, characterId) => (
  !normalizeUserCard(card).hiddenCharacterIds.includes(characterId)
);