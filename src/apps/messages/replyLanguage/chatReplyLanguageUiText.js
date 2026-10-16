// src/apps/messages/replyLanguage/chatReplyLanguageUiText.js
//
// "回复语言"设置区块本身的界面文案（标题/说明/默认选项文字/提示语），
// 按 zh / en / ko 三语分层存放——跟 manualContent.js 的 MANUAL_UI_TEXT
// 是同一个做法：文案单独放一个文件，组件只管渲染，不在组件代码里写死
// 任何具体文字。
//
// 这里不新建一套"当前界面语言"状态，直接复用说明书（Manual）已经在用的
// 那一份 —— readStoredManualLang()（定义在 manualBlocks.jsx，存在
// localStorage 的 wiwu-manual-lang 这个key下）。这是目前全项目唯一的
// "用户选过的界面语言"记录，设置弹窗这种小区块没必要再单独做一个语言
// 切换按钮，静默跟随这个值就行；用户还没去说明书选过语言时，就跟说明书
// 自己一样落回中文默认值。

export const REPLY_LANGUAGE_UI_TEXT = {
  zh: {
    title: '回复语言',
    badge: 'REPLY LANGUAGE',
    description:
      '选一种语言后，角色接下来在这个聊天里会直接用这种语言回复正文，不会附带中文翻译。只影响这一个聊天窗，人设、语气和回复逻辑都不受影响。',
    defaultOptionLabel: '默认（不改变）',
    learningModeHint:
      '语言学习模式开启中，角色回应语言由语言学习模式自己的设置决定，这里暂时不生效；关闭语言学习模式后会自动恢复。',
  },
  en: {
    title: 'Reply Language',
    badge: 'REPLY LANGUAGE',
    description:
      "Pick a language and the character's replies in this chat will be written directly in it, with no Chinese translation attached. This only affects this one chat — persona, tone and reply logic stay the same.",
    defaultOptionLabel: 'Default (unchanged)',
    learningModeHint:
      'Learning Mode is on for this chat, so it controls the reply language instead — this setting is paused until Learning Mode is turned off.',
  },
  ko: {
    title: '답장 언어',
    badge: 'REPLY LANGUAGE',
    description:
      '언어를 선택하면 이 채팅방에서 캐릭터가 앞으로 본문을 해당 언어로 바로 답장합니다. 중국어 번역은 따로 붙지 않습니다. 이 채팅방에만 적용되며, 캐릭터의 설정·말투·답장 로직은 그대로입니다.',
    defaultOptionLabel: '기본값 (변경 안 함)',
    learningModeHint:
      '언어 학습 모드가 켜져 있어 답장 언어는 학습 모드 설정을 따릅니다. 이 설정은 학습 모드를 끄면 다시 적용됩니다.',
  },
};

export const REPLY_LANGUAGE_UI_DEFAULT_LANG = 'zh';