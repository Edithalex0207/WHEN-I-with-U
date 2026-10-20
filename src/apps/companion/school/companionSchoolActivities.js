/*
 * companionSchoolActivities.js —— 「随机校园小事」的文案素材库。
 *
 * 纯数据，不 import 任何文件（连 companionSchoolData.js 都不碰），
 * 跟 schoolQuestionsKindergarten.js / schoolQuestionsPrimary.js 一个性质：
 * 内容多、以后想增删改随时改这一个文件，不会牵连数值常量或 service。
 *
 * 文案里可以用三个占位符，真正的替换在 companionSchoolActivityService.js：
 *   {name}    小伙伴的名字
 *   {class}   班级名（比如"向日葵班"）
 *   {teacher} 班主任名字
 *
 * moodRange: [min, max]，命中这一条时，在这个闭区间里随机取一个整数
 * 心情加成（都是正数，这是"小惊喜"，不做扣心情的负面小事）。
 */
export const CAMPUS_ACTIVITIES = [
  { id: 'act-01', text: '课间的时候，{teacher}悄悄表扬了{name}坐得最端正，奖励了一个小贴纸。', moodRange: [2, 3] },
  { id: 'act-02', text: '{name}在走廊上跟别班的小朋友撞了个满怀，两个人对视一眼，笑成一团。', moodRange: [1, 2] },
  { id: 'act-03', text: '午休前，{name}趴在教室窗台上看了好一会儿云，说要把形状记下来讲给你听。', moodRange: [1, 2] },
  { id: 'act-04', text: '{name}在操场角落捡到一片特别好看的叶子，小心夹进了课本里，说要带回家给你看。', moodRange: [1, 2] },
  { id: 'act-05', text: '{class}今天换了新的座位表，{name}很开心地说这下离窗户更近了。', moodRange: [1, 3] },
  { id: 'act-06', text: '下课铃一响，{name}第一个冲出教室，结果发现同桌比TA还快。', moodRange: [1, 2] },
  { id: 'act-07', text: '{teacher}今天带了一小盒积木到班里，{name}搭了一座歪歪扭扭但很得意的小房子。', moodRange: [2, 3] },
  { id: 'act-08', text: '饭后散步时，{name}数了数操场上的小鸟，一共七只，激动地跟同学宣布了这个发现。', moodRange: [1, 2] },
  { id: 'act-09', text: '{name}把铅笔盒落在了美术课教室，绕了半个校园才找回来，气喘吁吁但很骄傲地说自己找到了。', moodRange: [1, 2] },
  { id: 'act-10', text: '{class}今天的黑板报换了新主题，{name}在角落里画了一只小小的、只有TA自己认得出的生物。', moodRange: [1, 3] },
  { id: 'act-11', text: '{teacher}在走廊上碰到{name}，蹲下来问了句"今天开心吗"，{name}用力点了点头。', moodRange: [2, 3] },
  { id: 'act-12', text: '课间十分钟，{name}跟同学玩了一局"剪刀石头布"，赢了三局，开心地举起手。', moodRange: [1, 2] },
  { id: 'act-13', text: '午饭时间，食堂今天多加了一道{name}很爱吃的菜，TA悄悄多添了一碗。', moodRange: [1, 2] },
  { id: 'act-14', text: '{name}今天主动帮同桌捡起了掉在地上的橡皮，被{teacher}当众表扬了一句"真贴心"。', moodRange: [2, 3] },
  { id: 'act-15', text: '{class}窗外的树上突然飞来一只喜鹊，全班趴在窗边看了好一阵子，{name}看得最入迷。', moodRange: [1, 2] },
  { id: 'act-16', text: '放学路上，{name}蹲下来看了好久蚂蚁搬家，差点没赶上校车，最后是同学拉着TA跑回去的。', moodRange: [1, 2] },
  { id: 'act-17', text: '{name}今天的作业本上被{teacher}画了一个小星星，开心得在座位上转了个圈。', moodRange: [2, 3] },
  { id: 'act-18', text: '课间的时候下起了小雨，{name}趴在窗边听雨声，说这声音"软软的，像棉花糖"。', moodRange: [1, 2] },
  { id: 'act-19', text: '{name}跟同桌交换了一次橡皮，说"你的比我的好闻"，两个人为这句话笑了很久。', moodRange: [1, 2] },
  { id: 'act-20', text: '{teacher}今天讲了一个小故事，讲到一半停下来问大家"接下来会发生什么"，{name}举手猜对了结局。', moodRange: [2, 3] },
  { id: 'act-21', text: '{class}的饮水机今天坏了一会儿，{name}很"热心"地跟同学讨论这件大事讨论了一整个课间。', moodRange: [1, 2] },
  { id: 'act-22', text: '{name}在操场上发现了自己的影子被拉得很长很长，玩了好一会儿踩影子的游戏。', moodRange: [1, 2] },
  // ↓↓↓ 新增 ↓↓↓
  { id: 'act-23', text: '手工课上，{name}折的纸飞机飞得特别远，引来全班一阵欢呼，连{teacher}都忍不住看了两眼。', moodRange: [2, 3] },
  { id: 'act-24', text: '体育课跳远，{name}摔了个屁股蹲儿，爬起来拍拍土继续排队，一点都没哭。', moodRange: [1, 2] },
  { id: 'act-25', text: '音乐课上学了一首新歌，{name}回家路上还在哼，调子跑了一大半自己都没发现。', moodRange: [1, 2] },
  { id: 'act-26', text: '升旗仪式上，{name}站得笔直，事后悄悄跟同桌说自己"一动都没动，特别厉害"。', moodRange: [1, 2] },
  { id: 'act-27', text: '图书角新到了一批绘本，{name}抢到了最喜欢的那本，一个人躲在角落看得入神。', moodRange: [1, 2] },
  { id: 'act-28', text: '轮到{name}做值日，擦黑板擦得格外认真，还被{teacher}夸"擦得比平时干净"。', moodRange: [2, 3] },
  { id: 'act-29', text: '班里来了个新同学，{name}主动过去打了招呼，两个人很快就聊到了一块儿。', moodRange: [2, 3] },
  { id: 'act-30', text: '{name}早上发现文具盒落在家里了，急得不行，还好同桌借了TA一支笔，这才松了口气。', moodRange: [1, 2] },
  { id: 'act-31', text: '做课间操的时候，{name}动作慢了半拍，跟旁边同学撞了一下，两个人笑着对了个眼神就继续做操了。', moodRange: [1, 2] },
  { id: 'act-32', text: '{name}今天换了一颗牙，兴奋地拿给同桌看，还认真讨论了要不要放在枕头底下。', moodRange: [2, 3] },
  { id: 'act-33', text: '窗外突然下起了雪，{class}全班都趴到窗边看，{name}看得最久，手心都印在玻璃上了。', moodRange: [2, 3] },
  { id: 'act-34', text: '自然课上观察蚕宝宝，{name}盯着看了整整一节课，还给它偷偷起了个名字。', moodRange: [1, 2] },
  { id: 'act-35', text: '{name}把一个字念错了，惹得全班哄堂大笑，自己也跟着笑了半天，一点都不介意。', moodRange: [1, 2] },
  { id: 'act-36', text: '午睡的时候，{name}翻来覆去睡不着，盯着天花板数了半天羊，最后还是迷迷糊糊睡着了。', moodRange: [1, 2] },
  { id: 'act-37', text: '放学的校车上，{name}跟邻座玩了一路的猜拳游戏，输赢都记不清了，但一路笑个不停。', moodRange: [1, 2] },
  { id: 'act-38', text: '{name}忘带了橡皮，鼓起勇气跟{teacher}借了一个，还特意道谢，{teacher}夸TA有礼貌。', moodRange: [2, 3] },
  { id: 'act-39', text: '美术课上，{name}画的太阳有八条光芒，被{teacher}当成范例举起来给全班看，害羞得脸都红了。', moodRange: [2, 3] },
  { id: 'act-40', text: '{class}里不知道谁先打了个喷嚏，接着一个接一个全传染上了，{name}也跟着打了三个。', moodRange: [1, 2] },
  { id: 'act-41', text: '放学时家长还没到，{name}坐在校门口的台阶上，跟留到最后的同学一起数来往的车，一点都不无聊。', moodRange: [1, 2] },
  { id: 'act-42', text: '{name}今天主动把课桌椅排得整整齐齐，被{teacher}当众表扬是"小小整理小能手"。', moodRange: [2, 3] },
];