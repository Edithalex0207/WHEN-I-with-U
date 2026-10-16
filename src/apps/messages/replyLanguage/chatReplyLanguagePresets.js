// src/apps/messages/replyLanguage/chatReplyLanguagePresets.js
//
// 聊天室"回复语言"预设注册表：和语言学习模式（learningMode/）不是一回事——
// 这里不做双语对照、不打印[TRANSLATE: ...]翻译标签，单纯让AI直接用目标
// 语言输出正文，跟换了个人设语言习惯一样简单。
//
// 每个聊天室各自选自己的语言，存在 chat.replyLanguage 字段上（未设置/
// 空字符串/找不到对应预设时都按 'default' 处理，即维持原来的中文行为，
// 不需要为老数据做迁移，也不需要升级 db.version）。
//
// 以后要继续加新语言，只需要在下面 REPLY_LANGUAGE_PRESETS 里新增一项，
// 不用改这个文件以外的任何东西——ChatReplyLanguageSettingsSection 的
// 选择器和 aiService.js 的系统提示词拼装都是照着这个表遍历/查找的。

const makeInstruction = (languageName) =>
  `你接下来在这个聊天里的所有正文回复，必须完全使用${languageName}书写，不要使用中文，也不要中文和${languageName}混杂、不要额外附带中文翻译或注释。这只是换一种语言表达，不改变你的人设、语气、情绪或回复逻辑，卡片指令（如[TRANSFER: ...]、[IMAGE: ...]等）本身的方括号语法和参数格式不受影响，只有你自己写的正文部分要用${languageName}。`;

export const REPLY_LANGUAGE_PRESETS = {
  default: {
    label: '默认（不改变）',
    nativeLabel: '',
    // 维持原来的语言习惯，不追加任何指令。
    instruction: '',
  },
  ko: {
    label: '韩语',
    nativeLabel: '한국어',
    instruction: makeInstruction('韩语（한국어）'),
  },
  fr: {
    label: '法语',
    nativeLabel: 'Français',
    instruction: makeInstruction('法语（Français）'),
  },
  it: {
    label: '意大利语',
    nativeLabel: 'Italiano',
    instruction: makeInstruction('意大利语（Italiano）'),
  },
};

// 按钮上显示的文字优先用目标语言自己的本名（한국어/Français/Italiano），
// 这样不管界面当前是中/英/韩哪种语言，这几个按钮看起来都一样清楚——
// 真正需要跟着界面语言换的只有"默认"这一项，交给调用方（UI组件）
// 从 chatReplyLanguageUiText.js 里按当前界面语言取 defaultOptionLabel。
export const REPLY_LANGUAGE_OPTIONS = Object.entries(REPLY_LANGUAGE_PRESETS)
  .map(([id, preset]) => ({ id, nativeLabel: preset.nativeLabel }));

// 开启了语言学习模式的聊天，角色回应语言已经由学习模式自己的设置
// （chat.learningReplyLanguage）接管，这里的"回复语言"设置先让位，
// 避免两套指令同时出现在系统提示词里互相矛盾。学习模式关闭后，这里的
// 设置会自动恢复生效，不需要用户重新选一次。
export const buildReplyLanguagePromptBlock = (chat) => {
  if (chat?.learningModeEnabled) {
    return '';
  }

  const languageId = chat?.replyLanguage || 'default';
  const preset = REPLY_LANGUAGE_PRESETS[languageId] || REPLY_LANGUAGE_PRESETS.default;

  if (!preset.instruction) {
    return '';
  }

  return `
【回复语言设置（当前聊天窗已开启，优先级高于下面的常规语言习惯）】：
- ${preset.instruction}
`;
};