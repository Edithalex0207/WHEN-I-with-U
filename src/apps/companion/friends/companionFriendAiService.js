/*
 * 好友广场 / 蹭饭 用到的 AI 调用，全部新建在这一个文件里，不往
 * companionAiService.js 里加（那边的 callCompanionAi 要带上完整的
 * buildChatSystemPrompt 人设，这里不需要——好友广场的 NPC 是纯虚构的
 * 小伙伴，跟用户自己的角色人设无关，所以这里自己写一个更轻量的直连
 * fetch，只读 db.settings 的 apiConfig，不读角色/聊天上下文）。
 *
 * 跟 companionAiService.js 一样的兜底原则：没配置 API、请求失败、或者
 * 返回的内容解析不出来，一律返回 null（批量生成则返回 []），调用方
 * （companionFriendService.js）负责退回本地兜底文案/规则，绝不让 AI
 * 调用失败影响到功能本身能不能用。
 */

import db from '../../../db';

const callFriendAi = async ({ systemPrompt, userLine, maxTokens = 400 }) => {
  try {
    const apiSettings = await db.settings.get('apiConfig');
    const apiConfig = apiSettings?.value || {};

    if (!apiConfig.baseUrl || !apiConfig.apiKey) {
      return null;
    }

    const baseUrl = apiConfig.baseUrl.replace(/\/$/, '');

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: apiConfig.model || 'gpt-3.5-turbo',
        temperature: 1,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userLine },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    const text = String(data?.choices?.[0]?.message?.content || '').trim();
    return text || null;
  } catch (error) {
    console.warn('[CompanionFriend] AI 调用失败，退回本地兜底:', error);
    return null;
  }
};

// 从模型回复里尽量抠出一个 JSON 数组/对象，容忍前后夹杂的废话或代码块围栏。
const extractJson = (text) => {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/gi, '').trim();
  const start = Math.min(
    ...['[', '{'].map((ch) => {
      const idx = cleaned.indexOf(ch);
      return idx === -1 ? Infinity : idx;
    })
  );
  const end = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
  if (!Number.isFinite(start) || end === -1 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (error) {
    return null;
  }
};

/*
 * 批量生成好友广场候选 NPC 的文字信息：名字 / 两个性格标签 / 交友宣言。
 * 不涉及头像——头像从 companionFriendAvatars.js 的头像池里另外抽。
 *
 * excludeNames：当前广场上已有的 + 已经是好友的名字，提示 AI 别重名；
 * 返回数组长度可能小于 count（AI 没给够就有几个用几个，调用方兜底补齐）。
 */
export const generateFriendCandidates = async (count, excludeNames = []) => {
  const systemPrompt = `你在帮一个"宠物社交广场"小程序生成虚构的 NPC 小伙伴资料，风格轻松可爱、像小动物一样说话，不涉及任何真实人物。
每个 NPC 需要：name（2 个字的可爱名字）、k1 和 k2（两个各 2-4 字的性格标签，比如"爱吃""怕生""话多"）、declaration（第一人称的"交友宣言"，1-2 句话，20 字以内，要体现性格，不要用省略号堆砌）。
${excludeNames.length > 0 ? `这些名字已经用过，不要重复：${excludeNames.join('、')}。` : ''}
只输出一个 JSON 数组，不要任何多余文字、不要代码块围栏，格式严格为：
[{"name":"","k1":"","k2":"","declaration":""}, ...]`;

  const reply = await callFriendAi({
    systemPrompt,
    userLine: `请生成 ${count} 个不重样的 NPC。`,
    maxTokens: 120 * count + 80,
  });

  const parsed = extractJson(reply);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item) => item && item.name && item.k1 && item.k2 && item.declaration)
    .map((item) => ({
      name: String(item.name).slice(0, 10),
      k1: String(item.k1).slice(0, 6),
      k2: String(item.k2).slice(0, 6),
      declaration: String(item.declaration).slice(0, 60),
    }));
};

/*
 * 好友申请的回复文案——同意或婉拒由调用方（companionFriendService.js）
 * 按规则先决定好（见 decideFriendRequestOutcome），这里只负责把"已经
 * 定好的结果"写成符合 NPC 性格、又呼应用户留言的一句话。
 */
export const generateFriendReplyText = async ({ npc, userNote, accepted }) => {
  const traits = `${npc?.k1 || ''}、${npc?.k2 || ''}`;
  const systemPrompt = `你在扮演一个虚构的宠物 NPC"${npc?.name || 'TA'}"，性格标签：${traits}，你的交友宣言是"${npc?.declaration || ''}"。
现在有另一只小伙伴向你发送了好友申请${userNote ? `，对方说："${userNote}"` : '，对方什么都没说'}。
${accepted
    ? '你决定同意这次交友申请。请用你自己的性格口吻写一句回复（25 字以内），表达愿意认识对方，可以呼应对方说的话。'
    : '你这次决定婉拒（不是绝交，只是还没准备好），请用委婉、不伤人的语气写一句回复（25 字以内），给对方留一点以后再试的余地。'}
不要提到"系统""AI""申请"这类词，不要加引号和表情符号。`;

  const reply = await callFriendAi({ systemPrompt, userLine: '请给出你的回复。', maxTokens: 100 });
  return reply || null;
};

/*
 * 朋友互动短文："聊天"（talk）或"串门"（visit）两种场景，描述小伙伴
 * 和这位朋友之间发生的一小段互动。送礼的反应文案走固定文案池（见
 * companionFriendService.js 的 GIFT_REACTION_TEXTS），不调这里。
 */
export const generateFriendInteractionStory = async ({ companionName, friend, mode }) => {
  const traits = `${friend?.k1 || ''}、${friend?.k2 || ''}`;
  const sceneText = mode === 'visit'
    ? `描述"${companionName}"去朋友"${friend?.name}"家串门玩耍的一小段经过`
    : `描述"${companionName}"和朋友"${friend?.name}"聊天/互动的一小段经过`;

  const systemPrompt = `你在给一个宠物社交小游戏写一小段旁白。朋友"${friend?.name}"的性格标签是：${traits}。
请${sceneText}，第三人称、温馨可爱的语气，25 字以内，不要加引号和表情符号。`;

  const reply = await callFriendAi({ systemPrompt, userLine: '请写这段旁白。', maxTokens: 100 });
  return reply || null;
};