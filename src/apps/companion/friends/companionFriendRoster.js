/*
 * companionFriendRoster.js —— 好友广场的扩充 NPC 名册。
 *
 * 两个用途（都在 companionFriendService.js 的 buildFreshCandidates 里）：
 *   1. EXTRA_NPC_ROSTER：AI 生成不够数时，跟 FALLBACK_NPC_POOL 一起当兜底候选池，
 *      所以每一项都必须有 name / k1 / k2 / declaration 四个字段。
 *   2. pickRosterExamples(n)：随机取 n 条，作为"风格参考"喂给 AI，让它学口吻、
 *      但不照抄，所以宣言要写出明显不同的性格。
 *
 * 纯数据，不 import 任何文件。名字不要跟 companionFriendService.js 里的
 * FALLBACK_NPC_POOL 重名（隙隙 渺渺 团团 绒绒 年年 穗穗 嘟嘟 桃桃）。
 */

export const EXTRA_NPC_ROSTER = [
  { name: '霜霜', k1: '爱晒太阳', k2: '嘴硬', declaration: '我才不是在等你，只是刚好今天太阳好。' },
  { name: '棉棉', k1: '胆小', k2: '爱收集', declaration: '我的小石子可以借你看一眼，只能一眼。' },
  { name: '豆豆', k1: '话多', k2: '热心', declaration: '有什么烦恼都讲给我听，我保证听到天亮。' },
  { name: '芽芽', k1: '好奇', k2: '慢性子', declaration: '我走得很慢，但是路上的每朵花都认识。' },
  { name: '糯糯', k1: '黏人', k2: '爱撒娇', declaration: '蹭一下就好，不会很久的，大概一整天。' },
  { name: '阿雾', k1: '安静', k2: '爱发呆', declaration: '陪我看云吧，不说话也算聊天。' },
  { name: '栗栗', k1: '勤快', k2: '爱囤货', declaration: '我的小仓库有很多松果，朋友来了随便拿。' },
  { name: '铃铃', k1: '爱唱歌', k2: '跑调', declaration: '我给你唱一首新歌，跑调是故意的。' },
  { name: '糖糖', k1: '爱甜食', k2: '怕牙疼', declaration: '分你一半糖，另一半我要自己偷偷吃。' },
  { name: '山山', k1: '稳重', k2: '爱操心', declaration: '你出门前记得问我天气，我比云更清楚。' },
  { name: '圆圆', k1: '乐天', k2: '爱滚', declaration: '遇到坡就滚下去，朋友要不要一起。' },
  { name: '小满', k1: '知足', k2: '爱做梦', declaration: '今天过得刚刚好，明天也不用更好。' },
  { name: '昔昔', k1: '念旧', k2: '爱讲故事', declaration: '我知道很多老故事，换你一个新的就行。' },
  { name: '墩墩', k1: '憨厚', k2: '力气大', declaration: '搬东西叫我，别的我不太会，但很可靠。' },
  { name: '朵朵', k1: '爱美', k2: '爱照镜子', declaration: '我每天都要把毛理好，朋友也要一样精神。' },
  { name: '喵喵', k1: '机灵', k2: '爱恶作剧', declaration: '我只吓你一下下，下一秒就请你吃饼干。' },
];

export const pickRosterExamples = (count = 3, rng = Math.random) => {
  const pool = [...EXTRA_NPC_ROSTER];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, count));
};