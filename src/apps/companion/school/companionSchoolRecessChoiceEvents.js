/*
 * companionSchoolRecessChoiceEvents.js —— 「文字选项」课间事件的固定文案。
 *
 * 纯数据 + 几个小函数，不 import 任何文件。想加事件、改文案、调心情，只改
 * 这一个文件，不用碰组件。
 *
 * 【一条事件的结构】
 *   id         唯一标识，会记进生活记录的 outcome（形如 eraser:a）
 *   situation  开场的一小段场景（显示在选项上方的小卡片里）
 *   options    正好 3 个选项，每个：
 *     id        a / b / c
 *     tag       性格标签（每条事件自己定，一般 2 个字）
 *     tone      标签底色，对应 school.css 的 sd-tone-*
 *               （butter / sky / mint / heart / lavender）
 *     face      选项左边小头像的表情（normal / happy / sad / wink），
 *               用同学贴图的表情位，没填贴图就是占位
 *     text      选项上写的那一句（小伙伴要做的事）
 *     ending    选完之后写进生活记录的第三人称一句话，也是结果贴纸上显示的文字
 *     mood      这个选项的心情加成，1 或 2（都是正数，不扣）
 *     mateMood  选完之后同学显示哪张表情贴图
 *
 * 文案占位符：{name} 小伙伴的名字，{mate} 同学的名字。
 * 全部不带 emoji；也不用颜文字。
 *
 * 选项在界面上会随机打乱顺序，所以不要写"第一个""上面那个"这种话。
 */

export const CHOICE_OPTION_COUNT = 3;

export const RECESS_CHOICE_EVENTS = [
  {
    id: 'eraser',
    situation: '{mate}的橡皮滚到了{name}脚边，上面画着一张歪歪扭扭的笑脸。{mate}红着脸看了过来。',
    options: [
      { id: 'a', tag: '温柔', tone: 'heart', face: 'happy', mood: 2, mateMood: 'happy',
        text: '捡起来，擦干净，轻轻放回{mate}的桌上',
        ending: '{name}把橡皮捡起来，用袖子擦干净，轻轻放回{mate}的桌上。{mate}小声说了句谢谢，把笑脸朝上摆好，一整个课间都在偷偷笑。' },
      { id: 'b', tag: '机灵', tone: 'sky', face: 'wink', mood: 1, mateMood: 'wink',
        text: '也在橡皮背面画一个笑脸，再还回去',
        ending: '{name}拿笔在橡皮的背面也画了一个笑脸，再还给{mate}。{mate}翻过来一看，愣了一下，两个人对着两张笑脸一起笑了出来。' },
      { id: 'c', tag: '调皮', tone: 'butter', face: 'normal', mood: 1, mateMood: 'sad',
        text: '假装没看见，再用脚轻轻拨远一点点',
        ending: '{name}假装没看见，用脚尖把橡皮拨远了一点点，{mate}着急地追过去。最后{name}还是忍不住笑，帮着一起把橡皮捡了回来。' },
    ],
  },
  {
    id: 'candy',
    situation: '{mate}把一颗糖放在了{name}的桌角，什么也没说，只是眼睛一直往这边瞟。',
    options: [
      { id: 'a', tag: '害羞', tone: 'lavender', face: 'happy', mood: 2, mateMood: 'happy',
        text: '悄悄收下，在纸上折一颗小星星回送过去',
        ending: '{name}把糖收下，又悄悄折了一颗小纸星放到{mate}的桌上。{mate}把小星星捏在手心里，笑得眼睛都弯了。' },
      { id: 'b', tag: '大方', tone: 'mint', face: 'wink', mood: 2, mateMood: 'happy',
        text: '大声说谢谢，把糖掰开，分{mate}一半',
        ending: '{name}大声说了谢谢，还把糖掰成两半，分了一半给{mate}。两个人头靠头，含着糖，谁也没说话，心里都甜甜的。' },
      { id: 'c', tag: '调皮', tone: 'butter', face: 'normal', mood: 1, mateMood: 'wink',
        text: '装作是自己的，转身把糖放进嘴里',
        ending: '{name}装作那颗糖本来就是自己的，转身放进了嘴里，{mate}瞪圆了眼睛。过了一会儿，{name}憋不住笑，掏出另一颗糖递了过去。' },
    ],
  },
  {
    id: 'pencil',
    situation: '上课铃快响了，{mate}在书包里翻来翻去，急得小脸通红：糟了，我的铅笔不见了。',
    options: [
      { id: 'a', tag: '热心', tone: 'mint', face: 'happy', mood: 2, mateMood: 'happy',
        text: '马上把自己的铅笔借给{mate}',
        ending: '{name}想都没想，就把自己的铅笔递给了{mate}。{mate}握着笔，认认真真地说，下课一定还，还要请你吃一颗糖。' },
      { id: 'b', tag: '机灵', tone: 'sky', face: 'wink', mood: 2, mateMood: 'wink',
        text: '帮{mate}一起找，结果在桌肚的角落里找到了',
        ending: '{name}蹲下来帮{mate}一起找，最后在桌肚的角落里摸到了那支铅笔。{mate}拍着胸口说，你像个小侦探。' },
      { id: 'c', tag: '调皮', tone: 'butter', face: 'normal', mood: 1, mateMood: 'happy',
        text: '把铅笔掰成两截，一人一半',
        ending: '{name}把铅笔掰成了两截，一人一半，还说这样就是好朋友的铅笔了。{mate}拿着短短的铅笔又好笑又感动，写字的时候一直握得紧紧的。' },
    ],
  },
  {
    id: 'drawing',
    situation: '{mate}举着一张画跑过来，上面是一团圆圆的、有好多条腿的东西：你看，像不像我家的小狗？',
    options: [
      { id: 'a', tag: '诚实', tone: 'sky', face: 'normal', mood: 1, mateMood: 'sad',
        text: '歪着头想了想，说有点像一只大章鱼',
        ending: '{name}歪着头看了半天，认真地说，有点像一只大章鱼。{mate}先是鼓起腮帮子，过了一会儿又自己笑倒了，说那就叫它章鱼狗吧。' },
      { id: 'b', tag: '温柔', tone: 'heart', face: 'happy', mood: 2, mateMood: 'happy',
        text: '笑着说像，还指出耳朵画得特别好',
        ending: '{name}笑着说，像，特别是这两只耳朵，画得最好看。{mate}把画抱在胸前，说要贴在书桌上，每天都看一眼。' },
      { id: 'c', tag: '搞怪', tone: 'butter', face: 'wink', mood: 2, mateMood: 'wink',
        text: '趴在地上学小狗叫，说一定是它',
        ending: '{name}趴在地上汪汪叫了两声，说我已经认出它来了。{mate}笑得直不起腰，周围的同学也围过来一起汪汪汪。' },
    ],
  },
  {
    id: 'fall',
    situation: '跑出教室的时候，{mate}被门槛绊了一下，一屁股坐在了地上，周围有人在笑。{mate}抿着嘴，不说话。',
    options: [
      { id: 'a', tag: '关心', tone: 'heart', face: 'happy', mood: 2, mateMood: 'happy',
        text: '跑过去，先问疼不疼，再拉{mate}起来',
        ending: '{name}赶紧跑过去，先问疼不疼，再一把拉起了{mate}，还帮着拍了拍裤子上的灰。{mate}吸了吸鼻子，说一点也不疼，其实心里暖暖的。' },
      { id: 'b', tag: '勇敢', tone: 'mint', face: 'wink', mood: 2, mateMood: 'happy',
        text: '也故意坐下来，说这里的地面特别舒服',
        ending: '{name}也一屁股坐在{mate}旁边，说这里的地面特别舒服。{mate}愣住了，接着噗地笑出声，周围的笑声也变成了一起玩的笑声。' },
      { id: 'c', tag: '稳重', tone: 'sky', face: 'normal', mood: 1, mateMood: 'normal',
        text: '默默递上一张纸巾，陪着{mate}坐一会儿',
        ending: '{name}什么也没说，只是递过去一张纸巾，陪着{mate}在台阶上坐了一会儿。过了一会儿，{mate}小声说，谢谢你没有笑我。' },
    ],
  },
  {
    id: 'secret',
    situation: '{mate}凑到{name}耳边，小声说：我告诉你一个秘密，你千万不要告诉别人。',
    options: [
      { id: 'a', tag: '可靠', tone: 'mint', face: 'happy', mood: 2, mateMood: 'happy',
        text: '用力点头，伸出小拇指说拉钩',
        ending: '{name}用力点点头，伸出小拇指和{mate}拉了钩。{mate}说完秘密，整个人轻松了好多，一路蹦蹦跳跳回到座位上。' },
      { id: 'b', tag: '好奇', tone: 'butter', face: 'wink', mood: 1, mateMood: 'wink',
        text: '眼睛亮亮地问：是不是跟零食有关',
        ending: '{name}眼睛亮亮地问，是不是跟零食有关。{mate}吓了一跳，说你怎么知道，两个人一起笑出了声，那个秘密一下子变成了两个人的。' },
      { id: 'c', tag: '害羞', tone: 'lavender', face: 'normal', mood: 1, mateMood: 'happy',
        text: '捂住耳朵，说我怕自己会忍不住说出去',
        ending: '{name}捂住了耳朵，认真地说，我怕自己会忍不住说出去，还是不要告诉我吧。{mate}笑了，说你真是个老实的小朋友。' },
    ],
  },
  {
    id: 'rope',
    situation: '操场上，{mate}和同学们在跳大绳，还差一个人来摇绳子，他们齐刷刷地朝{name}看了过来。',
    options: [
      { id: 'a', tag: '爽快', tone: 'mint', face: 'happy', mood: 2, mateMood: 'happy',
        text: '二话不说，跑过去抓住绳子的一头',
        ending: '{name}二话不说就跑了过去，抓起绳子的一头。大绳越摇越高，{mate}一边跳一边喊，再快一点再快一点。' },
      { id: 'b', tag: '犹豫', tone: 'lavender', face: 'normal', mood: 1, mateMood: 'happy',
        text: '先站着看一会儿，数着节拍再加入',
        ending: '{name}先站在旁边数了好几遍节拍，才小心翼翼地加入。第一次跳进去的时候，{mate}在旁边使劲鼓掌，比谁都高兴。' },
      { id: 'c', tag: '搞怪', tone: 'butter', face: 'wink', mood: 2, mateMood: 'wink',
        text: '一边摇绳一边唱歌，故意摇得忽快忽慢',
        ending: '{name}一边摇绳一边唱起歌来，还故意摇得忽快忽慢。{mate}跳得七扭八歪，大家笑成一团，绳子差点缠在了一起。' },
    ],
  },
  {
    id: 'rain',
    situation: '放学的时候下起了大雨，{mate}站在教室门口，抱着书包，看着雨发呆：我没带伞。',
    options: [
      { id: 'a', tag: '温柔', tone: 'heart', face: 'happy', mood: 2, mateMood: 'happy',
        text: '把伞撑到{mate}头上，说我们一起走',
        ending: '{name}把伞撑到了{mate}的头顶，说我们一起走。两个人挤在一把小伞下面，肩膀碰着肩膀，一路踩着水花说了好多话。' },
      { id: 'b', tag: '机灵', tone: 'sky', face: 'wink', mood: 1, mateMood: 'wink',
        text: '把书包顶在头上，拉着{mate}冲进雨里',
        ending: '{name}把书包顶在头上，拉着{mate}冲进了雨里。到了校门口，两个人都淋得像落汤鸡，却笑得停不下来。' },
      { id: 'c', tag: '调皮', tone: 'butter', face: 'normal', mood: 1, mateMood: 'happy',
        text: '说雨这么好，不如先在走廊上看一会儿',
        ending: '{name}说，雨下得这么好看，不如先在走廊上看一会儿。{mate}想了想，也靠在栏杆上，两个人看着雨点打在树叶上，直到雨变小了才出发。' },
    ],
  },
  {
    id: 'score',
    situation: '小测验的分数发下来了，{mate}把试卷折起来塞进抽屉里，低着头，一句话也不说。',
    options: [
      { id: 'a', tag: '安慰', tone: 'heart', face: 'happy', mood: 2, mateMood: 'happy',
        text: '坐到{mate}旁边，说我这次也有一道题做错了',
        ending: '{name}坐到{mate}旁边，小声说自己这次也有一道题做错了。{mate}抬起头，悄悄把试卷拿出来，说那我们一起看看错在哪里吧。' },
      { id: 'b', tag: '鼓励', tone: 'mint', face: 'wink', mood: 2, mateMood: 'happy',
        text: '拍拍{mate}的肩膀，说下次我们比赛谁进步多',
        ending: '{name}拍拍{mate}的肩膀，说下次我们比赛，看谁进步得多。{mate}一下子来了精神，说好，输了的人请吃一颗糖。' },
      { id: 'c', tag: '陪伴', tone: 'sky', face: 'normal', mood: 1, mateMood: 'normal',
        text: '什么也不说，陪{mate}一起去走廊透透气',
        ending: '{name}什么也没说，只是陪着{mate}去走廊吹了一会儿风。回教室的时候，{mate}深深吸了一口气，说我没事了。' },
    ],
  },
  {
    id: 'snack',
    situation: '午休前，{mate}打开饭盒，里面有两块一样的小饼干，{mate}看了看饼干，又看了看{name}。',
    options: [
      { id: 'a', tag: '大方', tone: 'mint', face: 'happy', mood: 2, mateMood: 'happy',
        text: '开心地收下，也拿出自己的小零食换给{mate}',
        ending: '{name}开心地收下饼干，又拿出自己的小零食换给{mate}。两个人互相尝了对方的味道，都说今天的午饭特别好吃。' },
      { id: 'b', tag: '害羞', tone: 'lavender', face: 'normal', mood: 1, mateMood: 'happy',
        text: '脸红红地说不用了，你自己吃吧',
        ending: '{name}脸红红地说，不用了，你自己吃吧。{mate}却把饼干硬塞进{name}的手心，说两块一样的，就是要两个人一起吃才对。' },
      { id: 'c', tag: '搞怪', tone: 'butter', face: 'wink', mood: 2, mateMood: 'wink',
        text: '一口咬下去，故意发出特别夸张的好吃声',
        ending: '{name}一口咬下去，故意发出了特别夸张的好吃声。{mate}笑得差点呛到，说你这样我也觉得我的饼干是全世界最好吃的了。' },
    ],
  },
  {
    id: 'plane',
    situation: '{mate}折了一架纸飞机，高高举着，说要和{name}比一比，看谁的飞得更远。',
    options: [
      { id: 'a', tag: '认真', tone: 'sky', face: 'happy', mood: 2, mateMood: 'sad',
        text: '认认真真折一架，把机翼压得平平整整',
        ending: '{name}认认真真折了一架，每一道折痕都压得平平整整。飞出去的时候，纸飞机划过一道长长的线，比{mate}的飞得更远。{mate}鼓起腮帮子，嘴上说不服，眼睛里却全是笑。' },
      { id: 'b', tag: '随性', tone: 'butter', face: 'normal', mood: 1, mateMood: 'happy',
        text: '随手折一个，哪里歪了就当它有个性',
        ending: '{name}随手折了一个歪歪的飞机，一扔，居然在空中转了一个大圈，掉在了{mate}的脚边。两个人笑着说，这就算平局吧。' },
      { id: 'c', tag: '大胆', tone: 'mint', face: 'wink', mood: 2, mateMood: 'wink',
        text: '说我们的飞机可以一起飞，把两架绑在一起',
        ending: '{name}提议把两架纸飞机绑在一起飞。它们摇摇晃晃地飞了一小段，一起落在了花坛边上。{mate}说，下次我们折一架更大的。' },
    ],
  },
  {
    id: 'cloud',
    situation: '窗外飘着一朵大大的云，{mate}趴在窗边，转过头来招手：快来看，那朵云像什么。',
    options: [
      { id: 'a', tag: '浪漫', tone: 'lavender', face: 'happy', mood: 2, mateMood: 'happy',
        text: '凑过去，指着云说像一只正在睡觉的小兔子',
        ending: '{name}凑到窗边，指着那朵云，说像一只正在睡觉的小兔子。{mate}看了又看，说真的好像，两个人看着云慢慢飘走，一直看到上课铃响。' },
      { id: 'b', tag: '嘴馋', tone: 'butter', face: 'wink', mood: 2, mateMood: 'wink',
        text: '眯着眼睛，说那明明是一块巨大的棉花糖',
        ending: '{name}眯着眼睛看了半天，说那明明是一块巨大的棉花糖。{mate}笑着说，那我们一人咬一半，两个人对着天空假装吃了起来。' },
      { id: 'c', tag: '认真', tone: 'sky', face: 'normal', mood: 1, mateMood: 'happy',
        text: '仔细看了半天，说我猜它马上会变成别的样子',
        ending: '{name}仔细看了半天，说我猜它马上会变成别的样子。果然没一会儿，云就变了形。{mate}拍着手说，你猜对了，你真是看云的高手。' },
    ],
  },
  {
    id: 'board',
    situation: '值日轮到{mate}擦黑板，可是最上面那一排字够不着，{mate}踮着脚，伸着手，怎么也擦不到。',
    options: [
      { id: 'a', tag: '热心', tone: 'mint', face: 'happy', mood: 2, mateMood: 'happy',
        text: '马上搬来小凳子，扶着{mate}站上去',
        ending: '{name}马上搬来一个小凳子，扶着{mate}站了上去。最上面那一排字被擦得干干净净，{mate}从凳子上跳下来，说今天的黑板最亮。' },
      { id: 'b', tag: '机灵', tone: 'sky', face: 'wink', mood: 2, mateMood: 'wink',
        text: '想个办法：让{mate}踩着凳子、扶着自己的肩膀',
        ending: '{name}想出了一个办法：自己蹲下来，让{mate}踩着凳子搭着肩膀。两个人摇摇晃晃，把黑板上最后一排字擦干净了，还差点一起摔倒。' },
      { id: 'c', tag: '调皮', tone: 'butter', face: 'normal', mood: 1, mateMood: 'happy',
        text: '在最上面那一排，画上一个大大的笑脸',
        ending: '{name}踮着脚在黑板最上面画了一个大大的笑脸，然后才帮{mate}一起擦掉。{mate}笑着说，下次不许在我擦黑板的时候捣乱。' },
    ],
  },
];

/* ---------------- 小工具 ---------------- */

const fillTemplate = (text, vars) => Object.keys(vars).reduce(
  (acc, key) => acc.split(`{${key}}`).join(vars[key]),
  String(text || ''),
);

/** 填好 {name} / {mate} 占位符。 */
export const fillChoiceText = (text, { name, mate } = {}) => fillTemplate(text, {
  name: name || '小伙伴',
  mate: mate || '同学',
});

/** 随机挑一条事件；excludeId 是想避开的上一条（只有一条时无法避开）。 */
export const pickChoiceEvent = ({ rng = Math.random, excludeId = null } = {}) => {
  const pool = RECESS_CHOICE_EVENTS.filter((item) => item.id !== excludeId);
  const list = pool.length ? pool : RECESS_CHOICE_EVENTS;
  return list[Math.floor(rng() * list.length)];
};

/** 打乱选项顺序（不改原数组），免得玩家总觉得某个位置最划算。 */
export const shuffleChoiceOptions = (options, rng = Math.random) => {
  const list = options.slice();
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};