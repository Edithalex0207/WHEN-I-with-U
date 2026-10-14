// src/apps/flightchess/flightChessCardData.js
//
// 飞行棋的五副卡牌数据（纯数据，不碰 Dexie / React）。
//
//   crush  心动试探卡 8张  轻甜、初阶、暧昧小问题
//   warm   心跳升温卡 8张  开始认真聊彼此，但还不至于太沉重
//   soul   灵魂深聊卡 8张  深夜交心、脆弱面、未来和恐惧
//   sweet  甜蜜暴击   6张  输了以后的小惩罚
//   winner 赢家福利卡 4张  前进、免罚、许愿、让对方答应一件小事
//
// 另外还有一副「custom」：开局时用户和角色各写的提问卡，内容存在
// 对局会话里（session.questionCards），不在这个文件里。
//
// backUrl 是卡背图片地址：先留空占位，界面会用渐变底+卡组名顶上，
// 以后拿到图片地址直接把字符串填进来就行，其它地方不用改。
//
// 下面每张卡的文案都是占位草稿（按每副卡的气质先写了一版），
// 拿到正式题目后直接替换 cards 里的字符串即可，id 是按顺序自动生成的。
// effect 只有 forward 会在游戏过程中真的移动棋子，其余只是展示文字。

const makeCards = (deckId, entries) => entries.map((entry, index) => {
  const base = typeof entry === 'string' ? { text: entry } : entry;
  return { id: `${deckId}-${index + 1}`, deckId, ...base };
});

export const DECK_IDS = {
  CRUSH: 'crush',
  WARM: 'warm',
  SOUL: 'soul',
  SWEET: 'sweet',
  WINNER: 'winner',
  CUSTOM: 'custom',
};

export const CARD_DECKS = {
  crush: {
    id: 'crush',
    name: '心动试探卡',
    subtitle: '轻甜、初阶、暧昧小问题',
    backUrl: '',
    tone: 'rose',
    cards: makeCards('crush', [
      '你觉得我身上最让你想靠近的一个小细节是什么？',
      '如果我们明天一起出门，你希望我穿什么颜色？',
      '说一个你第一次注意到我的瞬间。',
      '用三个词形容你现在看着我的感觉。',
      '你更喜欢我主动一点，还是慢慢等你？',
      '说一句你平时不好意思说出口的小夸奖。',
      '如果只能和我共享一个小习惯，你想选哪个？',
      '你觉得我们俩最像的地方是哪里？',
    ]),
  },
  warm: {
    id: 'warm',
    name: '心跳升温卡',
    subtitle: '开始认真聊彼此，但还不至于太沉重',
    backUrl: '',
    tone: 'gold',
    cards: makeCards('warm', [
      '你觉得我们之间最舒服的一个相处时刻是什么？',
      '最近有什么事让你很想第一个告诉我？',
      '你有没有因为我而改变过某个小习惯？',
      '说一件你一直想和我一起做的事。',
      '你理想中的“普通的一天”里，我在做什么？',
      '你最希望我多了解你哪一面？',
      '我哪一次的举动让你记到现在？',
      '如果可以回到我们认识的第一天，你想对那时的自己说什么？',
    ]),
  },
  soul: {
    id: 'soul',
    name: '灵魂深聊卡',
    subtitle: '深夜交心、脆弱面、未来和恐惧',
    backUrl: '',
    tone: 'violet',
    cards: makeCards('soul', [
      '你最不敢让别人知道的一个担心是什么？',
      '你觉得自己最需要被理解的一点是什么？',
      '关于未来，你最害怕的一件事是什么？',
      '有没有一句话，你一直想对我说却没说出口？',
      '你什么时候最觉得孤单？那时你希望我怎么做？',
      '你觉得爱一个人最难的部分是什么？',
      '说一件你至今没有原谅自己的事。',
      '十年后的我们，你最希望还保持不变的是什么？',
    ]),
  },
  sweet: {
    id: 'sweet',
    name: '甜蜜暴击',
    subtitle: '输了以后的小惩罚',
    backUrl: '',
    tone: 'rose',
    cards: makeCards('sweet', [
      '用撒娇的语气重复一遍对方的名字，连喊三次。',
      '给对方发一张最近的随手自拍，不许修图。',
      '唱一句你最近常听的歌，录下来发过去。',
      '夸对方三句，每一句都要带一个比喻。',
      '接下来一个小时，聊天必须用敬语。',
      '给对方点一杯喜欢的饮品，备注写一句土味情话。',
    ]),
  },
  winner: {
    id: 'winner',
    name: '赢家福利卡',
    subtitle: '前进、免罚、许愿、让对方答应一件小事',
    backUrl: '',
    tone: 'gold',
    cards: makeCards('winner', [
      { text: '前进2格。', effect: { type: 'forward', steps: 2 } },
      { text: '免罚一次：下一次惩罚由你指定别人代领。', effect: { type: 'perk', perk: '免罚一次' } },
      { text: '许一个愿望，对方要认真帮你实现一部分。', effect: { type: 'perk', perk: '许愿一次' } },
      { text: '让对方答应你一件小事，不许拒绝。', effect: { type: 'perk', perk: '对方答应一件小事' } },
    ]),
  },
};

export const getDeck = (deckId) => CARD_DECKS[deckId] || null;

/**
 * 从某副卡里抽一张。drawnIds 是本局已经抽过的卡 id，优先抽没抽过的，
 * 全抽完了才重新洗（相当于把这副卡的已抽记录清掉再抽）。
 * 返回 { card, nextDrawnIds }，卡组不存在或为空时 card 为 null。
 *
 * cardsOverride：用户在「卡组管理」里编辑过这副卡时，调用方会把当前生效
 * 的卡片列表（flightChessDeckService.getEffectiveDeckCards 读出来的）传
 * 进来，这里就从这份列表抽，而不是用代码里的内置默认文案；不传就还是
 * 读 deck.cards，保持原来的行为不变。
 */
export const drawCardFromDeck = (deckId, drawnIds = [], cardsOverride = null) => {
  const deck = CARD_DECKS[deckId];
  if (!deck) return { card: null, nextDrawnIds: drawnIds };
  const allCards = Array.isArray(cardsOverride) ? cardsOverride : deck.cards;
  if (allCards.length === 0) {
    return { card: null, nextDrawnIds: drawnIds };
  }
  const drawnSet = new Set(drawnIds);
  let pool = allCards.filter((card) => !drawnSet.has(card.id));
  let baseDrawn = drawnIds;
  if (pool.length === 0) {
    const deckCardIds = new Set(allCards.map((card) => card.id));
    baseDrawn = drawnIds.filter((id) => !deckCardIds.has(id));
    pool = allCards;
  }
  const card = pool[Math.floor(Math.random() * pool.length)];
  return { card, nextDrawnIds: [...baseDrawn, card.id] };
};

/**
 * 从开局时双方写的提问卡里抽一张（custom 卡组）。
 * questionCards 形状：{ userCards: string[], characterCards: { [characterId]: string[] } }
 * 返回 { card, nextDrawnIds }；一张都没有时 card 为 null。
 */
export const drawCustomCard = (questionCards, drawnIds = [], names = {}) => {
  const all = [];
  (questionCards?.userCards || []).forEach((text, index) => {
    if (String(text || '').trim()) {
      all.push({
        id: `custom-user-${index}`,
        deckId: 'custom',
        text: String(text).trim(),
        author: names.user || '你',
      });
    }
  });
  Object.entries(questionCards?.characterCards || {}).forEach(([characterId, list]) => {
    (list || []).forEach((text, index) => {
      if (String(text || '').trim()) {
        all.push({
          id: `custom-char-${characterId}-${index}`,
          deckId: 'custom',
          text: String(text).trim(),
          author: names[characterId] || 'Ta',
        });
      }
    });
  });
  if (all.length === 0) return { card: null, nextDrawnIds: drawnIds };

  const drawnSet = new Set(drawnIds);
  let pool = all.filter((card) => !drawnSet.has(card.id));
  let baseDrawn = drawnIds;
  if (pool.length === 0) {
    const allIds = new Set(all.map((card) => card.id));
    baseDrawn = drawnIds.filter((id) => !allIds.has(id));
    pool = all;
  }
  const card = pool[Math.floor(Math.random() * pool.length)];
  return { card, nextDrawnIds: [...baseDrawn, card.id] };
};

export const CUSTOM_DECK_META = {
  id: 'custom',
  name: '我们的提问卡',
  subtitle: '开局时你们亲手写下的问题',
  backUrl: '',
  tone: 'violet',
};