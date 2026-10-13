import db from '../db';

// 用户发真实语音时，如果这个角色没配置可用的 MiniMax 语音识别
// （见 hasUsableMiniMaxAsrConfig），就退回来试一下：直接把录音喂给
// 主聊天 API，看它自己支不支持多模态语音输入（比如 gpt-4o-audio-preview
// 这类模型）。跟 visionService.js 的 describeImageWithVision 是同一个
// 思路——独立的一次性调用，成功就把结果写回消息，失败也不影响这条
// 语音消息本身已经发出去、可以播放。

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();

  reader.onload = () => {
    const result = String(reader.result || '');
    // 去掉 data:audio/xxx;base64, 前缀，只要纯 base64 数据。
    const base64 = result.replace(/^data:[^;]+;base64,/, '');
    resolve(base64);
  };

  reader.onerror = () => reject(new Error('音频转码失败'));
  reader.readAsDataURL(blob);
});

/**
 * 调用主聊天 API，尝试把一段录音转写成文字。
 * audioBlob 预期是 useVoiceRecorder 转出来的 wav——OpenAI 的
 * input_audio 格式字段只认 wav/mp3，这里固定传 'wav'。
 */
export const transcribeAudioWithMainApi = async (audioBlob) => {
  const apiSetting = await db.settings.get('apiConfig');
  const apiConfig = apiSetting?.value || {};

  if (!apiConfig.baseUrl || !apiConfig.apiKey) {
    return {
      error: true,
      code: 'API_CONFIG_MISSING',
      message: '尚未配置主 API，无法尝试识别语音内容。',
    };
  }

  if (!audioBlob || audioBlob.size === 0) {
    return {
      error: true,
      code: 'EMPTY_AUDIO',
      message: '没有录到声音。',
    };
  }

  const baseUrl = String(apiConfig.baseUrl).replace(/\/$/, '');

  try {
    const base64Audio = await blobToBase64(audioBlob);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: apiConfig.model || 'gpt-4o-mini',
        modalities: ['text'],
        messages: [
          {
            role: 'system',
            content: '你是一个语音转写助手。请把用户发来的这段语音逐字转写成文字，'
              + '只输出转写结果本身，不要加任何解释或说明，不要翻译成其他语言。'
              + '如果完全听不出内容，只输出：[无法识别]',
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: { data: base64Audio, format: 'wav' },
              },
            ],
          },
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      let detail = response.statusText || '请求未成功';

      try {
        const errData = await response.json();
        detail = errData?.error?.message || errData?.message || detail;
      } catch {
        // 忽略解析失败，保留 statusText
      }

      return {
        error: true,
        code: `HTTP_${response.status}`,
        message: `[主 API 语音转写失败 ${response.status}] ${detail}`,
      };
    }

    const data = await response.json();
    const transcript = String(data?.choices?.[0]?.message?.content || '').trim();

    if (!transcript || transcript === '[无法识别]') {
      return {
        error: true,
        code: 'UNRECOGNIZED',
        message: '主 API 未能识别出语音内容（这个模型可能不支持语音输入）。',
      };
    }

    return { error: false, transcript };
  } catch (err) {
    return {
      error: true,
      code: 'NETWORK_ERROR',
      message: `语音转写网络请求失败: ${err?.message || '未知错误'}`,
    };
  }
};

export default {
  transcribeAudioWithMainApi,
};