import React, { useEffect, useRef, useState } from 'react';
import { Mic, X, Send } from 'lucide-react';
import { useVoiceRecorder } from '../../../features/real-voice/useVoiceRecorder';
import { sendUserRealVoiceMessage } from '../realVoiceUserMessageService';

// 真实语音的录音条：替换掉输入栏本体（而不是叠加在上面），进来就立刻
// 开始录，取消/发送都会让这个组件退场，交回普通的文字输入栏。
// 复用通话功能里已经跑通的 useVoiceRecorder（录音→转 wav），
// 发送逻辑见 realVoiceUserMessageService.js。

const formatDuration = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export const VoiceRecorderBar = ({ chatId, characterId, onDone }) => {
  const { isRecording, start, stop, cancel } = useVoiceRecorder();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [startError, setStartError] = useState('');

  const timerRef = useRef(null);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) return undefined;
    hasStartedRef.current = true;

    start().catch((error) => {
      setStartError(error?.message || '无法开始录音，请检查麦克风权限。');
    });

    // 组件被卸载时兜底：万一还在录，直接放弃录音、关掉麦克风，
    // 不能让麦克风停不下来。
    return () => {
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((previous) => previous + 1);
      }, 1000);
    } else if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording]);

  const handleCancel = () => {
    cancel();
    onDone?.();
  };

  const handleSend = async () => {
    if (!isRecording || isSending) return;

    setIsSending(true);

    try {
      const audioBlob = await stop();

      await sendUserRealVoiceMessage({
        chatId,
        characterId,
        audioBlob,
        durationSeconds: elapsedSeconds,
      });
    } catch (error) {
      console.warn('[VoiceRecorderBar] 发送真实语音失败：', error);
    } finally {
      setIsSending(false);
      onDone?.();
    }
  };

  if (startError) {
    return (
      <div
        className="flex w-full items-center justify-between gap-2 rounded-full px-3 py-2 text-xs"
        style={{ color: 'var(--text-main)' }}
      >
        <span className="opacity-70">{startError}</span>

        <button
          type="button"
          onClick={handleCancel}
          className="shrink-0 rounded-full p-1.5 opacity-70 transition-opacity hover:opacity-100"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center gap-2" style={{ color: 'var(--text-main)' }}>
      <button
        type="button"
        onClick={handleCancel}
        disabled={isSending}
        className="shrink-0 rounded-full p-2 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-30"
        title="取消"
        aria-label="取消录音"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex flex-1 items-center gap-2 px-1 text-xs">
        <Mic
          className={`h-4 w-4 shrink-0 ${
            isRecording ? 'animate-pulse text-rose-500' : 'opacity-50'
          }`}
        />
        <span className="font-mono opacity-80">
          {formatDuration(elapsedSeconds)}
        </span>
        <span className="opacity-50">
          {isRecording ? '正在录音...' : '准备中...'}
        </span>
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={!isRecording || isSending}
        className="flex shrink-0 items-center gap-1 rounded-full px-3.5 py-2 text-[11px] font-semibold shadow-sm transition-transform active:scale-95 disabled:opacity-40"
        style={{
          background: 'var(--accent-color)',
          color: 'var(--accent-foreground)',
        }}
      >
        <Send className="h-3.5 w-3.5" />
        <span>{isSending ? '发送中' : '发送'}</span>
      </button>
    </div>
  );
};

export default VoiceRecorderBar;