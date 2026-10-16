// src/apps/messages/replyLanguage/ChatReplyLanguageSettingsSection.jsx
//
// 聊天设置里的"回复语言"区块：一排按钮直接选语言，不需要额外开关——
// 选"默认"就是关闭。跟"语言学习模式"是两件独立的事：这里没有翻译、
// 没有难度分级，只是让角色直接用目标语言说话。
//
// 这个区块自己的界面文案是三语的（zh/en/ko，见 chatReplyLanguageUiText.js），
// 跟随说明书（Manual）已经在用的那份"界面语言"记录——读
// readStoredManualLang()，不在这里另外做一个语言切换按钮。
//
// 写法照抄 LearningModeSettingsSection.jsx / ChatSettingsModal 里的
// "按钮外观"预设区块：自己持有状态、自己读写 db.chats，通过 onUpdated
// 通知外层 ChatSettingsModal 去重新拉取 chat。
import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import db from '../../../db';
import { REPLY_LANGUAGE_OPTIONS } from './chatReplyLanguagePresets';
import {
  REPLY_LANGUAGE_UI_TEXT,
  REPLY_LANGUAGE_UI_DEFAULT_LANG,
} from './chatReplyLanguageUiText';
import { readStoredManualLang } from '../../manual/manualBlocks';

export const ChatReplyLanguageSettingsSection = ({ chat, onUpdated }) => {
  const [isBusy, setIsBusy] = useState(false);

  const currentId = chat?.replyLanguage || 'default';
  const learningModeIsOn = chat?.learningModeEnabled === true;

  const uiLang = readStoredManualLang();
  const ui = REPLY_LANGUAGE_UI_TEXT[uiLang] || REPLY_LANGUAGE_UI_TEXT[REPLY_LANGUAGE_UI_DEFAULT_LANG];

  const handlePick = async (languageId) => {
    if (!chat?.id || isBusy) return;

    const next = languageId || 'default';
    if (next === currentId) return;

    setIsBusy(true);

    try {
      await db.chats.update(chat.id, { replyLanguage: next });
      if (onUpdated) onUpdated({ replyLanguage: next });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className="space-y-2.5 p-3.5 rounded-2xl border w-full"
      style={{
        background: 'var(--control-soft-bg)',
        borderColor: 'var(--card-border)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold">
          <Globe className="w-3.5 h-3.5" />
          <span>{ui.title}</span>
        </div>
        <span className="font-mono text-[9px] opacity-45">
          {ui.badge}
        </span>
      </div>

      <p className="text-[10px] opacity-55 leading-relaxed">
        {ui.description}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {REPLY_LANGUAGE_OPTIONS.map((opt) => {
          const isActive = currentId === opt.id;
          const label = opt.nativeLabel || ui.defaultOptionLabel;

          return (
            <button
              key={opt.id}
              type="button"
              disabled={isBusy || learningModeIsOn}
              onClick={() => handlePick(opt.id)}
              className="p-2.5 rounded-xl border text-center font-medium transition-all text-[11px] active:scale-95 disabled:opacity-40"
              style={{
                background: isActive ? 'var(--accent-color)' : 'var(--bg-main)',
                borderColor: isActive ? 'var(--accent-color)' : 'var(--divider)',
                color: isActive ? 'var(--accent-foreground)' : 'var(--text-main)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {learningModeIsOn && (
        <p className="text-[10px]" style={{ color: 'var(--text-sub)' }}>
          {ui.learningModeHint}
        </p>
      )}
    </div>
  );
};

export default ChatReplyLanguageSettingsSection;