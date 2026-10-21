/*
 * companionFriendStoryAiService.js —— 好友"互动聊天 / 串门"的长短文生成。
 *
 * 为什么单开一个文件：companionFriendAiService.js 里原来的
 * generateFriendInteractionStory 提示词写死了"25 字以内"、max_tokens 只有
 * 100，而且没有任何上下文，所以每次返回都差不多。这里换成带场景种子和
 * 上下文的长短文版本，原函数不动，只是 companionFriendService.js 不再
 * 调用它。底层的 callFriendAi 从 companionFriendAiService.js 导入
 * （该文件把它改成了命名导出），不重复写一遍 fetch。
 *
 * 跟原来一样的兜底原则：没配置 API、请求失败、内容太短，一律返回 null，
 * 由调用方（companionFriendService.js）退回本地兜底长文案。
 */

import { callFriendAi } from './companionFriendAiService';
import {
  MIN_STORY_CHARS,
  TARGET_STORY_CHARS_TEXT,
  pickSceneSeed,
  describeTimeOfDay,
  describeFriendshipStage,
  describeMood,
} from './companionFriendStoryData';

const STORY_MAX_TOKENS = 700;
const STORY_HARD_CAP_CHARS = 300;
const STORY_SOFT_FLOOR_CHARS = 60; // 重试后仍低于这个长度就放弃，退回兜底

const charCount = (text) => Array.from(text || '').length;

// 清理模型输出：去代码围栏/首尾引号，合并成一整段，过长时在句号处截断。
const cleanStory = (raw) => {
  if (!raw) return '';
  let text = String(raw)
    .replace(/```[a-z]*|```/gi, '')
    .replace(/\s*\n+\s*/g, '')
    .trim();
  text = text.replace(/^["“”']+|["“”']+$/g, '').trim();

  if (charCount(text) > STORY_HARD_CAP_CHARS) {
    const chars = Array.from(text).slice(0, STORY_HARD_CAP_CHARS).join('');
    const lastStop = Math.max(chars.lastIndexOf('。'), chars.lastIndexOf('！'), chars.lastIndexOf('？'));
    text = lastStop > STORY_HARD_CAP_CHARS * 0.5 ? chars.slice(0, lastStop + 1) : chars;
  }
  return text;
};

const buildSystemPrompt = ({ petName, friend, mode, seed, timeOfDay, stage, moodText, lastStoryText }) => {
  const traits = `${friend?.k1 || ''}、${friend?.k2 || ''}`;
  const sceneKind = mode === 'visit'
    ? `"${petName}"去朋友"${friend?.name}"家里串门`
    : `"${petName}"和朋友"${friend?.name}"在一起聊天、互动`;

  return `你在给一个宠物社交小游戏写一段互动短文，主角是小伙伴"${petName}"，配角是它的朋友"${friend?.name}"。
朋友的性格标签是：${traits}${friend?.declaration ? `，它的交友宣言是"${friend.declaration}"` : ''}。
这次要写的是：${sceneKind}。
时间是${timeOfDay}，"${petName}"现在${moodText}，两个人${stage}。
这次的场景起点：${seed}。请从这个起点自然展开，不要照搬字面，可以加入你自己的小细节。
${lastStoryText ? `它们上一次互动写过："${lastStoryText}"。这次不要重复上一次的场景、动作和结尾。` : ''}

写作要求：
1. 第三人称，温馨可爱，像小动物之间的日常，不涉及真实人物。
2. 长度${TARGET_STORY_CHARS_TEXT}，硬性要求不少于 ${MIN_STORY_CHARS} 字。
3. 有一个具体的小事件，有开头、经过和一个轻轻收住的结尾；至少包含一两句简短的对话，对话用中文双引号。
4. 两只的反应要贴合各自的性格，朋友的说话方式要体现它的性格标签。
5. 只输出一整段正文，不分行、不加标题、不加引号包裹全文，不使用表情符号，不出现"系统""AI""任务"这类词。`;
};

/*
 * 生成一段互动/串门长短文。
 *
 * args:
 *   companion  小伙伴对象（用到 name / mood）
 *   friend     朋友对象（用到 name / k1 / k2 / declaration / friendship / lastStory）
 *   mode       'talk' | 'visit'
 *
 * 返回字符串（至少 STORY_SOFT_FLOOR_CHARS 字），拿不到可用内容时返回 null。
 * 第一次不足 MIN_STORY_CHARS 字时，会把这一版带上再让模型扩写一次，
 * 最多额外多一次调用。
 */
export const generateFriendStory = async ({ companion, friend, mode }) => {
  const petName = companion?.name || '小伙伴';
  const systemPrompt = buildSystemPrompt({
    petName,
    friend,
    mode,
    seed: pickSceneSeed(mode),
    timeOfDay: describeTimeOfDay(),
    stage: describeFriendshipStage(friend?.friendship),
    moodText: describeMood(companion?.mood),
    lastStoryText: friend?.lastStory?.text ? String(friend.lastStory.text).slice(0, 200) : '',
  });

  const first = cleanStory(await callFriendAi({
    systemPrompt,
    userLine: '请写这段互动。',
    maxTokens: STORY_MAX_TOKENS,
  }));

  if (charCount(first) >= MIN_STORY_CHARS) return first;
  if (!first) return null;

  // 太短：带上第一版，让模型在原有内容上扩写，而不是重新写一个。
  const second = cleanStory(await callFriendAi({
    systemPrompt,
    userLine: `你上一次写的内容只有 ${charCount(first)} 字，太短了：\n${first}\n\n请在这段内容的基础上扩写，补充更多动作、神态和对话，总长度写到 130 到 180 字，仍然只输出一整段正文。`,
    maxTokens: STORY_MAX_TOKENS,
  }));

  const best = charCount(second) >= charCount(first) ? second : first;
  return charCount(best) >= STORY_SOFT_FLOOR_CHARS ? best : null;
};