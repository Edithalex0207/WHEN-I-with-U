/*
 * companionFriendStoryData.js —— 好友"互动聊天 / 串门"长短文用到的素材。
 *
 * 纯数据加几个纯函数，不 import 任何文件（跟 companionSchoolActivities.js
 * 一个性质），方便以后单独增删文案，不牵连 service / AI 调用。
 *
 * 为什么需要这份素材：以前两种互动都只给 AI 一句"25 字以内的旁白"，
 * 没有任何场景和上下文，所以每次返回都差不多。现在每次生成前，先从
 * 这里随机抽一个"场景种子"，再带上时间段、友谊阶段、小伙伴当前心情、
 * 上一次发生过的事，让每一次的开头和走向都不一样。
 *
 * 兜底文案（AI 失败时用）也一并放在这里，每条都在 100 字以上，
 * 用 {pet} 代表小伙伴的名字，{friend} 代表朋友的名字。
 */

export const MIN_STORY_CHARS = 100;
export const TARGET_STORY_CHARS_TEXT = '120 到 180 字';

// ---- 场景种子：每次随机抽一个，作为这一段互动的起点 ----
export const TALK_SCENE_SEEDS = [
  '两只在树荫下比谁的影子更长，越比越认真',
  '朋友拿出一件最近捡到的小东西，让小伙伴猜是什么',
  '聊到各自昨晚做过的一个奇怪的梦',
  '朋友一直想问一个问题，犹豫了很久才开口',
  '一起抬头看天上的云，为云像什么争了起来',
  '朋友说起最近有点烦恼的一件小事，小伙伴想办法安慰',
  '互相交换了一个只告诉对方的小秘密',
  '玩起了谁能憋住笑更久的比赛',
  '聊起最喜欢吃的东西，越聊越饿',
  '突然下起小雨，两只躲在同一片大叶子下面聊天',
  '朋友刚学会一个新本领，当场表演给小伙伴看',
  '聊到小时候发生过的一件糗事',
];

export const VISIT_SCENE_SEEDS = [
  '朋友家门口摆着一个很奇怪的小装饰，小伙伴忍不住研究起来',
  '朋友正在做点心，小伙伴被留下来帮忙',
  '朋友刚整理过小窝，翻出了一件很旧的东西',
  '小伙伴到的时候朋友正在午睡，只好安静地等着',
  '朋友院子里新种了一株植物，两只一起浇水',
  '朋友家里有一个小伙伴从没见过的玩具',
  '在朋友家玩起了捉迷藏，小伙伴藏得太好反而没人找得到',
  '朋友带小伙伴参观自己最私密的收藏角落',
  '天色渐晚，朋友不太想让小伙伴回家',
  '朋友家里的一盏小灯突然坏了，两只一起想办法',
  '朋友为小伙伴准备了一份小小的欢迎礼',
  '一起趴在窗边，看路过的小虫子排队走',
];

export const pickSceneSeed = (mode, rng = Math.random) => {
  const pool = mode === 'visit' ? VISIT_SCENE_SEEDS : TALK_SCENE_SEEDS;
  return pool[Math.floor(rng() * pool.length)];
};

// ---- 上下文描述：纯函数，输入数值，输出一句给 AI 看的话 ----
export const describeTimeOfDay = (date = new Date()) => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 9) return '清晨';
  if (hour >= 9 && hour < 12) return '上午';
  if (hour >= 12 && hour < 14) return '中午';
  if (hour >= 14 && hour < 18) return '下午';
  if (hour >= 18 && hour < 20) return '傍晚';
  if (hour >= 20 && hour < 24) return '晚上';
  return '深夜';
};

export const describeFriendshipStage = (friendship) => {
  const value = Number(friendship) || 0;
  if (value < 20) return '刚认识不久，彼此还有点客气，又对对方很好奇';
  if (value < 50) return '已经比较熟悉，会开一点小玩笑，也会说一些心里话';
  return '是很要好的朋友，说话随意亲近，有不少只有彼此懂的默契';
};

export const describeMood = (mood) => {
  const value = Number(mood);
  if (!Number.isFinite(value)) return '心情平常';
  if (value >= 75) return '心情很好';
  if (value >= 40) return '心情平常';
  return '有点低落';
};

// ---- 本地兜底：AI 没配置/失败/太短时使用，每条 100 字以上 ----
export const TALK_FALLBACK_STORIES = [
  '{pet}和{friend}并排坐在树荫底下，起初谁也没说话，只是看着风把叶子吹得沙沙响。过了一会儿，{friend}忽然小声说，自己昨晚梦见了一整片会跳舞的蘑菇。{pet}听得睁大了眼睛，也抢着讲起自己做过的怪梦。两个人越说越离谱，最后笑得东倒西歪，连路过的小虫都忍不住停下来看了一眼。',
  '{friend}神秘兮兮地把爪子背在身后，问{pet}要不要猜猜里面藏了什么。{pet}猜了好几次，小石子、小果子、小贝壳全都猜错了。{friend}得意地摊开爪子，里面竟然只是一片形状很像云的叶子。{pet}愣了一下，随即认真地说“真的很像”，{friend}高兴得耳朵都抖了起来，说下次还有更好的东西要给{pet}看。',
  '天上飘着一朵胖乎乎的云，{pet}说像一只打哈欠的小熊，{friend}却坚持那是一块没吃完的蛋糕。两个人为这个争得面红耳赤，谁也不肯让步。直到那朵云慢慢散开，变成了奇怪的长条，两个同时沉默了。过了半晌，{pet}小声说，看来我们都猜错了，{friend}点点头，两个人又一起笑了起来。',
  '{friend}今天看起来有点没精神，{pet}凑过去问了好几遍才问出来，原来是昨天心爱的小玩具弄丢了。{pet}没有讲大道理，只是陪着{friend}把附近的草丛翻了一遍，虽然最后什么也没找到，但{friend}的尾巴已经慢慢翘了起来。临走的时候，{friend}小声说了一句谢谢，{pet}假装没听见，心里却暖暖的。',
  '两个人聊起了最爱吃的东西，{pet}说起热乎乎的点心，{friend}便描述起自己最爱的果子，越说越认真，肚子居然同时咕噜叫了起来。{pet}和{friend}对视一眼，都红了脸，又忍不住笑出声。{friend}说下次一定要带上好吃的再聊，{pet}用力点头，还和{friend}认真地拉了钩，约定一言为定。',
];

export const VISIT_FALLBACK_STORIES = [
  '{pet}敲了敲{friend}家的门，等了一会儿才听见里面传来慌慌张张的脚步声。门一开，{friend}的爪子上还沾着面粉，说正好在做点心，让{pet}来帮忙尝一尝味道。{pet}尝了一口，认真地评价说有一点点甜得过头，{friend}愣了一下，随即笑着又加了一勺水。屋子里到处都是暖暖的香味，{pet}待了很久才舍得离开。',
  '{friend}的小窝刚整理过，干净得让{pet}不太敢乱动。{friend}得意地带着{pet}参观，从软软的垫子一直介绍到墙角的小抽屉，说那里藏着自己所有的宝贝。{pet}小心地拉开看了一眼，里面是一堆亮晶晶的小石子，{friend}认真地说每一颗都有名字。{pet}听得入了迷，临走前还帮忙给其中一颗取了个新名字。',
  '{pet}到的时候，{friend}正趴在窗边的垫子上睡午觉，尾巴一晃一晃的。{pet}不想吵醒它，便安安静静地在旁边坐下，数着窗外飘过的云。等{friend}揉着眼睛醒来，发现{pet}居然还在，一下子清醒了，连声说怎么不叫醒我。{pet}摇摇头说看你睡得香就够了，{friend}不好意思地挠了挠脸，拉着{pet}玩了好一阵。',
  '{friend}的院子里新种了一株小苗，叶子才刚冒出两片，却被它当成了最重要的客人。{pet}学着{friend}的样子，一点点地给小苗浇水，水洒多了溅了一脚泥。{friend}笑得直不起腰，拿叶子给{pet}擦了擦爪子，说小苗肯定也喜欢你。{pet}看着那两片小小的叶子，心里偷偷希望它快点长大。',
  '天快黑了，{pet}说该回去了，{friend}却一直磨磨蹭蹭地找各种理由，一会儿说想再玩一局，一会儿说灯还没点好。{pet}看出了它的小心思，便又多留了一会儿，陪它把家里的小灯一盏一盏点亮。临走时{friend}送到门口，站在光里使劲挥着爪子，直到{pet}走远了还能看到那团暖暖的光。',
];

export const pickFallbackStory = (mode, { petName, friendName }, rng = Math.random) => {
  const pool = mode === 'visit' ? VISIT_FALLBACK_STORIES : TALK_FALLBACK_STORIES;
  const template = pool[Math.floor(rng() * pool.length)];
  return template
    .split('{pet}').join(petName || '小伙伴')
    .split('{friend}').join(friendName || '朋友');
};