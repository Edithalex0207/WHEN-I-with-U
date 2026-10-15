import db from '../../../db';
import {
  PROFILE_ID,
  USER_CARD_ENABLED_KEY,
  AWAY_PRESET_ID,
  getPreset,
  normalizeUserCard,
  isStatusVisibleToCharacter,
} from './userCardService';

// ============================================================
// 让角色知道"用户现在是什么状态"（名片里设置的状态）。
//
// 只做一件事：生成一段追加到聊天提示词里的说明文字。
// 返回空字符串（一个字都不加）的情况：
//   - 名片功能没开；
//   - 用户没设置过名片；
//   - 状态是普通的"在线"（没有额外信息可说）；
//   - 用户勾选了"这个角色看不到这条状态"。
//
// 这是纯"上下文"，不是可选行为：不涉及概率、冷却，也不让角色写任何标签。
// ============================================================

const ONLINE_PRESET_ID = 'online';
const STATUS_TEXT_MAX_LENGTH = 20;

const AWAY_GUIDE = [
  '用户现在把自己设为"暂时不在线"，意思是 TA 暂时顾不上手机，之后才会看到消息。',
  '请自然地体谅这一点：不要追问为什么不回、不要连续催促，也不要表现得被冷落；',
  '想说的话可以简短地留下，等 TA 回来再聊。',
].join('');

const BUSY_GUIDE = [
  '用户现在在忙，可能不会立刻回复。',
  '请体谅这一点，回复可以简短一些，不必追问细节，也不要催促。',
].join('');

const GENERIC_GUIDE = [
  '这是用户给自己设的状态，用来告诉你 TA 此刻在做什么。',
  '你可以自然地提到或顺着它说一句，但不要刻意复述，也不要每次回复都提。',
].join('');

const pickGuide = (presetId) => {
  if (presetId === AWAY_PRESET_ID) return AWAY_GUIDE;
  if (presetId === 'busy') return BUSY_GUIDE;
  return GENERIC_GUIDE;
};

/**
 * 生成"用户当前状态"提示词片段。读两次数据库（开关 + 名片），都是单行读取。
 * 任何一步出错都返回空字符串：状态说明是锦上添花，绝不能影响正常回复。
 */
export const buildUserStatusPromptNote = async ({ characterId } = {}) => {
  try {
    const enabledRow = await db.settings.get(USER_CARD_ENABLED_KEY);

    if (enabledRow?.value !== true) return '';

    const profile = await db.profile.get(PROFILE_ID);

    if (!profile?.card) return '';

    const card = normalizeUserCard(profile.card);

    if (card.statusPreset === ONLINE_PRESET_ID) return '';
    if (characterId != null && !isStatusVisibleToCharacter(card, characterId)) return '';

    const preset = getPreset(card.statusPreset);
    const statusText = String(card.statusText || preset.name)
      .trim()
      .slice(0, STATUS_TEXT_MAX_LENGTH);

    const lines = [
      '【用户当前状态】',
      `用户的状态：${statusText || preset.name}`,
      pickGuide(preset.id),
    ];

    // 用户开着自动回复时，你主动找 TA 会有一条系统代发的自动回复出现在聊天里。
    // 这条不在你能看到的聊天记录里，这里提前说明，避免你不知道它是怎么回事。
    const autoReplyText = String(card.autoReplyText || '').trim();

    if (preset.id === AWAY_PRESET_ID && card.autoReplyOn && autoReplyText) {
      lines.push(
        `你主动联系用户时，系统会以用户的名义自动发出一条回复：「${autoReplyText}」。`
        + '这不是用户亲口说的话，不需要逐句回应。',
      );
    }

    return lines.join('\n');
  } catch (error) {
    console.warn('[userStatusPrompt] 读取用户状态失败，本次不附加：', error);
    return '';
  }
};