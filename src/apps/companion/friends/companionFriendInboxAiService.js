/*
 * companionFriendInboxAiService.js —— "收到的申请"用到的两个 AI 调用。
 *
 * 1. generateInboxApplicant：生成一位主动来申请的小动物（名字 / 两个性格
 *    标签 / 交友宣言 / 这次写在信里的话），一次调用全部拿到。
 * 2. generatePetDecisionReply：用户选了"交给小伙伴决定"之后，由本地规则
 *    先定好同意还是婉拒（见 companionFriendInboxService.js），这里只负责把
 *    结果写成小伙伴对这只小动物说的一句话。
 *
 * 底层直连 fetch 复用 companionFriendAiService.js 导出的 callFriendAi，
 * 不重复写。兜底原则跟那边一样：没配置 API / 请求失败 / 解析不出来，一律
 * 返回 null，由 companionFriendInboxService.js 退回本地兜底，绝不影响功能。
 */

import { callFriendAi } from './companionFriendAiService';

const extractJsonObject = (text) => {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (error) {
    return null;
  }
};

/*
 * excludeNames：已经是好友 / 在广场上 / 信箱里已有的名字，提示别重名。
 * styleExamples：几条风格参考（只学口吻，不许照抄）。
 * 返回 { name, k1, k2, declaration, message } 或 null。
 */
export const generateInboxApplicant = async ({ petName, excludeNames = [], styleExamples = [] }) => {
  const exampleLines = (Array.isArray(styleExamples) ? styleExamples : [])
    .filter((item) => item && item.name && item.k1 && item.k2 && item.declaration)
    .map((item) => `${item.name}（${item.k1}、${item.k2}）："${item.declaration}"`);

  const systemPrompt = `你在帮一个"宠物社交广场"小程序生成一只主动来申请做朋友的虚构小动物，风格轻松可爱、像小动物一样说话，不涉及任何真实人物。
这只小动物想认识一只叫"${petName || '小伙伴'}"的小动物，会写一封短信。
需要的字段：
name：2 个字的可爱名字；
k1、k2：两个各 2-4 字的性格标签；
declaration：第一人称的交友宣言，20 字以内；
message：它写给"${petName || '小伙伴'}"的信，第一人称，30 到 60 字，要体现性格，要有一个具体的小细节（比如它看到了什么、带了什么、为什么想认识对方），不要只说"想和你做朋友"。
${excludeNames.length > 0 ? `这些名字已经用过，不要重复：${excludeNames.join('、')}。` : ''}
${exampleLines.length > 0 ? `下面是几个风格参考，只学口吻，名字、标签、宣言和信的内容都不要照抄：\n${exampleLines.join('\n')}` : ''}
不要使用表情符号。只输出一个 JSON 对象，不要任何多余文字、不要代码块围栏，格式严格为：
{"name":"","k1":"","k2":"","declaration":"","message":""}`;

  const reply = await callFriendAi({ systemPrompt, userLine: '请生成这只小动物和它的信。', maxTokens: 400 });
  const parsed = extractJsonObject(reply);
  if (!parsed || !parsed.name || !parsed.k1 || !parsed.k2 || !parsed.declaration || !parsed.message) return null;

  return {
    name: String(parsed.name).slice(0, 10),
    k1: String(parsed.k1).slice(0, 6),
    k2: String(parsed.k2).slice(0, 6),
    declaration: String(parsed.declaration).slice(0, 60),
    message: String(parsed.message).slice(0, 120),
  };
};

/*
 * 小伙伴对来申请的小动物说的一句话。accepted 是本地规则已经定好的结果。
 */
export const generatePetDecisionReply = async ({ petName, applicant, accepted }) => {
  const traits = `${applicant?.k1 || ''}、${applicant?.k2 || ''}`;
  const systemPrompt = `你在扮演一只叫"${petName || '小伙伴'}"的小动物。一只叫"${applicant?.name || 'TA'}"的小动物（性格：${traits}）给你寄了一封信，信里说："${applicant?.message || ''}"
${accepted
    ? '你决定答应做朋友。请用小动物的口吻回一句话（30 字以内），呼应它信里的某个细节，让它感到被认真读过。'
    : '你这次决定先婉拒（不是讨厌它，只是还没准备好）。请用委婉、不伤人的语气回一句话（30 字以内），呼应它信里的某个细节，给它留一点以后再见的余地。'}
不要提到"系统""AI""申请"这类词，不要加引号和表情符号。`;

  const reply = await callFriendAi({ systemPrompt, userLine: '请写这句回复。', maxTokens: 120 });
  return reply ? String(reply).replace(/^["“”']+|["“”']+$/g, '').trim().slice(0, 80) : null;
};