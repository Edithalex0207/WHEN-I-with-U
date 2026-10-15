import db from '../../../db';
import {
  PROFILE_ID,
  USER_CARD_ENABLED_KEY,
  AWAY_PRESET_ID,
  normalizeUserCard,
  isStatusVisibleToCharacter,
} from './userCardService';

// ============================================================
// 用户"暂时不在线"自动回复。
//
// 触发时机：用户把名片状态设为"暂时不在线"、开着自动回复、并且对这个角色可见时，
// 角色主动找用户（主动消息、寄语、来电），聊天里会出现一条自动回复。
// 同一段不在线时间里，每个聊天窗只发一次（用 chat.userAutoReplyFor 记录）。
//
// 这条自动回复故意不用 sender: 'user' 存：项目里有五十多处代码把"用户发的消息"
// 当成用户的真实活动（连续打卡、记忆、日记、成就、时间线……），代发的自动回复
// 不能混进去。所以它是一条独立类型的消息（sender: 'system'，type: 'user_auto_reply'），
// 界面上渲染成用户一侧的气泡并带"自动回复"标记；AI 历史构建会自然跳过它，
// 角色是通过状态提示词（userStatusPrompt.js）知道有这回事的。
// ============================================================

export const USER_AUTO_REPLY_TYPE = 'user_auto_reply';
export const USER_AUTO_REPLY_MAX_LENGTH = 40;

/**
 * 现在这个角色来找用户时，应不应该出自动回复。
 * 满足条件返回 { text, key }，否则返回 null。出任何错都当作"不用出"。
 */
export const getActiveUserAutoReply = async (characterId) => {
  try {
    const enabledRow = await db.settings.get(USER_CARD_ENABLED_KEY);

    if (enabledRow?.value !== true) return null;

    const profile = await db.profile.get(PROFILE_ID);

    if (!profile?.card) return null;

    const card = normalizeUserCard(profile.card);

    if (card.statusPreset !== AWAY_PRESET_ID) return null;
    if (!card.autoReplyOn) return null;
    if (characterId != null && !isStatusVisibleToCharacter(card, characterId)) return null;

    const text = String(card.autoReplyText || '').trim().slice(0, USER_AUTO_REPLY_MAX_LENGTH);

    if (!text) return null;

    return { text, key: card.statusSince || 'initial' };
  } catch (error) {
    console.warn('[userAutoReply] 读取自动回复设置失败：', error);
    return null;
  }
};

/**
 * 角色刚刚主动找了用户之后调用。满足条件、且这一段不在线时间里这个聊天窗
 * 还没发过，就写入一条自动回复。放在事务里，重复调用也只会发一条。
 * 返回是否真的发出了一条。
 */
export const maybeSendUserAutoReply = async ({ chatId, characterId }) => {
  if (!chatId) return false;

  try {
    const active = await getActiveUserAutoReply(characterId);

    if (!active) return false;

    let sent = false;

    await db.transaction('rw', db.chats, db.messages, async () => {
      const chat = await db.chats.get(chatId);

      if (!chat || chat.userAutoReplyFor === active.key) return;

      await db.messages.add({
        chatId,
        characterId: chat.characterId,
        sender: 'system',
        type: USER_AUTO_REPLY_TYPE,
        content: active.text,
        metadata: { autoReply: true, awaySince: active.key },
        currentVersionIndex: 0,
        isRead: true,
        timestamp: new Date().toISOString(),
      });

      await db.chats.update(chatId, { userAutoReplyFor: active.key });
      sent = true;
    });

    if (sent && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('new-local-message-inserted', { detail: { chatId } })
      );
    }

    return sent;
  } catch (error) {
    console.warn('[userAutoReply] 发送自动回复失败，已跳过：', error);
    return false;
  }
};