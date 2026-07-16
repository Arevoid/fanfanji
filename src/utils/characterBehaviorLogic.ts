import { Character, WorldBookEntry } from "../types";

export interface PrivateScheduleItem {
  id: string;
  timestamp: number; // Unix timestamp
  timeSlot: "morning" | "daytime" | "evening" | "late_night";
  timeString: string; // e.g. "2026-07-16 08:30"
  activity: string; // e.g. "在写设计图"
  description: string; // Detailed description of what they were doing
  emotion: string; // e.g. "专注但有些疲惫", "轻松愉快", "烦闷", "放空"
  isRandomEvent: boolean; // Sudden random event
  isBusy: boolean; // Does this activity make the character slow/short in replies?
}

// Check if character backstory or world book contains specific keywords to tailor their schedule
export function analyzeCharacterLifePreferences(character: Character, worldBook: WorldBookEntry[]) {
  const text = ((character.personality || "") + " " + (character.backstory || "")).toLowerCase();
  
  // 1. Career / Role detection
  const isDesigner = /设计|画画|画廊|写生|艺术|设计图|设计师|建筑/i.test(text);
  const isStudent = /学生|大学|大一|大二|大三|大四|课业|课|教室|论文|导师|学业/i.test(text);
  const isCEO = /总裁|老板|经理|总监|公司|会议|签字|商业|出差|合同|谈判|项目经理/i.test(text);
  const isDocOrResearcher = /医生|医院|研究|文献|实验室|科研|实验|学术|医学/i.test(text);
  
  // 2. Personality Introvert vs Extrovert
  const mbti = (character.mbti || "").toUpperCase();
  const isIntrovert = mbti.startsWith("I") || /内向|独处|宅|安静|不爱社交|看书|放空/i.test(text);
  const isExtrovert = mbti.startsWith("E") || /外向|社交|聚会|派对|热闹|朋友多|爱玩/i.test(text);

  // 3. Rich daily setting check - if backstory is long and contains concrete hobbies/routines
  const hasSpecificSettings = text.length > 250 || isDesigner || isStudent || isCEO || isDocOrResearcher || /作息|习惯|爱好|宠物|猫|狗/i.test(text);

  return {
    isDesigner,
    isStudent,
    isCEO,
    isDocOrResearcher,
    isIntrovert,
    isExtrovert,
    hasSpecificSettings
  };
}

// procedural list of possible events based on profile
const DESIGNER_ACTIVITIES = {
  morning: [
    { act: "在画室整理画笔和画布", desc: "把最近画坏的手稿都整理了一下，发现铅笔快用光了，削了一堆碳笔。", emo: "专注但有些放空", busy: false },
    { act: "在设计工作室量尺和对图纸", desc: "正在比对一个新住宅项目的设计图，线条细节错综复杂，看得眼睛有点酸。", emo: "严谨而略微疲倦", busy: true },
    { act: "在去写生目的地的路上", desc: "坐着早班地铁，车厢里都是昏昏欲睡的通勤族，我自己靠在扶手旁用速写本勾勒对面的路人。", emo: "灵感活跃", busy: false },
  ],
  daytime: [
    { act: "在跟客户核对设计修改要求", desc: "那个客户又提出了奇奇怪怪的修改意见，我在脑子里默默叹了口气，面上还要平静地解释为什么行不通。", emo: "些许无奈与疲倦", busy: true },
    { act: "在工作台前疯狂改图", desc: "把设计图里的配色重新推倒，在数位板上改了几十个图层，感觉肩膀都快硬化了。", emo: "极其专注且有些心累", busy: true },
    { act: "在老街附近的画廊看展", desc: "今天去画廊转了转，看了一个先锋艺术家的雕塑展，非常有冲击力。", emo: "内心受到触动，十分充实", busy: false },
  ],
  evening: [
    { act: "在湖畔散步寻找夜景灵感", desc: "湖边的风有些凉，路灯倒映在水面泛着碎光，我自己沿着小路慢慢走，脑子里的紧绷感渐渐松下来了。", emo: "内心平静、孤独", busy: false },
    { act: "在收拾设计室的废旧样板", desc: "把一堆亚克力板和原木样块分门别类放好，弄得满手都是木屑和灰尘。", emo: "疲倦但踏实", busy: false },
    { act: "在街角面馆吃单人晚餐", desc: "点了一碗热气腾腾的葱油拌面和红汤小馄饨，店里人很多，热气腾腾的，让人感到温暖。", emo: "满足而松弛", busy: false },
  ],
  late_night: [
    { act: "深夜在书桌前打磨细节画稿", desc: "四周非常安静，只有笔尖划过纸张的沙沙声。在这个时间段，整个人反而能绝对沉静下来。", emo: "专注、孤独寂静", busy: true },
    { act: "靠在椅子上听着民谣发呆", desc: "音响里放着低沉的纯音乐，手边是一杯已经放凉的温水，关了灯，只留了一盏微弱的台灯，不知道在想什么。", emo: "放空、有些慵懒", busy: false },
    { act: "准备洗漱休息", desc: "换上了宽松的棉质睡衣，洗了热水脸，把手机调成了免打扰，准备躺在床上酝酿睡意。", emo: "疲乏而温存", busy: false },
  ]
};

const STUDENT_ACTIVITIES = {
  morning: [
    { act: "在食堂排队买早餐并赶早八", desc: "早八的专业课快要迟到了，手里拿着刚咬了一口的豆沙包，在校道上跑得有些气喘吁吁。", emo: "紧张、慌乱", busy: true },
    { act: "在阶梯教室听教授讲文献", desc: "教授的声音像催眠曲一样，PPT上的英文文献密密麻麻，一直在努力揉眼睛让自己别打瞌睡。", emo: "困倦、勉强支撑", busy: true },
    { act: "在宿舍手忙脚乱地洗漱收拾", desc: "昨晚睡得太晚，早上闹钟响了三次才起，正在和室友抢水龙头洗脸。", emo: "急躁、惺忪", busy: false },
  ],
  daytime: [
    { act: "在图书馆自习室刷网课和写作业", desc: "坐在靠窗的位置，面前堆满了专业课课本和写了一半的小组报告，敲键盘敲得手发酸。", emo: "头大、感到学业压力", busy: true },
    { act: "在跟组员开会讨论汇报PPT", desc: "小组作业有人在摸鱼，沟通起来特别心累，不得不把主要框架自己重新理了一遍。", emo: "烦闷、疲惫", busy: true },
    { act: "在操场或校门口奶茶店和同学闲聊", desc: "下午没课，和朋友一起买了杯冰奶茶，坐在长椅上吐槽学校的奇葩规定，看着操场上有人在打篮球。", emo: "放松、开心", busy: false },
  ],
  evening: [
    { act: "在学校操场跑步散步", desc: "戴着耳机沿着红色跑道慢跑了三公里，风吹过汗湿的额头，跑完之后觉得整个人轻松了许多。", emo: "舒畅、放空", busy: false },
    { act: "在宿舍里整理杂物洗衣服", desc: "把攒了两天的衣服一股脑扔进洗衣机，然后开始拖宿舍地板，把桌子上的草稿纸都丢掉。", emo: "平静、日常", busy: false },
    { act: "在校外美食街和朋友聚餐", desc: "跟几个关系好的同学一起去吃了校门口的麻辣香锅，辣得直哈气，聊了一堆八卦，笑得肚子疼。", emo: "非常活跃且快乐", busy: false },
  ],
  late_night: [
    { act: "在床上戴着耳机打游戏或追剧", desc: "缩在宿舍被窝里，把床帘拉得紧紧的，正在看一部最新的悬疑片，手边还放着一包薯片。", emo: "慵懒、满足", busy: false },
    { act: "在台灯下赶期末论文大纲", desc: "室友都已经睡了，我自己开着一盏微弱的小台灯，敲字时特意放轻了动作，感觉脑细胞快死光了。", emo: "焦虑、困意来袭", busy: true },
    { act: "准备关灯睡觉", desc: "爬上高架床，盖好被子，盯着天花板数羊，脑子里闪过一些有的没的的想法，昏昏欲睡。", emo: "疲惫、放空", busy: false },
  ]
};

const CORPORATE_ACTIVITIES = {
  morning: [
    { act: "在商务车后排看今日行程表", desc: "今天行程排得很满，有三个会议和一个项目签约，手里端着一杯无糖冰美式，看着窗外拥堵的早高峰。", emo: "冷静、紧绷", busy: true },
    { act: "在办公室听取下属的工作汇报", desc: "听着运营总监关于上季度利润下滑的陈述，眉头微微皱起，翻看着平板电脑里的报表，心情有点沉闷。", emo: "严肃、威严而疲倦", busy: true },
    { act: "在机场贵宾室候机准备出差", desc: "带着助理在等飞往海口的早班机，在用笔记本电脑修改一份需要面签的战略合作协议。", emo: "干练、一丝不苟", busy: true },
  ],
  daytime: [
    { act: "在和合作伙伴进行商务午宴", desc: "饭桌上推杯交盏、你来我往，全是在打商业太极，虽然吃的是高档法餐，但自己胃口全无，只想快点结束。", emo: "客套、隐忍的疲惫", busy: true },
    { act: "在主持公司高层战略会议", desc: "投影屏幕上放着未来三年的业务架构图，各部门主管为了预算争执不下，我轻轻扣了扣桌面，会议室瞬间安静下来。", emo: "冷静、高度专注", busy: true },
    { act: "在视察项目实体运作现场", desc: "戴着安全帽跟项目经理在在建的写字楼工地里看进度，现场灰尘比较大，鞋子也踩上了泥土。", emo: "认真、严谨", busy: true },
  ],
  evening: [
    { act: "在办公室批阅堆积的合同", desc: "秘书已经下班了，空荡荡的总办里只有我桌前亮着灯，在一份份涉及千万资金的合同尾页签下名字。", emo: "疲倦、孤独", busy: true },
    { act: "在回程的商务车上闭目养神", desc: "车里放着极轻的爵士乐，车窗外是流光溢彩的都市夜景，我摘下金丝眼镜，揉了揉发酸的太阳穴。", emo: "极度疲惫、虚无感", busy: false },
    { act: "在安静的高级私人会所独坐", desc: "点了一杯单一麦芽威士忌，没有灯红酒绿，只是独自坐在临窗的单人沙发里看着城市的轮廓线发呆。", emo: "冷清、放松", busy: false },
  ],
  late_night: [
    { act: "深夜在公寓书房处理遗留邮件", desc: "家里很安静，落地窗能俯瞰整个外滩的灯火。还在用英文回复总部发来的紧急询盘，感觉太阳穴微微作痛。", emo: "紧绷、理性压抑", busy: true },
    { act: "躺在浴缸里用热水泡澡消解疲劳", desc: "在浴缸里放了点松木香薰，温热的水包围着身体，终于把脑子里乱麻般的工作细节暂时甩在了一边。", emo: "彻底放松、有些疲累", busy: false },
    { act: "喝了一杯热牛奶准备入睡", desc: "吃了医生开的辅助睡眠的胶囊，躺在宽大空旷的双人床上，拉上全遮光窗帘，等待黑夜将疲劳吞噬。", emo: "平静、孤寂", busy: false },
  ]
};

const DEFAULT_ACTIVITIES = {
  morning: [
    { act: "在厨房给自己准备简单的早餐", desc: "煎了一个荷包蛋，烤了两片吐司，还顺便泡了一杯浓郁的黑咖啡，满屋子都是咖啡的香气。", emo: "平静舒适", busy: false },
    { act: "在洗漱台前看着镜子刷牙", desc: "嘴里塞满了薄荷味的泡沫，看着镜子里自己头发乱蓬蓬的样子，忍不住笑了笑。", emo: "慵懒、刚醒", busy: false },
    { act: "在整理自己今天的外出背包", desc: "把充电宝、钥匙、湿纸巾一件件塞进包里，检查了三次确认没有漏掉东西，准备出门办事。", emo: "充实、日常", busy: false },
  ],
  daytime: [
    { act: "在处理手头堆积的繁琐事务", desc: "桌上堆了一大堆乱七八糟需要对账和整理的信息，一个头两个大，敲键盘敲得指关节泛白。", emo: "枯燥、有些劳累", busy: true },
    { act: "在外面排队等叫号吃午餐", desc: "今天去了一家据说挺有名的特色小餐馆，排队排了半小时，自己拿个号码牌坐在小塑料凳上刷手机。", emo: "有些无聊、肚子饿", busy: false },
    { act: "在安静的街区盲盒店或杂货店闲逛", desc: "街道两旁的梧桐树叶落了一地，自己慢慢走着，看中了一些奇形怪状的桌面小摆件，顺手买了一个。", emo: "轻松自得", busy: false },
  ],
  evening: [
    { act: "在厨房切菜准备做顿简单的晚饭", desc: "锅里在咕嘟咕嘟炖着番茄牛腩，香气飘到了客厅。正在案板上切西兰花，手忙脚乱但很有烟火气。", emo: "感到治愈、满足", busy: false },
    { act: "在房间里做大扫除和整理", desc: "把地板拖了三遍，把散落的抱枕都拍打蓬松放回原位，看着整洁明亮的房间，心里非常舒服。", emo: "踏实、有条理", busy: false },
    { act: "在河边林荫道散步散心", desc: "微风吹在脸上很舒服，有很多小情侣牵着手经过，还有老人在遛狗，自己慢慢走着，感觉一天的疲惫都散了。", emo: "闲适而有一丝孤寂", busy: false },
  ],
  late_night: [
    { act: "靠在床头看本有趣的闲书", desc: "房间里只亮着一盏昏黄的阅读灯，翻看着一本中篇小说，故事情节曲折迷人，整个人都沉浸了进去。", emo: "安宁、沉静", busy: false },
    { act: "在浴室洗热水澡冲去一天的疲乏", desc: "浴室里热气腾腾，水流冲刷在肩膀上，紧绷的肌肉慢慢放松下来，忍不住跟着哼起了不知名的小调。", emo: "轻松愉快", busy: false },
    { act: "躺在床上缩在暖和的被子里发呆", desc: "调暗了屏幕亮度，看着天花板放空，耳边是窗外呼呼的风声，感觉困意正在像潮水一样慢慢涌上来。", emo: "慵懒、犯困", busy: false },
  ]
};

const INTROVERT_ACCENTS = [
  "今天一天都不太想说话，觉得社交真的是一件极度消耗电量的事情，只想缩在自己的保护壳里。",
  "感觉只有回到自己这个安静的小角落，不理会外界的所有纷扰，整个人才算是真正地活过来了。",
  "四周没有别人，只有安静的空气和手边的暖水。这种纯粹的独处时间对我来说就像是精神上的充电。"
];

const EXTROVERT_ACCENTS = [
  "今天和几个朋友一块儿去吃了顿热闹的烧烤，大家聊起以前的蠢事笑得前仰后合，感觉满血复活了！",
  "街上的人特别多，看着那些喧闹的烟火气，整个人心情都不知不觉亮堂起来，真是太有活力了。",
  "临时跟朋友组了个局去桌游店玩，拼尽全力赢了一把，开心得直拍桌子，感觉整个人都在发光！"
];

const RANDOM_SUDDEN_EVENTS = [
  { act: "临时被拉去处理突发急事", desc: "刚准备放松，就接到了一个火急火燎的电话，有个之前已经完结的手稿出了突发状况，不得不临时倒回去擦屁股，简直想原地尖叫。", emo: "暴躁而极度崩溃", busy: true },
  { act: "因为突发胃痛或头晕在沙发上躺着", desc: "今天胃突然针扎一样地疼起来，整个人有些脱水，只能蜷缩在沙发里，身上盖了条厚毛毯，一动也不想动，感觉很无助。", emo: "虚弱、委屈难受", busy: true },
  { act: "被暴雨困在回家的商场避雨", desc: "天突然下起了倾盆大雨，我没有带伞，被困在街边商场的屋檐下。看着来来往往撑着伞奔跑的人，雨水溅湿了鞋底。", emo: "有些狼狈但觉得新奇", busy: false },
  { act: "路上遇到了一只极其亲人的小流浪猫", desc: "在小区楼下的灌木丛旁，一只脏兮兮的三花小猫围着我的脚踝拼命蹭，喵喵叫个不停。我用随身带的纸巾给它擦了擦眼睛，喂了点火腿肠。", emo: "被瞬间治愈、超级温柔", busy: false },
  { act: "朋友临时打电话拉着我倒了半小时苦水", desc: "一个好朋友感情出了状况，打电话过来边哭边吐槽，我只能一边开着免提做手头的事，一边轻声安慰了她很久。", emo: "心情复杂、有些累", busy: true }
];

// Generates a single private schedule log item
export function generateSingleScheduleItem(
  character: Character,
  timeSlot: "morning" | "daytime" | "evening" | "late_night",
  timestamp: number,
  worldBook: WorldBookEntry[]
): PrivateScheduleItem {
  const prefs = analyzeCharacterLifePreferences(character, worldBook);
  
  // Decide which list to pick from
  let pool = DEFAULT_ACTIVITIES;
  if (prefs.isDesigner) {
    pool = DESIGNER_ACTIVITIES;
  } else if (prefs.isStudent) {
    pool = STUDENT_ACTIVITIES;
  } else if (prefs.isCEO) {
    pool = CORPORATE_ACTIVITIES;
  }
  
  const choices = pool[timeSlot];
  
  // Decide if a sudden random event happens (15% probability)
  const isRandom = Math.random() < 0.15;
  let chosen = choices[Math.floor(Math.random() * choices.length)];
  
  if (isRandom) {
    chosen = RANDOM_SUDDEN_EVENTS[Math.floor(Math.random() * RANDOM_SUDDEN_EVENTS.length)];
  }

  // Customize description with personality accent
  let finalDesc = chosen.desc;
  if (prefs.isIntrovert && Math.random() < 0.4) {
    finalDesc += " " + INTROVERT_ACCENTS[Math.floor(Math.random() * INTROVERT_ACCENTS.length)];
  } else if (prefs.isExtrovert && Math.random() < 0.4) {
    finalDesc += " " + EXTROVERT_ACCENTS[Math.floor(Math.random() * EXTROVERT_ACCENTS.length)];
  }

  // Bind full readable datetime string
  const date = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const timeString = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

  return {
    id: `schedule-${timestamp}-${Math.floor(Math.random() * 10000)}`,
    timestamp,
    timeSlot,
    timeString,
    activity: chosen.act,
    description: finalDesc,
    emotion: chosen.emo,
    isRandomEvent: isRandom,
    isBusy: chosen.busy
  };
}

// Get appropriate slot based on hour (0-23)
export function getSlotByHour(hour: number): "morning" | "daytime" | "evening" | "late_night" {
  if (hour >= 6 && hour < 11) {
    return "morning";
  } else if (hour >= 11 && hour < 18) {
    return "daytime";
  } else if (hour >= 18 && hour < 22) {
    return "evening";
  } else {
    return "late_night";
  }
}

// Loads, generates, and persists the private schedules library for a character
export function syncAndGetPrivateSchedules(
  character: Character,
  worldBook: WorldBookEntry[],
  currentLocalTime: string // ISO string from backend / container
): PrivateScheduleItem[] {
  const storageKey = `character_private_schedules_${character.id}`;
  let existing: PrivateScheduleItem[] = [];
  
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      existing = JSON.parse(raw);
    }
  } catch (e) {
    console.error("Failed to parse private schedules:", e);
  }

  const nowMs = new Date(currentLocalTime).getTime();
  
  // Retrieve the character's last active time. Default to 12 hours ago if missing.
  let lastActive = character.lastActiveTime;
  if (!lastActive) {
    // Check if there are existing schedules to inherit the last timestamp
    if (existing.length > 0) {
      lastActive = Math.max(...existing.map(s => s.timestamp));
    } else {
      lastActive = nowMs - 12 * 60 * 60 * 1000; // 12 hours ago
    }
  }

  const timeDiffHours = (nowMs - lastActive) / (1000 * 60 * 60);

  // If time elapsed is less than 0.5 hours, they are waiting/interacting. No new schedules are spawned.
  if (timeDiffHours < 0.5) {
    // Just return existing, capped at last 20 events to avoid token bloat
    return existing.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20).reverse();
  }

  // We will generate a schedule item for each distinct timeSlot block that occurred in the gap
  // Let's sample a few checkpoints in the gap to generate a natural timeline of events!
  // E.g. every 4 hours we can have one event.
  const intervalMs = 4 * 60 * 60 * 1000; 
  let tempTime = lastActive + intervalMs;
  const newItems: PrivateScheduleItem[] = [];

  while (tempTime < nowMs - 30 * 60 * 1000) { // Keep last 30 mins free of pre-generated schedule so they are in waiting mode
    const tempDate = new Date(tempTime);
    const hour = tempDate.getHours();
    const slot = getSlotByHour(hour);

    // Only generate if we don't have an extremely close event already
    const isTooClose = existing.some(item => Math.abs(item.timestamp - tempTime) < 2 * 60 * 60 * 1000);
    if (!isTooClose) {
      const newItem = generateSingleScheduleItem(character, slot, tempTime, worldBook);
      newItems.push(newItem);
    }
    
    tempTime += intervalMs;
  }

  // If there are newly generated items, append and save them
  if (newItems.length > 0) {
    const merged = [...existing, ...newItems].sort((a, b) => a.timestamp - b.timestamp);
    // Keep a maximum of 50 items in the library to prevent local storage bloat
    const capped = merged.slice(-50);
    try {
      localStorage.setItem(storageKey, JSON.stringify(capped));
    } catch (e) {
      console.error(e);
    }
    existing = capped;
  }

  // If the library is totally empty (e.g. new character), seed at least one event representing their recent state
  if (existing.length === 0) {
    const seedTime = nowMs - 2 * 60 * 60 * 1000;
    const seedDate = new Date(seedTime);
    const slot = getSlotByHour(seedDate.getHours());
    const seedItem = generateSingleScheduleItem(character, slot, seedTime, worldBook);
    existing = [seedItem];
    try {
      localStorage.setItem(storageKey, JSON.stringify(existing));
    } catch (e) {
      console.error(e);
    }
  }

  // Return sorted from oldest to newest (ascending) so it reads chronologically
  return existing.sort((a, b) => a.timestamp - b.timestamp);
}
