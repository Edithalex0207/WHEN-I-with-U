// src/apps/tripHome/tripPostcardService.js
//
// 回家的明信片（切片 C）：居民旅行回来（车票到站）后，按角色人设调一次
// AI，写出一张明信片，存在这趟车票记录（db.tripJourneys）的 postcard
// 字段上。postcard 不是索引字段，所以不需要升级数据库版本。
//
// postcard 的结构：
//   {
//     source: 'ai' | 'fallback',  // fallback 是没连上 AI 时的备用文字，可以重新生成
//     letter: string,             // 信的正文
//     caption: string,            // 风景照的一句话说明
//     story: string | null,       // 带了小雨伞且这趟下雨时的雨中小故事
//     friend: { animal, name, line } | null,  // 路上遇到的新朋友（只写在信里，不持久保存关系）
//     rainy: boolean,
//     hasExtraPhoto: boolean,     // 带了一次性相机：多一张「景色 + 小动物」合照
//     generatedAt: number,
//   }
//
// 这一次 AI 调用还会顺带回应留言板上待回应的用户留言（最多 3 条，见
// tripRoomService.js 的 claimPendingBoardPosts）。
//
// 并发：同一张车票同时只会有一个生成请求在跑（in-flight 表），界面和外壳
// 同时触发也不会重复调用 AI、重复回应留言。

import db from '../../db';
import {
  TRIP_FRIEND_CHANCE,
  TRIP_FRIEND_CHANCE_WITH_GUIDE,
  getTripItem,
} from './tripCatalog';
import { claimPendingBoardPosts, finishBoardPosts, releaseBoardPosts } from './tripRoomService';
import { getJourney, saveJourneyPostcard } from './tripService';

const REQUEST_TIMEOUT_MS = 45 * 1000;
const MAX_REPLIES = 3;
const HOUR_MS = 60 * 60 * 1000;

const removeEmoji = (text = '') =>
  String(text)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .trim();

const clip = (value, max) => removeEmoji(value == null ? '' : value).slice(0, max);

// 把一趟旅行整理成生成用的上下文：目的地、时长、天气、行李，以及行李里
// 的道具带来的效果（相机/雨伞/指南）。
const describeJourney = (journey, rng = Math.random) => {
  const items = ['food', 'prop', 'gift'].map((slot) => getTripItem(journey.luggage?.[slot]));
  const [food, prop, gift] = items;
  const effects = items.filter(Boolean).map((item) => item.effectKey);

  const hasCamera = effects.includes('extra_photo');
  const hasUmbrella = effects.includes('rain_story');
  const hasGuide = effects.includes('more_friends');
  const rainy = !!journey.rainy;
  const hours = Math.max(0.1, Math.round(((journey.arriveAt - journey.departAt) / HOUR_MS) * 10) / 10);

  const friendChance = hasGuide ? TRIP_FRIEND_CHANCE_WITH_GUIDE : TRIP_FRIEND_CHANCE;

  return {
    destinationName: journey.destinationName || '远方',
    hours,
    rainy,
    hasCamera,
    wantsStory: rainy && hasUmbrella,
    wantsFriend: rng() < friendChance,
    food,
    prop,
    gift,
  };
};

const luggageText = (ctx) => {
  const parts = [];
  if (ctx.food) parts.push(`食物：${ctx.food.name}`);
  if (ctx.prop) parts.push(`道具：${ctx.prop.name}`);
  if (ctx.gift) parts.push(`小礼物：${ctx.gift.name}`);
  return parts.length > 0 ? parts.join('；') : '什么也没带，随便走走';
};

/* ---------- 备用明信片（没配置 AI 或生成失败时） ---------- */

const buildFallbackPostcard = (ctx) => ({
  source: 'fallback',
  letter: `我到${ctx.destinationName}啦。${ctx.rainy ? '路上下了点雨，' : ''}在外面待了大概 ${ctx.hours} 小时，一切都好。等我回去，慢慢讲给你听。`,
  caption: ctx.destinationName,
  story: null,
  friend: null,
  rainy: ctx.rainy,
  hasExtraPhoto: ctx.hasCamera,
  generatedAt: Date.now(),
});

/* ---------- 提示词 ---------- */

const buildSystemPrompt = ({ character, animalPersona, ctx, userName, claimed }) => {
  const rules = [];

  if (ctx.wantsStory) {
    rules.push('- 因为带了小雨伞、这趟又下了雨，story 要写一小段雨中的小故事，60 到 120 个汉字。');
  }

  if (ctx.wantsFriend) {
    const giftLine = ctx.gift ? `你把「${ctx.gift.name}」送给了这位朋友，请在 line 里自然地带过。` : '';
    rules.push(`- 路上遇到了一位新朋友（一只小动物），friend 要给出它的动物种类、名字，以及一句你和它之间发生的事。${giftLine}`);
  }

  if (claimed.length > 0) {
    const list = claimed.map((post) => `  id=${post.id}：${String(post.text || '').slice(0, 120)}`).join('\n');
    rules.push(`- ${userName}在小屋的留言板上留了下面几句话，请你用自己的口吻各回应一句（每句不超过 30 个汉字），放进 replies，id 要和下面对应：\n${list}`);
  }

  return `你正在扮演角色：${character.name}。

角色设定：
${character.bio || '无'}

补充设定：
${character.extraNotes || '无'}

变成小动物后的样子和习惯：
${animalPersona || '无'}

对方（用户）的称呼：${userName}
对方的设定：${character.userPersona || '无'}

背景：你住在${userName}的"旅行小屋"里，是一只小动物的模样。你刚结束一趟旅行回到小屋，现在要给${userName}写一张明信片，讲讲这一趟的见闻。

这一趟的情况：
- 目的地：${ctx.destinationName}
- 在外面大约 ${ctx.hours} 小时
- 天气：${ctx.rainy ? '下雨' : '晴天'}
- 带的东西：${luggageText(ctx)}
${rules.join('\n')}

输出要求：只输出一个合法 JSON 对象，形如
{"letter":"...","caption":"...","story":null,"friend":null,"replies":[]}
- letter：明信片正文，80 到 160 个汉字，第一人称，直接对${userName}说话，语气符合人设，写具体的见闻和心情，不要写成流水账；
- caption：给风景照片配的一句话，8 到 20 个汉字；
- story：${ctx.wantsStory ? '雨中的小故事（字符串）' : '填 null'}；
- friend：${ctx.wantsFriend ? '{"animal":"动物种类，1 到 4 个字","name":"名字，1 到 4 个字","line":"一句话，不超过 40 个汉字"}' : '填 null'}；
- replies：${claimed.length > 0 ? '形如 [{"id":数字,"text":"..."}]' : '填 []'}。
其余要求：不使用 Emoji；不要输出 Markdown、代码块围栏或任何多余说明；不要提到自己是 AI。`;
};

const parseJsonObject = (rawText) => {
  const cleaned = String(rawText || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return JSON.parse(cleaned.slice(start, end + 1));
};

const requestPostcardJson = async (apiConfig, systemPrompt, userName) => {
  const baseUrl = String(apiConfig.baseUrl).replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: apiConfig.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请写给${userName}的这张明信片，直接输出 JSON。` },
        ],
        temperature: 0.9,
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    return parseJsonObject(data?.choices?.[0]?.message?.content || '');
  } finally {
    clearTimeout(timer);
  }
};

// 把 AI 返回的 JSON 收拾成 postcard + 留言回应。格式不对（信太短之类）返回 null，
// 调用方会改用备用明信片。
const normalizeResult = (raw, ctx, claimed) => {
  if (!raw || typeof raw !== 'object') return null;

  const letter = clip(raw.letter, 400);
  if (letter.length < 20) return null;

  const story = ctx.wantsStory ? clip(raw.story, 400) : '';

  let friend = null;
  if (ctx.wantsFriend && raw.friend && typeof raw.friend === 'object') {
    const candidate = {
      animal: clip(raw.friend.animal, 8),
      name: clip(raw.friend.name, 10),
      line: clip(raw.friend.line, 80),
    };
    if (candidate.animal && candidate.line) friend = candidate;
  }

  const claimedIds = new Set(claimed.map((post) => post.id));
  const seen = new Set();
  const replies = [];
  (Array.isArray(raw.replies) ? raw.replies : []).forEach((reply) => {
    const postId = Number(reply?.id);
    const text = clip(reply?.text, 60);
    if (!claimedIds.has(postId) || seen.has(postId) || !text) return;
    seen.add(postId);
    replies.push({ postId, text });
  });

  return {
    postcard: {
      letter,
      caption: clip(raw.caption, 30) || ctx.destinationName,
      story: story.length >= 10 ? story : null,
      friend,
      rainy: ctx.rainy,
      hasExtraPhoto: ctx.hasCamera,
    },
    replies,
  };
};

/* ---------- 对外：确保这趟车票有明信片 ---------- */

const generatePostcard = async (journeyId, { force }) => {
  const journey = await getJourney(journeyId);
  if (!journey) return { ok: false, reason: 'no_journey' };

  const existing = journey.postcard;
  // 已经有 AI 写的明信片就不再重写；只有备用文字可以强制重新生成。
  if (existing && !(force && existing.source === 'fallback')) {
    return { ok: true, postcard: existing, existed: true };
  }

  const resident = await db.tripResidents.get(journey.residentId);
  const character = resident && resident.characterId != null ? await db.characters.get(resident.characterId) : null;
  const ctx = describeJourney(journey);

  const storeFallback = async () => {
    const postcard = buildFallbackPostcard(ctx);
    await saveJourneyPostcard(journeyId, postcard);
    return { ok: true, postcard, fallback: true };
  };

  const apiSetting = await db.settings.get('apiConfig');
  const apiConfig = apiSetting?.value || {};
  if (!character || !apiConfig.baseUrl || !apiConfig.apiKey) return storeFallback();

  const userName = String(character.userName || '').trim() || '对方';
  let claimed = [];
  let result = null;

  try {
    claimed = await claimPendingBoardPosts(journeyId, MAX_REPLIES);
    const systemPrompt = buildSystemPrompt({
      character,
      animalPersona: resident?.animalPersona,
      ctx,
      userName,
      claimed,
    });
    const raw = await requestPostcardJson(apiConfig, systemPrompt, userName);
    result = normalizeResult(raw, ctx, claimed);
  } catch (error) {
    console.warn('[TripPostcard] 明信片生成失败，先用备用文字顶上。', error);
  }

  if (!result) {
    if (claimed.length > 0) {
      try {
        await releaseBoardPosts(claimed);
      } catch (error) {
        console.warn('[TripPostcard] 归还留言失败。', error);
      }
    }
    return storeFallback();
  }

  const postcard = { ...result.postcard, source: 'ai', generatedAt: Date.now() };
  await saveJourneyPostcard(journeyId, postcard);

  // 留言回应是顺带的：这一步出错不能把已经写好的明信片搞丢，留言放回待回应。
  try {
    await finishBoardPosts(claimed, result.replies, { residentId: resident.id, journeyId });
  } catch (error) {
    console.warn('[TripPostcard] 写入留言回应失败，留言放回待回应。', error);
    try {
      await releaseBoardPosts(claimed);
    } catch (releaseError) {
      console.warn('[TripPostcard] 归还留言失败。', releaseError);
    }
  }

  return { ok: true, postcard };
};

const inflight = new Map();

// 确保这趟车票有明信片：已经有就直接返回；没有就生成一次并存好。
// options.force 为 true 时，只有「备用文字」的明信片会被重新生成。
export const ensureJourneyPostcard = (journeyId, options = {}) => {
  if (inflight.has(journeyId)) return inflight.get(journeyId);

  const task = generatePostcard(journeyId, { force: !!options.force }).finally(() => {
    inflight.delete(journeyId);
  });
  inflight.set(journeyId, task);
  return task;
};
