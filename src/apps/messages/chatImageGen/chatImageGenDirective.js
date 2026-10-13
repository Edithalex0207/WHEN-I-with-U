// src/apps/messages/chatImageGen/chatImageGenDirective.js
//
// 聊天里"AI自主触发真实生图"的系统提示词说明。
// 跟旧的 [IMAGE: ...] 标签（纯文字的拟物拍立得卡片，aiService.js 里
// parseAiResponseToMessages 直接生成 ImageCard.jsx 那种占位卡）完全独立：
// 这里新增 [GENIMAGE: ...]，会真的调用生图室的生成流程
// （chatImageGenService.js）出一张真图，不是文字描述。
//
// 只有这个聊天窗自己开启了"AI自动生图"开关（chat.aiAutoImageGenEnabled），
// 并且生图室的后端配置填完整了，才会把这段说明塞进系统提示词——两个条件
// 任一不满足，AI 完全不会被告知有这个标签，不会出现"写了标签但其实生成
// 不出来"的情况。
//
// 没有冷却/频率限制（跟戳一戳"不加限制"的惯例一致，是否要开这条口子由
// 用户自己在聊天设置里决定），但 NovelAI 后端下 chatImageGenService.js
// 会强制夹到免费额度、不消耗用户的 Anlas 储备——这是代码里做的安全兜底，
// 不需要在这段提示词里告诉 AI。

import { getImageGenConfig } from '../../imagestudio/imageGenConfigService';
import { getMissingConfigItems } from '../../imagestudio/imageGenRequest';

export const buildChatImageGenPromptNote = async (chat) => {
  if (!chat?.aiAutoImageGenEnabled) return '';

  const config = await getImageGenConfig();
  if (getMissingConfigItems(config).length > 0) return '';

  const guide = String(chat?.aiImageGenPromptGuide || '').trim();

  return `
【可选：真实生图】
这个聊天窗开启了真实生图——跟其它"拟物卡片"不一样，下面这个标签会真的
调用生图接口，生成一张真实图片发给用户，不是占位描述：
[GENIMAGE: 画面内容的详细描述]
- 只在你确实想让用户"看见"此刻画面时使用，不要每条回复都用，正常聊天
  就好，你自己判断合适的时机，没有次数或冷却限制。
- 描述里把构图、动作、场景、光线氛围等画面细节写清楚；如果角色或用户
  都没有预先填写外貌设定，你可以直接在这段描述里把长相、穿着也写进去。${
    guide ? `\n- 这个聊天对生图文字还有额外要求：${guide}` : ''
  }
`;
};

export default { buildChatImageGenPromptNote };