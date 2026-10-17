/*
 * companionSchoolCardCatalog.js —— 「随机收藏卡」的卡池（固定目录）。
 *
 * 纯数据，不 import 任何文件，跟 companionSchoolActivities.js 一个性质。
 * 这套卡是全体小伙伴共用的一套固定目录（不是按小伙伴的样子单独画），
 * 所以每张卡的 text 只描述"这是哪个瞬间"，不描述小伙伴长什么样——
 * 不管换哪个小伙伴，用的都是同一套卡池。
 *
 * 【想加图的时候】
 * 每张卡的 url 留空字符串 = 用内置的占位卡面（SchoolArt.jsx 的 CardArt，
 * 纯色底 + 一个小图标）；填了图就显示真实插画。不用改任何其它文件。
 *
 * 【稀有度】
 * CARD_RARITY_WEIGHTS 是抽卡时"抽中了就先定哪个档"的权重，三档加起来
 * 不要求正好 100，service 里会按总和去算比例。
 */
export const CARD_RARITY = {
  COMMON: 'common',
  RARE: 'rare',
  HIDDEN: 'hidden',
};

export const CARD_RARITY_LABELS = {
  [CARD_RARITY.COMMON]: '普通',
  [CARD_RARITY.RARE]: '稀有',
  [CARD_RARITY.HIDDEN]: '隐藏',
};

/** 按这个显示顺序排筛选 chip / 排目录 */
export const CARD_RARITY_ORDER = [CARD_RARITY.COMMON, CARD_RARITY.RARE, CARD_RARITY.HIDDEN];

/** 抽中卡时，先按这个权重决定抽到哪个档（约 70 / 25 / 5） */
export const CARD_RARITY_WEIGHTS = {
  [CARD_RARITY.COMMON]: 70,
  [CARD_RARITY.RARE]: 25,
  [CARD_RARITY.HIDDEN]: 5,
};

/*
 * tone 复用 school.css 的 .sd-tone-*（butter / sky / mint / heart /
 * lavender），只管卡面占位色，跟科目/班级没有任何关联。
 */
export const COLLECTIBLE_CARDS = [
  // ---- 普通 ----
  { id: 'card-01', title: '击掌的瞬间', rarity: CARD_RARITY.COMMON, tone: 'sky', text: '下课铃一响，跟同桌用力击了个掌。', url: '' },
  { id: 'card-02', title: '第一个举手', rarity: CARD_RARITY.COMMON, tone: 'mint', text: '老师话音刚落，手就已经举得比谁都高。', url: '' },
  { id: 'card-03', title: '读课文读得最大声', rarity: CARD_RARITY.COMMON, tone: 'butter', text: '语文课上读得脸都红了，还是坚持读到最后一个字。', url: '' },
  { id: 'card-04', title: '小贴纸到手', rarity: CARD_RARITY.COMMON, tone: 'heart', text: '作业本上第一次被老师画了个小星星。', url: '' },
  { id: 'card-05', title: '盯着天花板发呆', rarity: CARD_RARITY.COMMON, tone: 'sky', text: '午休没睡着，盯着天花板数了半天格子。', url: '' },
  { id: 'card-06', title: '捡到的叶子', rarity: CARD_RARITY.COMMON, tone: 'mint', text: '操场角落捡到一片特别好看的叶子，小心夹进了课本。', url: '' },
  { id: 'card-07', title: '笑着跑最后一名', rarity: CARD_RARITY.COMMON, tone: 'butter', text: '体育课上跑了最后一名，笑得却比谁都开心。', url: '' },
  { id: 'card-08', title: '怪怪的小动物', rarity: CARD_RARITY.COMMON, tone: 'lavender', text: '美术课画了一只四不像，自己却越看越满意。', url: '' },
  { id: 'card-09', title: '分一半饼干', rarity: CARD_RARITY.COMMON, tone: 'heart', text: '把手里最后一块饼干，掰了一半给了好朋友。', url: '' },
  { id: 'card-10', title: '看蚂蚁搬家', rarity: CARD_RARITY.COMMON, tone: 'sky', text: '蹲在走廊边看蚂蚁搬家，一看就是一整个课间。', url: '' },
  { id: 'card-11', title: '叠得整整齐齐', rarity: CARD_RARITY.COMMON, tone: 'mint', text: '把课本边角一页一页叠得整整齐齐，像完成了一件大事。', url: '' },
  { id: 'card-12', title: '追自己的影子', rarity: CARD_RARITY.COMMON, tone: 'butter', text: '放学路上追了好一会儿自己的影子，怎么追都追不上。', url: '' },

  // ---- 稀有 ----
  { id: 'card-13', title: '当众被表扬', rarity: CARD_RARITY.RARE, tone: 'heart', text: '被班主任当着全班的面表扬了一句，耳朵都红了。', url: '' },
  { id: 'card-14', title: '满分卷子', rarity: CARD_RARITY.RARE, tone: 'sky', text: '举着一张满分的卷子，原地转了整整一圈。', url: '' },
  { id: 'card-15', title: '全班大合唱', rarity: CARD_RARITY.RARE, tone: 'mint', text: '和全班一起大合唱，跑调跑得很开心，一点也不在意。', url: '' },
  { id: 'card-16', title: '春天第一朵花', rarity: CARD_RARITY.RARE, tone: 'butter', text: '在花坛角落发现了这个春天的第一朵小花，兴奋地喊了同学来看。', url: '' },
  { id: 'card-17', title: '属于自己的奖牌', rarity: CARD_RARITY.RARE, tone: 'heart', text: '运动会上拿到了人生第一枚属于自己的奖牌，紧紧攥在手心里。', url: '' },
  { id: 'card-18', title: '雨后的小彩虹', rarity: CARD_RARITY.RARE, tone: 'sky', text: '雨停之后，在操场上方第一个发现了那道小小的彩虹。', url: '' },

  // ---- 隐藏 ----
  { id: 'card-19', title: '翻出入学那天的照片', rarity: CARD_RARITY.HIDDEN, tone: 'lavender', text: '深夜偷偷翻出入学那天的照片，笑着说"那时候好小啊"。', url: '' },
  { id: 'card-20', title: '长大也想当老师', rarity: CARD_RARITY.HIDDEN, tone: 'lavender', text: '悄悄跟老师说，自己长大以后也想当一名老师。', url: '' },
  { id: 'card-21', title: '没有寄出的信', rarity: CARD_RARITY.HIDDEN, tone: 'lavender', text: '写了一封没有寄出去的信，信里只写了一句话：想快点长大。', url: '' },
];