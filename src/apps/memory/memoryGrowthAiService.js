import {
  requestTidyCompletion
} from './memoryTidyAiService';

import {
  GROWTH_DIMENSIONS,
  GROWTH_DIMENSION_LABELS,
  MAX_DELTA,
  MIN_DELTA,
  normalizeNudge
} from './memoryGrowth';

/*
 * 角色成长的 AI 判断：给它人设、已有的成长、最近触发它的事件，
 * 让它判断要新增哪条成长、增强哪条、减弱哪条。
 *
 * 只负责"问 AI、把结果规范化"，不读写数据库；落库和"先问用户还是直接生效"
 * 在 memoryGrowthService.js 里决定。请求本身复用 memoryTidyAiService.js 里的
 * requestTidyCompletion。
 */

const MAX_OPS_PER_RUN = 3;

const STATUS_LABELS = {
  active: '生效中',
  pending: '待用户确认',
  faded: '已回落'
};

const normalizeText = (value) => String(value || '').trim();

const SYSTEM_PROMPT = `
你负责观察一段私人数字陪伴关系里，角色的性格、对用户的态度、对自己的认识，是否因为共同经历而发生了变化。

你的职责：根据下面的人设、已有的成长、以及最近发生的触发事件，判断要新增、增强或减弱哪些"成长"。不要使用角色口吻，不要安慰，不要添加抒情语言。

背景：成长是叠加在人设之上的一层倾向，不是替换人设。它可以增强，也可以被相反的经历减弱，减弱到很低就回落；回落之后遇到同样的事还可以再长出来（对已回落的成长用 reinforce 就是让它重新长出来）。

五个方面（dimension）：
- trait：性格倾向，例如”被冷落后更容易不安，需要对方明确表示在意””越来越愿意直接表达想念”；
- attitude：对用户的态度，例如”更信任用户””对用户的沉默变得小心”；
- selfview：角色对自己的认识，例如”意识到自己其实很在意这段关系”；
- opinion：角色自己形成的主见，例如”觉得用户不该那么晚睡”；
- habit：具体的、看得见的日常相处习惯（不是性格，是行为），例如”会记得用户不吃辣””习惯用户说晚安后多聊一句才睡””看到用户发的照片会习惯性回一句夸奖”。

操作（op）：
- add：新出现的成长，必须给出 dimension、text、delta、nudge、triggerIndexes；
- reinforce：已有成长被新的事件强化，必须给出 itemIndex、delta、triggerIndexes；
- weaken：已有成长被相反的事件削弱，必须给出 itemIndex、delta、triggerIndexes。

规则：
1. 必须有依据：每个操作都要引用“触发事件”里的序号（triggerIndexes，从 1 开始），不能编造，不能凭空判断。
2. 成长要符合人设：它是这个角色在这些经历之后自然会有的变化，不能和人设的核心性格矛盾，也不能让角色突然变成另一个人。
3. 被相反的事件推回：如果触发事件显示已有成长的对立面发生了（例如长期的不安被温柔地安慰化解了，或者用户主动解释了原因），对相应的已有成长用 weaken，而不是保持不变。
4. text 用一句话（不超过 40 字）描述角色的这个倾向或想法，以“角色”为主语或省略主语，不要出现“昨天、今天、最近、上周”这类相对时间词，不要写成给用户的话。
5. delta 是强度变化，0.05 到 0.3。日常的小事用 0.05 到 0.12；只有重大事件（告白、严重争吵、分别、和好）才用 0.2 以上。新增时 delta 就是初始强度，一般 0.2 到 0.4。
6. nudge 只在 add 时给出：这条成长对角色情绪参数的轻微影响，三个字段各在 -0.15 到 0.15 之间，大多数成长影响很小甚至为 0：
   - decaySpeed：情绪淡去的速度，正数是更快淡去，负数是更容易一直放在心里；
   - settleSpeed：强烈情绪的平复速度，正数是更快平复，负数是更难平复；
   - sensitivity：对事情的反应强度，正数是更敏感，负数是更钝感。
7. opinion（主见）只能是角色自己的想法，不得是要求、说教或施压用户的内容。
8. 不做诊断，不做医学或心理学判断，不评价用户对错。
9. 最多输出 ${MAX_OPS_PER_RUN} 个操作；没有值得改变的就输出空数组，不要为了凑数硬写。
10. 触发事件里如果标了"常规复盘"：这不是因为发生了什么事，而是照例看一眼最近的日常记忆。如果这些记忆里能看出一个比较清晰的倾向（哪怕只是重复出现两三次的小习惯或态度变化），可以正常新增或调整，不必强行等到"稳定反复、多次确认"才动笔；完全看不出任何迹象、或只是孤立的一次性小事时才输出空数组。这种触发下 delta 用 0.05 到 0.15。
11. 不得使用 Emoji，只输出严格 JSON，不要 Markdown，不要解释。

JSON 格式：
{
  "ops": [
    {
      "op": "add | reinforce | weaken",
      "dimension": "trait | attitude | selfview | opinion | habit",
      "text": "add 时填写，不超过 40 字",
      "itemIndex": 1,
      "delta": 0.15,
      "nudge": { "decaySpeed": 0, "settleSpeed": -0.05, "sensitivity": 0.08 },
      "triggerIndexes": [1],
      "reason": "一句话说明依据"
    }
  ]
}
`;

const buildUserPrompt = ({ persona, activeItems, triggers }) => `
人设（原文，不会被改动）：
${persona || '未提供'}

已有的成长（生效中、待用户确认、或已经回落的都列在这里）：
${activeItems.length
    ? activeItems
      .map((item, index) => `${index + 1}. [${GROWTH_DIMENSION_LABELS[item.dimension] || item.dimension}] ${item.text}（强度 ${item.strength.toFixed(2)}，${STATUS_LABELS[item.status] || '生效中'}）`)
      .join('\n')
    : '无'}

触发事件：
${triggers
    .map((trigger, index) => (
      `${index + 1}. ${String(trigger.at || '').slice(0, 10) || '日期未知'} [${trigger.label}] ${trigger.text}`
    ))
    .join('\n')}
`;

const normalizeDelta = (value) => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return 0.15;

  return Math.max(MIN_DELTA, Math.min(MAX_DELTA, Math.abs(numberValue)));
};

/*
 * 输入：persona 文本、当前生效的成长（activeItems，带 id）、触发事件（triggers）。
 * 输出：0 到 3 个 { op, itemId, dimension, text, delta, nudge, reason, evidence }，
 * evidence 是引用到的触发事件对象。没有依据的、指向不存在序号的一律丢弃。
 */
export const judgeGrowth = async ({
  persona = '',
  activeItems = [],
  triggers = []
}) => {
  if (!triggers.length) {
    return [];
  }

  const result = await requestTidyCompletion({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt({ persona, activeItems, triggers })
  });

  const validDimensions = new Set(Object.values(GROWTH_DIMENSIONS));

  return (Array.isArray(result?.ops) ? result.ops : [])
    .map((item) => {
      const op = normalizeText(item?.op);

      const evidence = [...new Set(
        (Array.isArray(item?.triggerIndexes) ? item.triggerIndexes : [])
          .map(Number)
          .filter((index) => (
            Number.isInteger(index) && index >= 1 && index <= triggers.length
          ))
      )].map((index) => triggers[index - 1]);

      const itemIndex = Number(item?.itemIndex);

      const target = (
        Number.isInteger(itemIndex) &&
        itemIndex >= 1 &&
        itemIndex <= activeItems.length
      )
        ? activeItems[itemIndex - 1]
        : null;

      return {
        op,
        itemId: target?.id || null,
        dimension: validDimensions.has(item?.dimension) ? item.dimension : null,
        text: normalizeText(item?.text).slice(0, 80),
        delta: normalizeDelta(item?.delta),
        nudge: op === 'add' ? normalizeNudge(item?.nudge) : null,
        reason: normalizeText(item?.reason).slice(0, 120),
        evidence
      };
    })
    .filter((item) => {
      if (!item.evidence.length) return false;

      if (item.op === 'add') {
        return Boolean(item.text && item.dimension);
      }

      if (item.op === 'reinforce' || item.op === 'weaken') {
        return Boolean(item.itemId);
      }

      return false;
    })
    .slice(0, MAX_OPS_PER_RUN);
};