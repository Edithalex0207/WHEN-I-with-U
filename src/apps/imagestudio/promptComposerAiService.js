// src/apps/imagestudio/promptComposerAiService.js
//
// AI 拼词页的核心：用户拿大白话描述一下想要什么画面，这里负责
//   1. 把画师串库（全部，不管有没有"启用"）喂给 AI，让它自己挑或者自己另外想一组新的；
//   2. 把自然语言描述翻译成最终要用的场景提示词；
//   3. 复用 imageGenRequest.js 的 buildGenerationPrompts，拼出跟「展厅」生成时
//      完全一样口径的最终提示词（固定前缀 / 画师串 / 角色外貌 / 用户外貌 / 场景，
//      按后端规则该有的都有，该省的也会省——第三方后端本来就没有画师串和固定前缀）。
//
// AI 调用走 generateResponse（src/services/aiService.js），这是项目里
// "聊天主流程之外的独立一次性 AI 调用"的既定方式（RP 子应用的做法），
// 不走聊天那套 bracket-tag 解析，也不是 fire-and-forget——这里要等结果
// 直接显示给用户，所以失败要抛出明确的错误文案。
//
// 输出用 JSON（不是聊天在线回复那套 bracket-tag 惯例）：这是独立的一次性
// 工具调用，跟 poke / divination / RP 总结一样，JSON 在这类场景里是既定做法。

import { generateResponse } from '../../services/aiService';
import { getAllArtistTagPresets, createArtistTagPreset } from './artistTagService';
import { buildGenerationPrompts } from './imageGenRequest';
import { joinPromptParts, BACKEND_NOVELAI } from './imageGenRules';

// 没有选任何「给AI预设」时用这段兜底人设，保证功能开箱即用。
const DEFAULT_PERSONA =
  '你是一位经验丰富的AI绘画提示词工程师，擅长为Danbooru标签风格的生图模型' +
  '（比如NovelAI）挑选画师标签、撰写精准贴切的场景提示词，也能在需要时切换成' +
  '适合其他生图服务的自然语言画面描述。';

const truncate = (text, max) => {
  const clean = String(text || '').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
};

const buildLibrarySection = (library) => {
  if (library.length === 0) {
    return '（用户的画师串库目前是空的，你可以直接自己想一组全新的画师标签。）';
  }

  return library
    .map((item, index) => {
      const remark = item.remark ? item.remark : '（无）';
      return `[${index}] 名称：${item.name} / 备注：${remark} / 标签：${item.tags}`;
    })
    .join('\n');
};

const buildSystemPrompt = ({ persona, isNovelAi, library }) => {
  if (!isNovelAi) {
    return `${persona}

接下来用户会用一句大白话告诉你想要什么画面，你要帮他拼成一段可以直接拿去用的
生图提示词。这次用的生图后端不是按Danbooru标签工作的（不支持画师标签、也没有
负面提示词），只接受自然语言描述，所以你只需要把用户的要求改写成一段精炼、
细节具体的画面描述文字即可，不用考虑画师标签的事。

严格只输出下面这个格式的合法JSON，不要输出Markdown代码块围栏，不要输出任何
多余的说明文字：
{"scene_tags": "这里写改写后的画面描述"}`;
  }

  return `${persona}

接下来用户会用一句大白话告诉你想要什么画面，你要帮他拼出一份可以直接拿去用的
Danbooru标签风格提示词（给NovelAI这类按标签工作的生图模型用）。

下面是用户已经存好的"画师串"库，每一条是一组画师标签，附带一个人类自己看的
名称和备注（备注里可能写了这串适合什么风格，没写备注的就是空）。你需要做两
件事：

一、从下面这份库里挑出最贴合用户要求的几条（也可以一条都不挑），如果你判断
库里现有的都不够贴切，可以自己另外写一组全新的画师标签（Danbooru风格，比如
artist:xxx这种写法，逗号分隔），这组新标签会被存进用户的库里，所以质量和格式
都要像样，不要敷衍。不要同时既挑现有的、又编新的来凑数——除非你确实觉得需要
把两边的风格混在一起用。

画师串库：
${buildLibrarySection(library)}

二、把用户的自然语言要求改写成Danbooru标签风格的场景提示词：逗号分隔的短标签，
不要写完整句子，只写具体的构图、人物、动作、环境、氛围这些标签本身。

严格只输出下面这个格式的合法JSON，不要输出Markdown代码块围栏，不要输出任何
多余的说明文字：
{"use_existing_indexes": [0, 2], "new_artist_tags": null, "new_artist_name": null, "scene_tags": "这里写改写后的场景标签"}

字段说明：
- use_existing_indexes：你挑中的画师串在上面列表里的序号（方括号里那个数字），
  一条都没挑就填空数组[]。
- new_artist_tags：你觉得需要自己另外写一组全新画师标签时，在这里填这组标签
  字符串；不需要新写就填null。
- new_artist_name：只有new_artist_tags不是null时才需要填，给这组新标签起一个
  简短好认的名称；new_artist_tags是null时这里也填null。
- scene_tags：改写后的场景提示词。`;
};

/**
 * 防御性解析AI返回的JSON：先去掉可能的Markdown代码块围栏，再JSON.parse。
 * 解析失败或字段形状不对就抛错，让调用方展示"解析失败，请重试"。
 */
const parseComposerResponse = (raw) => {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.warn('[ImageStudio] AI拼词返回内容不是合法JSON：', raw);
    throw new Error('AI 返回的内容没能解析成功，请重试一次。');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI 返回的内容没能解析成功，请重试一次。');
  }

  const sceneTags = typeof parsed.scene_tags === 'string' ? parsed.scene_tags.trim() : '';
  if (!sceneTags) {
    throw new Error('AI 没有给出画面内容，请换个说法再试一次。');
  }

  const useExistingIndexes = Array.isArray(parsed.use_existing_indexes)
    ? parsed.use_existing_indexes.filter((value) => Number.isInteger(value))
    : [];

  const newArtistTags =
    typeof parsed.new_artist_tags === 'string' && parsed.new_artist_tags.trim()
      ? parsed.new_artist_tags.trim()
      : null;
  const newArtistName =
    newArtistTags && typeof parsed.new_artist_name === 'string' && parsed.new_artist_name.trim()
      ? parsed.new_artist_name.trim()
      : null;

  return { sceneTags, useExistingIndexes, newArtistTags, newArtistName };
};

/**
 * 跑一次AI拼词。
 *
 * @param config          生图室的完整配置（normalizeImageGenConfig 之后的）
 * @param description     用户的自然语言描述
 * @param personaInstruction 选中的「给AI预设」指导词；空字符串就用内置兜底人设
 * @param characterAppearance / userAppearance 跟「展厅」生成页一样，按用户的勾选传进来
 *
 * 返回：
 *   {
 *     positive, negative,       // 最终提示词，跟「展厅」真正生成时拼法一致
 *     sceneTags,                 // AI 写的场景提示词本身（供界面单独展示）
 *     usedExistingPresets,       // [{id, name}]，AI 从库里挑中的那些
 *     newPreset,                 // {id, name, tags} | null，AI 新想的那一条（已存库）
 *   }
 *
 * AI 调用失败、返回内容解不出来，都直接抛错，调用方（界面）负责展示错误文案。
 */
export const composeImagePrompt = async ({
  config,
  description,
  personaInstruction = '',
  characterAppearance = '',
  userAppearance = '',
}) => {
  const cleanDescription = String(description || '').trim();
  if (!cleanDescription) {
    throw new Error('先写一下想要什么画面吧。');
  }

  const isNovelAi = config?.backend === BACKEND_NOVELAI;
  const persona = personaInstruction.trim() || DEFAULT_PERSONA;
  const library = isNovelAi ? await getAllArtistTagPresets() : [];

  const systemPrompt = buildSystemPrompt({ persona, isNovelAi, library });

  const responseText = await generateResponse([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: cleanDescription },
  ]);

  const parsed = parseComposerResponse(responseText);

  const usedExistingPresets = parsed.useExistingIndexes
    .map((index) => library[index])
    .filter(Boolean)
    .map((item) => ({ id: item.id, name: item.name, tags: item.tags }));

  let newPreset = null;
  if (parsed.newArtistTags && parsed.newArtistName) {
    try {
      const newId = await createArtistTagPreset({
        name: parsed.newArtistName,
        tags: parsed.newArtistTags,
        remark: `AI 拼词时新想的，用于："${truncate(cleanDescription, 30)}"`,
        enabled: false,
      });
      newPreset = { id: newId, name: parsed.newArtistName, tags: parsed.newArtistTags };
    } catch (error) {
      // 存库失败不耽误这一次拼词结果，标签本身照样用来拼最终提示词，
      // 只是不会出现在画师串页里，下次拼词也不会再被当成"已有的一条"。
      console.warn('[ImageStudio] AI新想的画师串存库失败：', error);
      newPreset = { id: null, name: parsed.newArtistName, tags: parsed.newArtistTags };
    }
  }

  const artistTags = isNovelAi
    ? joinPromptParts([
        ...usedExistingPresets.map((item) => item.tags),
        newPreset ? newPreset.tags : '',
      ])
    : '';

  const { positive, negative } = buildGenerationPrompts({
    config,
    sceneText: parsed.sceneTags,
    characterAppearance,
    userAppearance,
    artistTags,
  });

  return {
    positive,
    negative,
    sceneTags: parsed.sceneTags,
    usedExistingPresets,
    newPreset,
  };
};

export default { composeImagePrompt };