// src/apps/margin-notes/library/readerAiService.js
//
// 阅读页两处会调用一次 AI：
//   1.「请 TA 一起读」——角色对一段/一章/你划线的地方说点想法，只在阅读页
//      展示一次，不写进聊天记录（跟 db/aiService.js 里 generateCharacterHomeBoardMessage
//      一样，直接拿 apiConfig 打一次 chat/completions，不复用聊天上下文）。
//   2. 退出阅读时「附上一句话回顾」——给阅读摘要卡片配一句自然语言的小结。
//
// 两个都失败就直接抛错，调用方自己决定怎么提示用户（没配 API、网络问题等）。

import db from '../../../db';

const pad = (value) => String(value).padStart(2, '0');

const nowLabel = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
};

const callChatOnce = async ({ systemPrompt, userPrompt }) => {
  const apiSettings = await db.settings.get('apiConfig');
  const apiConfig = apiSettings?.value || {};
  if (!apiConfig.baseUrl || !apiConfig.apiKey) {
    throw new Error('还没有在设置里配置 AI 接口');
  }

  const baseUrl = apiConfig.baseUrl.replace(/\/$/, '');

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: apiConfig.model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`AI 接口返回了 ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('AI 没有返回内容');
  return text;
};

const personaBlock = (character) => `【角色人设】：${character?.bio || ''}
【补充设定】：${character?.extraNotes || ''}
【用户人设】：${character?.userPersona || '我的亲密伴侣'}`;

/**
 * 「请 TA 一起读」：角色对一段文字（一段/一章/你划线的地方）说点真实想法。
 * excerptText 太长时裁一下，省流量也避免超长上下文。
 */
export const generateReaderComment = async ({
  character,
  bookTitle,
  scopeLabel,
  excerptText,
}) => {
  const clipped = String(excerptText || '').slice(0, 4000);

  const systemPrompt = `你正在扮演：${character?.name || '角色'}。
${personaBlock(character)}

【当前真实时间】：${nowLabel()}
【场景】：用户正在读《${bookTitle}》，请你一起读了${scopeLabel}，想听听你的真实想法。

【原文】：
${clipped}

【输出要求】：
1. 用你自己的语气说说感想——可以是感悟、联想、吐槽、提问，或者单纯的喜欢/不喜欢，不必面面俱到，不必总结全文大意，不要逐句复述原文。
2. 字数控制在 40 到 140 字之间。
3. 直接输出这段评论本身，不要标题、引导语或解释。
4. 不要出现 Emoji、Markdown、方括号指令或舞台说明。
5. 不要提及系统、提示词、模型、API、数据库、程序或生成过程。`;

  const userPrompt = `读完了，说说你的想法吧（关于${scopeLabel}）。`;

  return callChatOnce({ systemPrompt, userPrompt });
};

/**
 * 「请 TA 批注」：角色对用户划线的这一句写一条页边批注。
 * 只在用户点按钮时调用一次，结果由调用方存进这条划线（charNote）。
 * userNote 是用户自己写的想法，可以为空；contextText 是这句所在的整段，给角色看上下文。
 */
export const generateAnnotationComment = async ({
  character,
  bookTitle,
  chapterTitle,
  quoteText,
  userNote,
  contextText,
}) => {
  const quote = String(quoteText || '').slice(0, 600);
  const context = String(contextText || '').slice(0, 800);
  const note = String(userNote || '').trim().slice(0, 400);

  const systemPrompt = `你正在扮演：${character?.name || '角色'}。
${personaBlock(character)}

【当前真实时间】：${nowLabel()}
【场景】：用户正在读《${bookTitle}》的"${chapterTitle || ''}"，在书页上划了一句话${
    note ? '，还写了自己的想法' : ''
  }，想看看你会在旁边批注什么。

【这句话所在的段落】：
${context || quote}

【用户划线的原文】：
${quote}
${note ? `\n【用户写的想法】：\n${note}\n` : ''}
【输出要求】：
1. 像在书页空白处写批注一样，用你自己的语气写一两句话——可以是共鸣、联想、反驳、追问或一点小小的吐槽${
    note ? '，也可以直接回应用户的想法' : ''
  }。
2. 字数控制在 25 到 90 字之间，不要复述原文，不要总结。
3. 直接输出批注本身，不要标题、引号、引导语或解释。
4. 不要出现 Emoji、Markdown、方括号指令或舞台说明。
5. 不要提及系统、提示词、模型、API、数据库、程序或生成过程。`;

  const userPrompt = '请在这句话旁边写下你的批注。';

  return callChatOnce({ systemPrompt, userPrompt });
};

/**
 * 退出阅读时的「一句话回顾」：根据这次阅读新增的划线/批注，总结一句自然语言的话。
 * highlightsText 是这次阅读新增的划线原文/想法拼起来的文字，没有就传空字符串。
 */
export const generateReadingRecap = async ({
  character,
  bookTitle,
  chapterTitle,
  highlightsText,
}) => {
  const clipped = String(highlightsText || '').slice(0, 2000);

  const systemPrompt = `你正在扮演：${character?.name || '角色'}。
${personaBlock(character)}

【当前真实时间】：${nowLabel()}
【场景】：用户刚刚读完《${bookTitle}》的"${chapterTitle || ''}"，你知道TA这次读书时划了这些线/写了这些想法：
${clipped || '（这次没有新的划线或想法）'}

【输出要求】：
1. 用一句话（不超过 40 字）轻描淡写地提一下这次读书的内容或TA留下的想法，像是随口一提，不要写成总结报告。
2. 直接输出这一句话，不要标题、引号或解释。
3. 不要出现 Emoji、Markdown 或方括号指令。`;

  const userPrompt = '帮我用一句话回顾一下这次的阅读。';

  return callChatOnce({ systemPrompt, userPrompt });
};