import Dexie from 'dexie';
import db from '../../db';
import { BUILTIN_PARTS, COLOR_GROUPS, STANDARD_BODY } from './pixelDollParts';
import {
  applyGiftToLook,
  describeGift,
  getPartPool,
  validatePartData,
} from './pixelDollEngine';

// ============================================================
// 像素衣橱 —— AI 部分。三件事：
//   1. decideGiftReaction：用户送了角色一件礼物，角色按人设决定穿不穿，
//      并说一句话。
//   2. chooseGiftForUser：角色挑一件送给用户。force 为 true 时一定要挑
//      （用户点了"让 TA 挑一件"），为 false 时 AI 可以选择这次什么都不做
//      （给调度器用，大多数时候不打扰）。
//   3. designPixelDollBody：让 AI 设计小人的身体。who 为 'char' 是角色设计
//      自己，为 'user' 是 AI 帮用户设计。
//
// 跟 challengeService.js / diyAreaService.js 一样，直接对 apiConfig 发
// fetch，不 import aiService.js——避免 aiService.js 以后要读这里的东西时
// 绕出循环引用。所有函数失败时都返回 null / { ok:false }，调用方自己兜底，
// 不会因为 AI 接口没配好就让页面坏掉。
// ============================================================

const RECENT_HISTORY_LIMIT = 12;
const REQUEST_TIMEOUT_MS = 70000;

const callCompletion = async (systemPrompt, { temperature = 0.9 } = {}) => {
  const apiSetting = await db.settings.get('apiConfig');
  const apiConfig = apiSetting?.value || {};

  if (!apiConfig.baseUrl || !apiConfig.apiKey) return null;

  const baseUrl = String(apiConfig.baseUrl).replace(/\/$/, '');
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;

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
          { role: 'user', content: '请按照上面的要求执行。' },
        ],
        temperature,
      }),
      signal: controller ? controller.signal : undefined,
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.warn('[PixelDoll] AI 请求失败:', error);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const getHistoryText = async (chatId, character) => {
  const rows = await db.messages
    .where('[chatId+timestamp]')
    .between([chatId, Dexie.minKey], [chatId, Dexie.maxKey])
    .reverse()
    .limit(RECENT_HISTORY_LIMIT)
    .toArray()
    .then((list) => list.reverse());

  return rows
    .filter((message) => message.type === 'text' && message.content)
    .map((message) => `${message.sender === 'user' ? '用户' : character.name}: ${message.content}`)
    .join('\n');
};

const getUserInfo = async () => {
  const profile = (await db.profile.get(1)) || {};
  return { name: profile.name || '用户', bio: profile.bio || '' };
};

const characterBlock = (character) => `你正在扮演角色：${character.name}。

角色设定：
${character.bio || '无'}

补充设定：
${character.extraNotes || '无'}`;

/** 把一个外观整理成给 AI 看的一句话 */
export const describeLookText = (look, customParts) => {
  const nameOf = (category, id) => {
    const pool = getPartPool(category, customParts);
    return (pool[id] && pool[id].name) || id;
  };
  const body = look.body === 'standard' ? '标准身形' : nameOf('body', look.body);
  return `身形：${body}；发型：${nameOf('hair', look.hair)}；眼睛：${nameOf('eyes', look.eyes)}；衣着：${nameOf('outfit', look.outfit)}`;
};

const extractJsonObject = (text) => {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (error) {
    return null;
  }
};

/* ------------------------- 1. 角色决定穿不穿 ------------------------- */

const FALLBACK_WEAR = ['谢谢，我现在就换上。', '收到啦，穿上看看～'];
const FALLBACK_DECLINE = ['谢谢你，不过这次我先收着，下次再穿。'];
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

export const decideGiftReaction = async ({ chatId, character, giftLabel, charLook, customParts }) => {
  const fallback = () => {
    const accepted = Math.random() < 0.8;
    return { accepted, replyText: pickOne(accepted ? FALLBACK_WEAR : FALLBACK_DECLINE) };
  };

  if (!chatId || !character) return fallback();

  try {
    const [historyText, user] = await Promise.all([getHistoryText(chatId, character), getUserInfo()]);

    const prompt = `${characterBlock(character)}

最近的聊天内容（仅供参考语气和近况）：
${historyText || '（暂时没有聊天记录）'}

${user.name} 在你们共用的"像素衣橱"里，给你的像素小人送了一件礼物：「${giftLabel}」。
你的像素小人现在的样子：${describeLookText(charLook, customParts)}。

请按你的人设决定要不要把它穿上。大多数情况下，收到对方挑的东西你会愿意穿上；
只有这件东西明显不符合你的性格或喜好时，才婉拒（婉拒也要体面、不伤人）。

输出两行，不要有别的内容：
第 1 行只写 WEAR 或 DECLINE；
第 2 行是你对 ${user.name} 说的一句话，口语化、第一人称，不超过 40 个汉字，不加引号。`;

    const raw = await callCompletion(prompt, { temperature: 0.85 });
    if (!raw) return fallback();

    const lines = raw.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return fallback();

    const first = lines[0].toUpperCase();
    let accepted;
    if (first.includes('DECLINE')) accepted = false;
    else if (first.includes('WEAR')) accepted = true;
    else return fallback();

    const replyText = lines.slice(1).join(' ').replace(/^["“]/, '').replace(/["”]$/, '').trim().slice(0, 80);
    return { accepted, replyText: replyText || pickOne(accepted ? FALLBACK_WEAR : FALLBACK_DECLINE) };
  } catch (error) {
    console.warn('[PixelDoll] 角色决定穿不穿失败:', error);
    return fallback();
  }
};

/* ------------------------- 2. 角色挑一件送用户 ------------------------- */

const listPoolForPrompt = (category, customParts) => (
  Object.entries(getPartPool(category, customParts))
    .map(([id, part]) => `${id}（${part.name || id}）`)
    .join('、')
);

/**
 * 角色挑一件礼物送给用户。返回 { gift, note } 或 null（这次不送 / 失败）。
 * force 为 true 时 AI 必须挑一件；false 时 AI 可以回复 NO_ACTION。
 */
export const chooseGiftForUser = async ({ chatId, character, userLook, customParts, force = false }) => {
  if (!chatId || !character) return null;

  try {
    const [historyText, user] = await Promise.all([getHistoryText(chatId, character), getUserInfo()]);

    const colorLines = Object.entries(COLOR_GROUPS)
      .map(([key, group]) => `${key}（${group.label}）：${group.colors.join(' ')}`)
      .join('\n');

    const prompt = `${characterBlock(character)}

最近的聊天内容（仅供参考语气和近况）：
${historyText || '（暂时没有聊天记录）'}

你和 ${user.name} 在"像素衣橱"里互相给对方的像素小人送衣服。现在轮到你给 ${user.name} 的小人挑一件。
${user.name} 的小人现在的样子：${describeLookText(userLook, customParts)}。

可选的东西（只能从这里挑，id 要原样写）：
hair 发型：${listPoolForPrompt('hair', customParts)}
eyes 眼睛：${listPoolForPrompt('eyes', customParts)}
outfit 衣着：${listPoolForPrompt('outfit', customParts)}
color 配色（key 和可选颜色）：
${colorLines}

${force
    ? '请挑一件你觉得适合 TA、并且和现在不同的。'
    : '如果现在没有特别想送的理由，就只回复 NO_ACTION（这是大多数时候的正确回答）；有想送的再挑一件。'}

挑中后只输出一个 JSON，不要有别的内容，格式二选一：
{"category":"hair","id":"bun","note":"你想对 ${user.name} 说的一句话"}
{"category":"color","key":"outfitMain","value":"#ff8fab","note":"你想对 ${user.name} 说的一句话"}
note 用你的口吻、第一人称、口语化，不超过 40 个汉字。`;

    const raw = await callCompletion(prompt, { temperature: 0.9 });
    if (!raw || (/NO_ACTION/i.test(raw) && !raw.includes('{'))) return null;

    const parsed = extractJsonObject(raw);
    if (!parsed) return null;

    const gift = parsed.category === 'color'
      ? { category: 'color', key: parsed.key, value: parsed.value }
      : { category: parsed.category, id: parsed.id };

    // 只接受真的能穿上、并且和现在不一样的礼物，AI 写错 id 就当没挑
    const worn = applyGiftToLook(userLook, gift, customParts, 'user');
    if (JSON.stringify(worn) === JSON.stringify(userLook)) return null;
    if (!describeGift(gift, customParts)) return null;

    const note = String(parsed.note || '').trim().slice(0, 80);
    return { gift, note };
  } catch (error) {
    console.warn('[PixelDoll] 角色挑礼物失败:', error);
    return null;
  }
};

/* ------------------------- 3. AI 设计小人的身体 ------------------------- */

const buildFormatSpec = () => {
  const { lookHint, ...foxFields } = BUILTIN_PARTS.body.fox;
  const example = { ...foxFields, name: '小狐狸', look: lookHint };

  return `【格式说明】
小人画布是 16 列 × 20 行的像素。每一块图形写成 {"y": 起始行号, "rows": ["...", ...]}，
rows 里每个字符串最多 16 个字符，一个字符就是一个像素，"." 表示透明。
字符含义：o 描边（深色）  s 主色（皮肤/毛色）  S 主色的暗部  w 白色  p 粉色  n 深色（鼻子）
y 黄色  b 腮红  m 嘴巴  r 红色发饰。想用别的颜色，就在 palette 里自己定义新字符，
例如 "palette": {"x": "#5b8def"}，键必须是单个字符，值必须是 #rrggbb。

你要写的是"身体"。可以用到这些字段（都是可选的，但至少要有 base、back、front 之一）：
- base：整个身体。不写就用标准身体（见下面）。想要幽灵、团子这类不是人形的，就自己写 base。
- back：画在身体后面的东西，比如尾巴、翅膀。
- front：画在身体前面的东西，比如耳朵、犄角、口鼻。
- palette：自定义颜色字符。
- noHair：true 表示这个身体不戴发型（有自己的耳朵/头顶特征时用）。
- noOutfit：true 表示不穿衣服（幽灵、团子这类）。
- name：身形名字，不超过 8 个字。
- look：建议搭配的外观，可选，{"skin":"#rrggbb","eyes":"round|big|cat|dot|sleepy","outfit":"tee|hoodie|dress|overall|stripe","outfitMain":"#rrggbb","outfitAccent":"#rrggbb"}。

注意：
- 眼睛不要画，系统会在第 6 到 8 行自动画上眼睛，所以脸部区域要用主色 s 填满。
- 头大约在第 2 到 9 行，脚在第 16、17 行；整体不要超过第 20 行（y 加行数不能超过 20）。
- 剪影要左右大致对称，轮廓一圈用 o。

标准身体（供你对齐位置，y = ${STANDARD_BODY.y}）：
${JSON.stringify(STANDARD_BODY.rows)}

一个完整示例（小狐狸：耳朵放 front、尾巴放 back、不戴发型）：
${JSON.stringify(example)}`;
};

/**
 * 让 AI 设计身体。who 'char'：角色按自己的设定设计自己；'user'：AI 按用户
 * 的名字和简介帮用户设计。wish 是用户额外的一句要求（可不填）。
 * 返回 { ok:true, data } 或 { ok:false, error }。data 还没存库，要交给
 * pixelDollService.saveDesignedBody。会自动检查格式，不合格最多让 AI 改一次。
 */
export const designPixelDollBody = async ({ chatId, character, who, wish = '' }) => {
  if (!chatId || !character) return { ok: false, error: '缺少聊天信息' };

  try {
    const [historyText, user] = await Promise.all([getHistoryText(chatId, character), getUserInfo()]);
    const wishText = String(wish || '').trim().slice(0, 60);

    const subject = who === 'char'
      ? `${characterBlock(character)}

请为你自己设计像素小人的身体：要符合你的设定（物种、气质、标志性的特征）。设定里没有特别外形的话，
可以用标准身体，只加一两个小特征（耳朵、尾巴、发饰之类）。`
      : `你是一位像素画师，正在为一位用户设计他的像素小人的身体。

用户的名字：${user.name}
用户的简介：${user.bio || '无'}
你们的聊天对象（用户的伙伴）：${character.name}`;

    const basePrompt = `${subject}
${wishText ? `\n额外要求：${wishText}\n` : ''}
最近的聊天内容（仅供参考气质）：
${historyText || '（暂时没有聊天记录）'}

${buildFormatSpec()}

只输出一个 JSON 对象，不要有任何解释，不要用 Markdown 代码块。`;

    let lastError = '格式不对';
    let prompt = basePrompt;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await callCompletion(prompt, { temperature: 0.9 });

      if (!raw) {
        return { ok: false, error: '没有拿到 AI 的回复，请检查 AI 接口设置后再试' };
      }

      const data = extractJsonObject(raw);
      if (!data) {
        lastError = 'AI 回复里没有找到 JSON';
      } else {
        const { look, ...fields } = data;
        const error = validatePartData({ ...fields, category: 'body', id: 'preview' });
        if (!error) return { ok: true, data };
        lastError = error;
      }

      prompt = `${basePrompt}

【你上一次的输出没有通过检查】原因：${lastError}。请改正后重新输出完整的 JSON。`;
    }

    return { ok: false, error: `AI 设计的数据没有通过检查：${lastError}。可以再试一次` };
  } catch (error) {
    console.warn('[PixelDoll] 设计身形失败:', error);
    return { ok: false, error: '设计时出了点问题，请再试一次' };
  }
};