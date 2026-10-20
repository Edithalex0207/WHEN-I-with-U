/*
 * companionSchoolGradeLines.js —— 「托管上课」学校信里"一句成绩"的文案素材库。
 *
 * 纯数据 + 一个纯函数，不 import 任何文件，跟 companionSchoolActivities.js
 * 一个性质：内容多、以后想增删改随时改这一个文件，不会牵连 service。
 *
 * 按这组题（5道）答对几道分四档，每档一个文案池，按答对比例落档：
 *   perfect 全对 / good 大半对 / soso 一半左右 / bad 没怎么对
 * （跟 companionCustodySchoolService.js 里"考砸"的判定——答对<=1题——是
 *  两件独立的事：这里只管选哪档文案，心情惩罚的阈值在那边。）
 *
 * 文案里可以用一个占位符 {name}，真正的替换在 pickGradeLine 里。
 */
export const GRADE_LINE_POOL = {
  perfect: [
    '今天的题全对啦，{name}美滋滋地在练习册角落画了个小太阳。',
    '一题不错，{name}把本子举得高高的，像是在等人表扬。',
    '全对！{name}自己先"哇"了一声，比谁都惊讶。',
  ],
  good: [
    '大半都对了，{name}说这几道是"动了脑筋的"，挺得意。',
    '错了一道，{name}扒着本子研究了半天那道题，不肯轻易放过。',
    '表现还不错，{name}说明天还要再多对几道。',
  ],
  soso: [
    '对了一半，{name}挠了挠头，说"有几道是蒙的"。',
    '不算好也不算差，{name}小声说下次要认真一点。',
    '中规中矩，{name}安慰自己说"至少没有全错"。',
  ],
  bad: [
    '这组题没答好，{name}趴在桌上，情绪有点低落。',
    '错得有点多，{name}把本子合上，半天没说话。',
    '{name}今天的题大部分都没对，闷闷地坐在座位上。',
  ],
};

/**
 * 按答对比例挑一句成绩评语，{name} 换成小伙伴的名字。
 * @param {{correct:number, total:number, companionName?:string, rng?:function}} options
 * @returns {string}
 */
export const pickGradeLine = ({ correct, total, companionName = '', rng = Math.random } = {}) => {
  const safeTotal = total > 0 ? total : 1;
  const ratio = correct / safeTotal;

  let bucket;
  if (ratio >= 1) bucket = GRADE_LINE_POOL.perfect;
  else if (ratio >= 0.6) bucket = GRADE_LINE_POOL.good;
  else if (ratio >= 0.4) bucket = GRADE_LINE_POOL.soso;
  else bucket = GRADE_LINE_POOL.bad;

  const template = bucket[Math.floor(rng() * bucket.length)];
  return template.split('{name}').join(companionName || '小伙伴');
};