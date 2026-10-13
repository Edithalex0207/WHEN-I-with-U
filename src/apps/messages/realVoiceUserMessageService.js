import db from '../../db';
import {
  recordAlmanacEvent,
  ALMANAC_EVENT_TYPES,
} from '../almanac/services/almanacService';
import {
  hasUsableMiniMaxAsrConfig,
  transcribeMiniMaxSpeech,
} from '../../features/real-voice/minimaxClient';
import { transcribeAudioWithMainApi } from '../../services/voiceTranscriptionService';

// 用户真的录一段音发出去——跟 photoMessageService.js 是同一个思路：
// 真实媒体本体（这里是录音 Blob）立刻存进消息、立刻可以播放，
// 是否"让 AI 听懂内容"是另一条异步的、允许失败的支线。
//
// 跟角色自己说话用的 realVoice（见 realVoiceCoordinator.js）复用同一个
// type + 同一套 metadata.generationStatus/audioBlob 字段，这样消息列表
// 直接用现成的 RealVoiceCard 就能渲染，不用再写一张新卡片；用 sender
// 区分"是谁发的"，所以这里永远传 sender: 'user'。
//
// 区别在于：角色那边 generationStatus 一开始是 'pending'（还要等 MiniMax
// 合成），用户这边录完音频 Blob 已经就绪，所以一开始就是 'ready'，能立刻
// 播放；真正异步、允许失败的是"要不要把这段话转成文字给 AI 看"，用一个
// 额外的 metadata.transcribeStatus 字段单独跟踪，不影响播放。

const notifyChatRoom = (chatId) => {
  window.dispatchEvent(
    new CustomEvent('new-local-message-inserted', {
      detail: { chatId },
    }),
  );
};

/**
 * 发送一条用户自己录的真实语音消息。
 * audioBlob 预期是 useVoiceRecorder.stop() 产出的 wav。
 */
export const sendUserRealVoiceMessage = async ({
  chatId,
  characterId,
  audioBlob,
  durationSeconds = 0,
}) => {
  if (!chatId || !audioBlob) return null;

  const nowIso = new Date().toISOString();

  const metadata = {
    generationStatus: 'ready',
    audioBlob,
    mimeType: audioBlob.type || 'audio/wav',
    byteSize: audioBlob.size,
    durationSeconds,

    // 这条语音有没有被转成文字给 AI 看：pending 在异步识别、done 已经
    // 识别出来、error 两条路都试过还是失败——不管哪种，都不影响上面
    // generationStatus 为 'ready'，语音本身随时能播放。
    transcribeStatus: 'pending',
    transcript: '',
  };

  const payload = {
    chatId,
    characterId,
    sender: 'user',
    type: 'realVoice',
    content: '',
    metadata,
    isRead: true,
    timestamp: nowIso,
  };

  const messageId = await db.messages.add(payload);

  void recordAlmanacEvent({
    chatId,
    characterId,
    eventType: ALMANAC_EVENT_TYPES.USER_MESSAGE,
    timestamp: nowIso,
    metadata: { source: 'chat-room', messageType: 'realVoice' },
  });

  await db.chats.update(chatId, { updatedAt: nowIso });

  notifyChatRoom(chatId);

  void transcribeAndAttach(chatId, messageId, audioBlob, characterId);

  return messageId;
};

const transcribeAndAttach = async (chatId, messageId, audioBlob, characterId) => {
  let transcript = '';
  let failureMessage = '';

  try {
    const character = characterId ? await db.characters.get(characterId) : null;

    // 优先复用这个角色已经配置好的 MiniMax 语音识别（跟通话里用户说话
    // 走的是完全同一个函数），这条路已经在通话功能里跑通过，优先级更高。
    if (hasUsableMiniMaxAsrConfig(character?.voiceProfile)) {
      try {
        transcript = await transcribeMiniMaxSpeech({
          audioBlob,
          voiceProfile: character.voiceProfile,
        });
      } catch (minimaxError) {
        failureMessage = minimaxError?.message || 'MiniMax 语音识别失败';
      }
    }

    // 没配 MiniMax，或者配了但没识别出东西——再试一次主 API 自己是否支持
    // 语音输入（比如 gpt-4o-audio-preview 这类多模态模型）。这条路大概率
    // 会在普通纯文本模型上失败，失败就失败，不影响语音消息本身。
    if (!transcript) {
      const fallback = await transcribeAudioWithMainApi(audioBlob);

      if (!fallback.error) {
        transcript = fallback.transcript;
      } else if (!failureMessage) {
        failureMessage = fallback.message;
      }
    }
  } catch (error) {
    console.warn('[RealVoice] 用户语音识别流程异常：', error);
    failureMessage = error?.message || '识别失败';
  }

  const message = await db.messages.get(messageId);
  if (!message) return;

  if (transcript) {
    await db.messages.update(messageId, {
      // content 跟角色那边的 realVoice 消息一样，直接就是"这段话的文字"，
      // 这样 aiService.js 里对普通消息的默认文本拼装逻辑不用改——
      // 一旦转写完成，这条消息在 AI 眼里就是一条普通的文字消息。
      content: transcript,
      metadata: {
        ...message.metadata,
        transcribeStatus: 'done',
        transcript,
      },
    });
  } else {
    await db.messages.update(messageId, {
      metadata: {
        ...message.metadata,
        transcribeStatus: 'error',
        transcribeError: failureMessage || '未能识别语音内容',
      },
    });
  }

  notifyChatRoom(chatId);
};

export default {
  sendUserRealVoiceMessage,
};