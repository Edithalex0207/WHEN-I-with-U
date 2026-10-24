// src/apps/location/characterPlaceDirective.js
//
// 角色"自主决定"分享自己去过的地方，对应角色地图功能。
// 写法跟 bubbleStyleDirective.js 一样的两段式：主聊天提示词里只留一句
// "想分享就写 [CHAR_PLACE_WANT]"，真正的格式说明（地名/评价/心情怎么写）
// 只在 characterPlaceSession.js 那次单独追加的调用里给，避免主提示词
// 变长——跟换气泡风格同一个理由、同一个解法。
//
// 跟气泡风格一样不设概率/冷却限制，角色自己判断要不要分享、多久分享
// 一次，完全相信模型自己的判断。

const CHAR_PLACE_WANT_PATTERN = /\s*\[CHAR_PLACE_WANT\]\s*/gi;

export const CHARACTER_PLACE_PROMPT_NOTE = `
【可选行为：分享你去过的地方】
就当你是一个有自己生活的真实的人：如果这次聊天让你想到自己最近去了/常去的某个地方（不需要和用户有关，可以完全是你自己的日常），可以在回复最后单独一行写 [CHAR_PLACE_WANT]（用户看不到这行，系统会马上单独问你具体是哪里、感觉怎么样）。不是每次都要写，想分享再分享。
`;

export const buildCharacterPlacePromptNote = () => CHARACTER_PLACE_PROMPT_NOTE;

/**
 * 从回复里取出 [CHAR_PLACE_WANT] 标签，一律从正文去掉（不管这次有没有
 * 生效）。返回 { content, wantsShare }。
 */
export const applyCharacterPlaceDirective = ({ content }) => {
  let wantsShare = false;

  const visibleContent = String(content || '')
    .replace(CHAR_PLACE_WANT_PATTERN, () => {
      wantsShare = true;
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { content: visibleContent, wantsShare };
};

export default {
  CHARACTER_PLACE_PROMPT_NOTE,
  buildCharacterPlacePromptNote,
  applyCharacterPlaceDirective,
};