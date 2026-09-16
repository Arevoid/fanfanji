import assert from "node:assert/strict";
import {
  advanceCharacterPhone,
  advanceCharacterPhoneWithResult,
} from "../src/features/characterPhone/characterPhoneProgression";
import { createTextImageMarkup } from "../src/features/chat/services/messageParser";
import type { Character, Message, UserIdentity, UserSettings, WorldBookEntry } from "../src/types";
import type { CharacterPhoneContact, CharacterPhoneRecord } from "../src/domain/characterPhone/types";

const character: Character = {
  id: "character-generation",
  name: "role-card.json",
  sourceFileName: "role-card.json",
  remark: "阿宁",
  avatar: "🌙",
  personality: "安静、克制，习惯在夜里散步。",
  backstory: "在海边城市工作，和林晓是旧识。",
};
const identity: UserIdentity = { id: "identity-generation", name: "用户", avatar: "", signature: "", bio: "" };
const worldBook: WorldBookEntry[] = [{
  id: "world-generation",
  title: "role-card.json",
  category: "人物",
  content: "林晓是角色认识很久的朋友。周予是朋友，唐梨是同事，许予是邻居。",
  characterId: character.id,
  isActive: true,
  timestamp: 20,
}, {
  id: "world-title-only-name",
  title: "王强",
  category: "地点",
  content: "海边散步的天气记录。",
  characterId: character.id,
  isActive: true,
  timestamp: 19,
}];
const messages: Message[] = [{
  id: "chat-generation",
  characterId: character.id,
  relationId: "relation-generation",
  conversationId: "conversation-generation",
  sender: "user",
  content: "今晚还去海边散步吗？",
  timestamp: 30,
}, {
  id: "chat-text-image",
  characterId: character.id,
  relationId: "relation-generation",
  conversationId: "conversation-generation",
  sender: "user",
  content: createTextImageMarkup("海边入口的灯刚亮起来，潮湿的石阶上有一小片月光。"),
  timestamp: 35,
}, {
  id: "chat-private-text-image",
  characterId: character.id,
  relationId: "relation-generation",
  conversationId: "conversation-generation",
  sender: "user",
  content: createTextImageMarkup("锁屏后才敢保存的私密画面：窗帘缝里漏进一小片月光。"),
  timestamp: 36,
}];
const relation = {
  id: "relation-generation",
  userIdentityId: identity.id,
  characterId: character.id,
  conversationId: "conversation-generation",
  relationship: "friend" as const,
  createdAt: 1,
  updatedAt: 1,
};

const phone: CharacterPhoneRecord = {
  id: "phone-generation",
  ownerIdentityId: identity.id,
  characterId: character.id,
  passcode: "0000",
  failedAttempts: 0,
  createdAt: 1,
  updatedAt: 1,
  lastOpenedAt: 123,
  wallpaper: "linear-gradient(white, white)",
  appOrder: ["chat", "browser", "schedule", "gallery", "diary", "moments", "notes", "music", "settings"],
  messages: [],
  contacts: [{
    id: "contact-linxiao",
    name: "林晓",
    relation: "现实朋友",
    isLongTerm: true,
    isNpc: true,
    source: "linked",
  }],
  threadMessages: [],
  posts: [],
  browserHistory: [],
  diaryEntries: [],
  notes: [],
  todos: [],
  scheduleItems: [],
  galleryItems: [],
  activities: [],
};

const settings = {
  apiKey: "test-key",
  selectedModel: "test-model",
} as UserSettings;
let responsePayload: Record<string, unknown> = {};
const requestBodies: Array<Record<string, unknown>> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (_input, init) => {
  requestBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
  return new Response(JSON.stringify({ text: JSON.stringify(responsePayload) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

try {
  responsePayload = {
    lifeEventSummary: "今晚和林晓在海边见面",
    lifeEventAtHoursAgo: 2,
    evidenceSourceIds: ["chat:chat-generation", "worldbook:world-generation", "chat:invented"],
    contacts: [
      { name: "role-card.json", relation: "不应成为联系人" },
      { name: "林晓", relation: "现实朋友" },
      { name: "王强", relation: "模型凭空编造的人" },
    ],
    threadContactName: "林晓",
    threadIncoming: "晚点到，给你带杯热饮。",
    threadOutgoing: "好，我在海边入口等你。",
    searchQuery: "海边夜间散步路线",
    searchTitle: "海边夜间散步路线 - 搜索结果",
    searchResults: [
      { platform: "维基百科", title: "海边夜间散步路线资料", snippet: "整理了沿海步道、开放时间和夜间安全提醒。" },
      { platform: "知乎", title: "夜里去海边散步要注意什么？", snippet: "先确认路线照明和返程方式，再决定要不要出发。" },
      { platform: "小红书", title: "海边夜走实用笔记", snippet: "入口、风大时段和适合停留的地方可以提前记下。" },
    ],
    browserEntries: [
      { query: "海边夜间散步路线", title: "海边夜间散步路线 - 搜索结果", results: [{ platform: "维基百科", title: "海边夜间散步路线资料", snippet: "整理了沿海步道、开放时间和夜间安全提醒。" }, { platform: "知乎", title: "夜里去海边散步要注意什么？", snippet: "先确认路线照明和返程方式，再决定要不要出发。" }, { platform: "小红书", title: "海边夜走实用笔记", snippet: "入口、风大时段和适合停留的地方可以提前记下。" }], reflection: "先把路线和营业时间看清楚，别到了海边才发现白跑。其实是想找个不用解释太多的地方。" },
      { query: "海边步道末班交通", title: "夜间返程方式", results: [{ platform: "平台A", title: "末班交通时间", snippet: "提前确认回程班次。" }, { platform: "平台B", title: "沿海步道入口", snippet: "查看开放时间与入口位置。" }] },
    ],
    searchReflection: "先把路线和营业时间看清楚，别到了海边才发现白跑。其实是想找个不用解释太多的地方。",
    diaryTitle: "",
    diaryBody: "今晚又在入口站了很久，明明知道他可能不会来。",
    diaryEntries: [
      { title: "夜里的念头", body: "今晚又在入口站了很久，明明知道他可能不会来。" },
      { title: "回去以后", body: "风吹散了一些烦闷，回去前想把这段路再走一遍。" },
    ],
    noteTitle: "未命名笔记",
    noteContent: "记得把借来的书放回林晓那里。",
    noteEntries: [
      { title: "还书提醒", content: "记得把借来的书放回林晓那里。" },
      { title: "出门准备", content: "带上水和外套，回程前确认公交时间。" },
    ],
    todoText: "给林晓回电话",
    scheduleTitle: "",
    scheduleDetail: "周六傍晚和林晓在海边见面",
    scheduleAtHours: 8,
    postContent: "风比昨天温柔一点。",
    galleryTitle: "role-card.json",
    galleryCaption: "海边入口的灯刚亮起来。",
  };
  const generated = await advanceCharacterPhone({
    phone,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    now: 1_000,
  });

  assert.equal(generated.lastOpenedAt, phone.lastOpenedAt, "generation does not rewrite unlock time");
  assert.equal(generated.contacts.filter((contact) => contact.name === "role-card.json").length, 0, "filename is not a contact");
  assert.equal(generated.contacts.filter((contact) => contact.name === "王强").length, 0, "context-free NPC is not a contact");
  const generatedThreadMessages = generated.threadMessages.filter((message) =>
    message.content === "晚点到，给你带杯热饮。" || message.content === "好，我在海边入口等你。",
  );
  assert.equal(generatedThreadMessages.length, 2, "thread messages are written to the selected NPC thread");
  assert.ok(generatedThreadMessages.every((message) => message.contactId === "contact-linxiao"));
  assert.equal(generated.messages.length, 0, "NPC chat does not enter the user-character mirror");
  assert.ok(generated.diaryEntries[0]?.title, "diary title is derived from its real content");
  assert.ok(generated.notes?.[0]?.title, "note title is derived instead of using a placeholder");
  assert.ok(generated.todos?.some((todo) => todo.text === "给林晓回电话"), "generated todo is stored");
  const lifeEvent = generated.lifeEvents?.[0];
  assert.equal(lifeEvent?.summary, "今晚和林晓在海边见面");
  assert.deepEqual(lifeEvent?.sourceRefs, [
    { kind: "chat", id: "chat-generation" },
    { kind: "worldbook", id: "world-generation" },
  ], "keeps only evidence IDs that exist in the scoped life context");
  assert.ok((lifeEvent?.artifactRefs.length || 0) >= 2, "one life event links multiple app traces");
  assert.ok(new Set(lifeEvent?.artifactRefs.map((ref) => ref.app)).size <= 4, "one generation touches at most four apps");
  const linkedArtifactIds = new Set(lifeEvent?.artifactRefs.map((ref) => ref.id));
  assert.ok(generatedThreadMessages.every((message) => message.lifeEventId === lifeEvent?.id && linkedArtifactIds.has(message.id)));
  assert.equal(generated.browserHistory[0]?.lifeEventId, lifeEvent?.id);
  assert.equal(generated.browserHistory[0]?.reflection, "先把路线和营业时间看清楚，别到了海边才发现白跑。其实是想找个不用解释太多的地方。", "browser heart voice keeps the generated first-person reflection");
  assert.deepEqual(generated.browserHistory[0]?.results?.map((result) => result.platform), ["维基百科", "知乎", "小红书"], "browser detail keeps 2-3 AI platform results");
  assert.equal(generated.diaryEntries[0]?.lifeEventId, lifeEvent?.id);
  assert.equal(generated.notes?.[0]?.lifeEventId, lifeEvent?.id);
  assert.ok(!JSON.stringify(generated).includes("role-card.json"), "source filename never leaks into generated records");

  const request = requestBodies[0];
  const systemInstruction = String(request.systemInstruction || "");
  assert.match(systemInstruction, /角色资料：阿宁/);
  assert.match(systemInstruction, /条目标题（不是角色姓名）/);
  assert.match(systemInstruction, /今晚还去海边散步吗/);
  assert.match(systemInstruction, /可引用的证据来源ID/);
  assert.match(systemInstruction, /海边入口的灯刚亮起来/);
  assert.match(systemInstruction, /searchReflection/);
  assert.match(String(request.message || ""), /searchResults/);
  assert.match(systemInstruction, /不同平台/);
  assert.match(systemInstruction, /短句、停顿、犹豫/);
  assert.match(String(request.message || ""), /lifeEventSummary/);

  const initialGeneration = await advanceCharacterPhoneWithResult({
    phone: { ...phone, initialContentPending: true },
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    initial: true,
    now: 1_100,
  });
  assert.equal(initialGeneration.status, "no_change", "incomplete first initialization is not reported as generated");
  assert.equal(initialGeneration.reason, "incomplete_content");
  assert.equal(initialGeneration.phone.initialContentPending, true, "failed initialization stays retryable");
  assert.equal(initialGeneration.phone.initialContentGeneratedAt, undefined);
  assert.equal(initialGeneration.phone.generationCooldowns, undefined, "failed initialization does not start any cooldown");
  assert.match(String(requestBodies[1]?.systemInstruction || ""), /3—5位非用户NPC/);

  responsePayload = {
    lifeEventSummary: "和朋友们约好海边散步",
    evidenceSourceIds: ["chat:chat-generation"],
    contacts: [
      { name: "周予", relation: "朋友" },
      { name: "唐梨", relation: "同事" },
      { name: "许予", relation: "邻居" },
    ],
    contactThreads: [
      { contactName: "周予", messages: [{ sender: "contact", content: "我带了热饮。" }, { sender: "character", content: "好，我们在入口碰面。" }] },
      { contactName: "唐梨", messages: [{ sender: "contact", content: "明天的排班我发你了。" }, { sender: "character", content: "收到，今晚散步后我看一下。" }] },
      { contactName: "许予", messages: [{ sender: "contact", content: "楼下路灯今天修好了。" }, { sender: "character", content: "谢谢提醒，回去时我留意一下。" }] },
    ],
    browserEntries: [1, 2].map((index) => ({ query: `海边夜走问题${index}`, title: `夜间路线记录${index}`, results: [{ platform: "平台A", title: `结果${index}A`, snippet: "有用信息" }, { platform: "平台B", title: `结果${index}B`, snippet: "补充信息" }] })),
    scheduleItems: [3, 5].map((daysFromNow) => ({ title: `海边安排${daysFromNow}`, detail: "和朋友确认见面", daysFromNow })),
    diaryEntries: [{ title: "夜里的决定", body: "把今晚的见面记下来。" }, { title: "风停以后", body: "和朋友走了一段路，心里比出门时松快些。" }],
    noteEntries: [{ title: "带上的东西", content: "水和外套。" }, { title: "散步路线", content: "从海边入口出发，走到灯塔前折返。" }],
    todoEntries: [{ text: "给林晓回电话" }, { text: "明天确认周末安排" }],
    posts: [{ content: "风比昨天温柔一点。", visibility: "private" }, { content: "今天走了很久，刚好。", visibility: "user" }],
    galleryEntries: [{ title: "入口灯亮了", caption: "海边入口的路灯照着潮湿石阶。" }, { title: "散步后的海面", caption: "远处的海面映着一小片月光。" }],
    phoneCalls: [
      { contactName: "周予", direction: "incoming", durationSeconds: 90 },
      { contactName: "周予", direction: "outgoing", durationSeconds: 120 },
    ],
    musicTracks: [{ title: "海边之后", artist: "林晓推荐", duration: "3:42", current: true }, { title: "慢一点", artist: "常听歌单", duration: "4:01" }],
    musicListening: [{ trackTitle: "海边之后", playedHoursAgo: 2, durationSeconds: 240, playCount: 3 }, { trackTitle: "慢一点", playedHoursAgo: 8, durationSeconds: 180, playCount: 1 }],
    musicNowPlaying: { trackTitle: "海边之后" },
  };
  const batchInitial = await advanceCharacterPhoneWithResult({
    phone: { ...phone, id: "phone-generation-batch", initialContentPending: true },
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    initial: true,
    now: 1_150,
  });
  assert.equal(batchInitial.status, "generated");
  const initialNpcContacts = batchInitial.phone.contacts.filter((contact) => contact.isNpc
    && contact.kind !== "group"
    && batchInitial.phone.threadMessages.some((message) => message.contactId === contact.id && message.lifeEventId));
  assert.ok(initialNpcContacts.length >= 3 && initialNpcContacts.length <= 5, "first initialization always creates 3-5 NPC conversation contacts");
  for (const contact of initialNpcContacts) {
    const thread = batchInitial.phone.threadMessages.filter((message) => message.contactId === contact.id && message.lifeEventId);
    assert.ok(thread.length >= 2 && thread.length <= 5, `${contact.name} receives 2-5 messages`);
    assert.ok(thread.some((message) => message.sender === "contact") && thread.some((message) => message.sender === "character"), `${contact.name} thread contains both sides`);
  }
  assert.ok(batchInitial.phone.browserHistory.length >= 2 && batchInitial.phone.browserHistory.length <= 5, "first initialization keeps 2-5 search records");
  assert.ok(batchInitial.phone.scheduleItems.length >= 2 && batchInitial.phone.scheduleItems.length <= 5, "first initialization keeps 2-5 schedule items");
  assert.ok(batchInitial.phone.scheduleItems.every((item) => item.timestamp >= 1_150 + 3 * 24 * 60 * 60 * 1000 && item.timestamp <= 1_150 + 6 * 24 * 60 * 60 * 1000), "schedule records stay within the requested 3-6 day window");
  assert.ok(batchInitial.phone.diaryEntries.length >= 2 && batchInitial.phone.diaryEntries.length <= 5, "first initialization keeps 2-5 diary records");
  assert.ok((batchInitial.phone.notes?.length || 0) >= 2 && (batchInitial.phone.notes?.length || 0) <= 5, "first initialization keeps 2-5 notes");
  assert.ok((batchInitial.phone.todos?.length || 0) >= 2 && (batchInitial.phone.todos?.length || 0) <= 5, "first initialization keeps 2-5 todos");
  assert.ok(batchInitial.phone.posts.length >= 2 && batchInitial.phone.posts.length <= 5, "first initialization keeps 2-5 moments");
  assert.ok(batchInitial.phone.galleryItems.length >= 2 && batchInitial.phone.galleryItems.length <= 5, "first initialization keeps 2-5 album items");
  assert.ok((batchInitial.phone.phoneCalls?.length || 0) >= 2 && (batchInitial.phone.phoneCalls?.length || 0) <= 5, "first initialization keeps 2-5 call records");
  assert.ok(batchInitial.phone.posts.some((post) => post.visibility === "user" || post.visibility === "private"), "first initialization includes a user/private moment");
  assert.ok((batchInitial.phone.musicTracks?.length || 0) >= 2 && (batchInitial.phone.listeningHistory?.length || 0) >= 2, "first initialization keeps music tracks and listening history");
  assert.ok(batchInitial.phone.currentlyPlayingTrackId, "first initialization persists the currently-playing track");
  assert.equal(batchInitial.phone.generationCooldowns?.chat, 1_150 + 3 * 60 * 60 * 1000, "successful generation starts the selected app cooldown");
  assert.equal(Object.keys(batchInitial.phone.generationCooldowns || {}).length, 9, "successful first generation records cooldown per selected app");
  assert.match(String(requestBodies.at(-1)?.systemInstruction || ""), /phoneCalls:\[\{contactName,direction,durationSeconds\}\]/);
  assert.match(String(requestBodies.at(-1)?.systemInstruction || ""), /galleryEntries:\[\{title,caption,hidden\}\]/);

  responsePayload = {
    lifeEventSummary: "老妈提醒角色周末回家吃饭",
    evidenceSourceIds: ["worldbook:world-generation"],
  };
  const npcHistoryRepair = await advanceCharacterPhoneWithResult({
    phone: {
      ...phone,
      initialContentGeneratedAt: 900,
      contacts: [...phone.contacts, {
        id: "contact-mom-without-thread",
        name: "老妈",
        relation: "家人",
        kind: "npc",
        isLongTerm: true,
        isNpc: true,
        source: "generated",
        sourceRefs: [{ kind: "worldbook", id: "world-generation" }],
      }],
    },
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    initial: false,
    now: 1_175,
  });
  const repairedNpcThread = npcHistoryRepair.phone.threadMessages.filter((message) => message.contactId === "contact-mom-without-thread");
  assert.equal(npcHistoryRepair.status, "generated", "validated generation can repair an existing NPC contact after first initialization");
  assert.equal(repairedNpcThread.length, 2, "an evidence-backed contact missing history receives a two-sided thread");
  assert.ok(repairedNpcThread.some((message) => message.sender === "contact") && repairedNpcThread.some((message) => message.sender === "character"));

  responsePayload = {
    lifeEventSummary: "老妈提醒角色周末回家吃饭",
    evidenceSourceIds: ["worldbook:world-generation"],
    contactThreads: [{
      contactName: "老妈",
      messages: [
        { sender: "contact", content: "周末回来吃饭吗？" },
        { sender: "character", content: "好，我周六回去。" },
      ],
    }],
    diaryEntries: [{ title: "不应写入", body: "专项修复不能写日记。" }],
    scheduleItems: [{ title: "不应写入日程", detail: "专项修复不能写日程。", daysFromNow: 1 }],
  };
  const phoneWithExistingArtifacts = {
    ...phone,
    initialContentGeneratedAt: 900,
    diaryEntries: [{ id: "diary-existing", title: "已有日记", body: "保持不变", timestamp: 850 }],
    scheduleItems: [{ id: "schedule-existing", title: "已有日程", detail: "保持不变", timestamp: 950 }],
    contacts: [...phone.contacts, {
      id: "contact-mom-targeted-repair",
      name: "老妈",
      relation: "家人",
      kind: "npc" as const,
      isLongTerm: true,
      isNpc: true,
      source: "generated" as const,
      sourceRefs: [{ kind: "worldbook" as const, id: "world-generation" }],
    }],
  };
  const targetedNpcHistoryRepair = await advanceCharacterPhoneWithResult({
    phone: phoneWithExistingArtifacts,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    contactThreadRepair: true,
    now: 1_180,
  });
  assert.equal(targetedNpcHistoryRepair.status, "generated");
  assert.equal(targetedNpcHistoryRepair.phone.initialContentGeneratedAt, 900, "contact-only repair preserves initialization marker");
  assert.deepEqual(targetedNpcHistoryRepair.phone.diaryEntries, phoneWithExistingArtifacts.diaryEntries, "contact-only repair leaves diary untouched");
  assert.deepEqual(targetedNpcHistoryRepair.phone.scheduleItems, phoneWithExistingArtifacts.scheduleItems, "contact-only repair leaves schedules untouched");
  assert.equal(targetedNpcHistoryRepair.phone.browserHistory.length, phoneWithExistingArtifacts.browserHistory.length);
  assert.equal(targetedNpcHistoryRepair.phone.threadMessages.filter((message) => message.contactId === "contact-mom-targeted-repair").length, 2);
  assert.match(String(requestBodies.at(-1)?.message || ""), /联系人聊天记录专项修复/);
  assert.match(String(requestBodies.at(-1)?.message || ""), /不得生成.*日记.*日程/);

  const multiNpcRepairPhone = {
    ...phone,
    initialContentGeneratedAt: 900,
    contacts: [...phone.contacts,
      {
        id: "repair-npc-mom-a",
        name: "老妈",
        relation: "家人",
        kind: "npc" as const,
        isLongTerm: true,
        isNpc: true,
        source: "generated" as const,
        sourceRefs: [{ kind: "worldbook" as const, id: "world-generation" }],
      },
      {
        id: "repair-npc-mom-b",
        name: "老妈",
        relation: "家人",
        kind: "npc" as const,
        isLongTerm: true,
        isNpc: true,
        source: "generated" as const,
        sourceRefs: [{ kind: "worldbook" as const, id: "world-generation" }],
      },
      {
        id: "repair-npc-friend",
        name: "林晓二",
        relation: "朋友",
        kind: "npc" as const,
        isLongTerm: true,
        isNpc: true,
        source: "generated" as const,
        sourceRefs: [{ kind: "worldbook" as const, id: "world-generation" }],
      },
    ],
    threadMessages: [{
      id: "repair-npc-one-sided",
      contactId: "repair-npc-mom-a",
      sender: "contact" as const,
      content: "周末还回来吗？",
      timestamp: 950,
    }],
  };
  responsePayload = {
    lifeEventSummary: "",
    evidenceSourceIds: [],
    contactThreads: [{
      contactName: "老妈",
      messages: [
        { sender: "contact", content: "周末回来吃饭吗？" },
        { sender: "character", content: "好，我周六回去。" },
      ],
    }],
  };
  const multiNpcRepair = await advanceCharacterPhoneWithResult({
    phone: multiNpcRepairPhone,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    contactThreadRepair: true,
    now: 1_185,
  });
  assert.equal(multiNpcRepair.status, "generated", "persisted target evidence allows repair even if the provider omits citations");
  for (const contactId of ["repair-npc-mom-a", "repair-npc-mom-b", "repair-npc-friend"]) {
    const thread = multiNpcRepair.phone.threadMessages.filter((message) => message.contactId === contactId);
    assert.ok(thread.some((message) => message.sender === "contact"), `${contactId} keeps/receives a contact message`);
    assert.ok(thread.some((message) => message.sender === "character"), `${contactId} receives the missing role reply`);
    assert.ok(thread.filter((message) => message.id !== "repair-npc-one-sided")
      .every((message) => message.sourceRefs?.some((source) => source.kind === "worldbook" && source.id === "world-generation")), `${contactId} newly repaired messages cite their verified source`);
  }
  assert.equal(multiNpcRepair.phone.threadMessages.filter((message) => message.contactId === "repair-npc-mom-a" && message.sender === "contact").length, 1, "repair only adds the missing side of an existing one-sided conversation");
  assert.match(String(requestBodies.at(-1)?.message || ""), /repair-npc-mom-a/);

  const missingApiConfig = await advanceCharacterPhoneWithResult({
    phone,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
  });
  assert.equal(missingApiConfig.status, "no_change");
  assert.equal(missingApiConfig.reason, "missing_api_config");

  responsePayload = "not-json" as unknown as Record<string, unknown>;
  const invalidProviderResponse = await advanceCharacterPhoneWithResult({
    phone,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    now: 1_200,
  });
  assert.equal(invalidProviderResponse.status, "no_change");
  assert.equal(invalidProviderResponse.reason, "invalid_response");

  responsePayload = {
    lifeEventSummary: "把聊天里那张文字图收进相册",
    evidenceSourceIds: ["chat:chat-text-image"],
    galleryEntries: [
      { title: "海边入口", caption: "海边入口的灯刚亮起来，潮湿的石阶上有一小片月光。" },
      { title: "灯塔步道", caption: "沿着海边步道往前走，远处的灯塔在夜色里亮着。" },
    ],
  };
  const withTextImageGallery = await advanceCharacterPhone({
    phone: generated,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    now: 1_500,
  });
  assert.ok(withTextImageGallery.galleryItems.some((item) => item.dataUrl?.startsWith("data:image/svg+xml")), "gallery generation renders a local text image");
  assert.ok(withTextImageGallery.galleryItems.some((item) => /文字图$/.test(item.title)), "generated gallery item is labelled as a text image");
  assert.ok(withTextImageGallery.galleryItems.some((item) => item.caption.includes("海边入口的灯刚亮起来")), "gallery fallback reuses the scoped main-phone text-image description");

  responsePayload = {
    lifeEventSummary: "把公开海边画面误放进隐藏相册",
    evidenceSourceIds: ["chat:chat-text-image"],
    hiddenGalleryTitle: "海边记录",
    hiddenGalleryCaption: "海边入口的灯刚亮起来。",
  };
  const withoutPrivateGallery = await advanceCharacterPhone({
    phone: withTextImageGallery,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    now: 1_800,
  });
  assert.equal(withoutPrivateGallery.galleryItems.length, withTextImageGallery.galleryItems.length, "public evidence cannot create a hidden gallery item");

  responsePayload = {
    lifeEventSummary: "把锁屏后保存的私密画面收进隐藏相册",
    evidenceSourceIds: ["chat:chat-private-text-image"],
    hiddenGalleryTitle: "锁屏私藏",
    hiddenGalleryCaption: "只在夜里独自查看的私密画面。",
  };
  const withPrivateGallery = await advanceCharacterPhone({
    phone: withoutPrivateGallery,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    now: 1_900,
  });
  const privateGalleryItem = withPrivateGallery.galleryItems.find((item) => item.hidden);
  assert.ok(privateGalleryItem, "private evidence creates a hidden gallery item");
  assert.equal(privateGalleryItem?.source, "generated");
  assert.ok(privateGalleryItem?.dataUrl?.startsWith("data:image/svg+xml"), "hidden gallery item uses a local text image");
  assert.match(privateGalleryItem?.caption || "", /私密/);

  responsePayload = {
    contacts: [],
    threadContactName: "王强",
    threadIncoming: "你应该看不到这句话。",
    diaryTitle: "未命名记录",
    noteTitle: "标题",
    scheduleTitle: "未命名安排",
    galleryTitle: "无标题",
  };
  const withoutPlaceholders = await advanceCharacterPhone({
    phone: withTextImageGallery,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    now: 2_000,
  });
  assert.equal(withoutPlaceholders.diaryEntries.length, generated.diaryEntries.length);
  assert.equal(withoutPlaceholders.notes?.length, generated.notes?.length);
  assert.ok(withoutPlaceholders.todos?.some((todo) => todo.text === "给林晓回电话"), "generated todo survives the next sync");
  assert.equal(withoutPlaceholders.scheduleItems.length, generated.scheduleItems.length);
  assert.equal(withoutPlaceholders.galleryItems.length, withTextImageGallery.galleryItems.length);
  assert.equal(withoutPlaceholders.lifeEvents?.length, withTextImageGallery.lifeEvents?.length, "does not create an empty life event");
  assert.ok(!withoutPlaceholders.threadMessages.some((message) => message.content === "你应该看不到这句话。"));

  responsePayload = {
    lifeEventSummary: "林晓打来电话确认见面时间",
    evidenceSourceIds: ["worldbook:world-generation"],
    phoneCalls: [
      { contactName: "林晓", direction: "incoming", durationSeconds: 185 },
      { contactName: "林晓", direction: "outgoing", durationSeconds: 75 },
    ],
    callContactName: "林晓",
    callDirection: "incoming",
    callDurationSeconds: 185,
  };
  const withCall = await advanceCharacterPhone({
    phone: withoutPlaceholders,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    now: 3_000,
  });
  assert.equal(withCall.phoneCalls?.[0]?.contactId, "contact-linxiao");
  assert.equal(withCall.phoneCalls?.[0]?.direction, "incoming");
  assert.equal(withCall.phoneCalls?.[0]?.durationSeconds, 185);
  const callEvent = withCall.lifeEvents?.at(-1);
  assert.ok(callEvent?.artifactRefs.some((ref) => ref.app === "phone" && ref.id === withCall.phoneCalls?.[0]?.id));

  responsePayload = {
    lifeEventSummary: "没有真实来源的搜索",
    evidenceSourceIds: ["chat:invented"],
    searchQuery: "不应保存的搜索",
    searchTitle: "不应保存的搜索结果",
  };
  const withoutEvidence = await advanceCharacterPhone({
    phone: withCall,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    now: 4_000,
  });
  assert.equal(withoutEvidence.browserHistory.length, withCall.browserHistory.length, "rejects artifacts without a valid scoped evidence ID");
  assert.equal(withoutEvidence.lifeEvents?.length, withCall.lifeEvents?.length);

  responsePayload = {
    lifeEventSummary: "normalized browser trace",
    evidenceSourceIds: ["chat:chat-generation"],
    searchQuery: "normalize-me",
    searchTitle: "Normalize Me",
  };
  const firstNormalized = await advanceCharacterPhone({
    phone: withCall,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    now: 5_000,
  });
  responsePayload = {
    lifeEventSummary: "normalized browser trace again",
    evidenceSourceIds: ["chat:chat-generation"],
    searchQuery: "  NORMALIZE-ME  ",
    searchTitle: " normalize   me ",
  };
  const secondNormalized = await advanceCharacterPhone({
    phone: firstNormalized,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    now: 6_000,
  });
  assert.equal(secondNormalized.browserHistory.length, firstNormalized.browserHistory.length, "normalizes repeated browser traces instead of appending duplicates");

  responsePayload = {
    lifeEventSummary: "角色只写下一段日记",
    evidenceSourceIds: ["chat:chat-generation"],
    contacts: [{ name: "越界NPC", relation: "未经选择的聊天联系人" }],
    userThreadMessages: [{ sender: "character", content: "这条聊天应用没有被选中。" }],
    contactThreads: [{ contactName: "林晓", messages: [{ sender: "contact", content: "这条 NPC 聊天也不应写入。" }] }],
    browserEntries: [{ query: "越界搜索", title: "不应新增浏览记录" }],
    scheduleItems: [{ title: "不应新增日程", detail: "越界" }],
    diaryEntries: [
      { title: "今晚的念头", body: "只把这件事记在自己的日记里。" },
      { title: "睡前再想想", body: "还有些细节没想好，明天醒来再处理。" },
    ],
    noteEntries: [{ title: "越界备忘录", content: "不应写入" }],
    todoEntries: [{ text: "不应新增待办" }],
    posts: [{ content: "不应新增朋友圈", visibility: "public" }],
    galleryTitle: "不应新增相册",
    galleryCaption: "越界相册内容",
    callContactName: "林晓",
    callDirection: "incoming",
    musicTracks: [{ title: "越界曲目", artist: "越界艺人", duration: "3:00" }],
    musicListening: [{ trackTitle: "越界曲目", playedHoursAgo: 1 }],
    musicNowPlaying: { trackTitle: "越界曲目" },
  };
  const selectedDiaryOnly = await advanceCharacterPhoneWithResult({
    phone: { ...phone, initialContentGeneratedAt: 900 },
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    selectedApps: ["diary"],
    now: 7_000,
  });
  assert.equal(selectedDiaryOnly.status, "generated");
  assert.ok(selectedDiaryOnly.phone.diaryEntries.some((entry) => entry.title === "今晚的念头"), "selected application receives its new content");
  assert.ok(!selectedDiaryOnly.phone.contacts.some((contact) => contact.name === "越界NPC"), "unselected chat contacts are rejected even if returned by provider");
  assert.ok(!selectedDiaryOnly.phone.threadMessages.some((entry) => entry.lifeEventId && entry.content.includes("不应写入")), "unselected chat threads are rejected");
  assert.ok(!selectedDiaryOnly.phone.browserHistory.some((entry) => entry.query === "越界搜索"), "unselected browser data is rejected");
  assert.ok(!selectedDiaryOnly.phone.scheduleItems.some((entry) => entry.title === "不应新增日程"), "unselected schedule data is rejected");
  assert.ok(!selectedDiaryOnly.phone.notes?.some((entry) => entry.title === "越界备忘录"), "unselected notes are rejected");
  assert.ok(!selectedDiaryOnly.phone.todos?.some((entry) => entry.text === "不应新增待办"), "unselected todos are rejected");
  assert.ok(!selectedDiaryOnly.phone.posts.some((entry) => entry.content === "不应新增朋友圈"), "unselected moments are rejected");
  assert.ok(!selectedDiaryOnly.phone.galleryItems.some((entry) => entry.title === "不应新增相册"), "unselected gallery data is rejected");
  assert.equal(selectedDiaryOnly.phone.phoneCalls?.length || 0, phone.phoneCalls?.length || 0, "unselected calls are rejected");
  assert.ok(!selectedDiaryOnly.phone.musicTracks?.some((entry) => entry.title === "越界曲目"), "unselected music tracks are rejected");
  assert.ok(!selectedDiaryOnly.phone.listeningHistory?.some((entry) => entry.source === "generated"), "unselected listening history is rejected outside normal artifact insertion");
  assert.deepEqual(new Set(selectedDiaryOnly.phone.lifeEvents?.at(-1)?.artifactRefs.map((ref) => ref.app)), new Set(["diary"]), "life event links only selected application artifacts");
  const selectedDiaryRequest = requestBodies.at(-1);
  assert.match(String(selectedDiaryRequest?.systemInstruction || ""), /只允许生成这些应用：日记/);
  assert.match(String(selectedDiaryRequest?.message || ""), /只生成以下应用的新内容：日记/);

  responsePayload = {
    lifeEventSummary: "角色给用户发来一条消息",
    evidenceSourceIds: ["chat:chat-generation"],
    userThreadMessages: [
      { sender: "contact", content: "不能伪造用户的话。" },
      { sender: "character", content: "刚忙完，想跟你说一声。" },
      { sender: "character", content: "到家后我再把那件事说完。" },
    ],
  };
  const selectedChatOnly = await advanceCharacterPhoneWithResult({
    phone: { ...phone, initialContentGeneratedAt: 900 },
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    selectedApps: ["chat"],
    now: 8_000,
  });
  const selectedDirectContact = selectedChatOnly.phone.contacts.find((contact) => contact.kind === "user" && contact.relationId === relation.id);
  const selectedDirectGenerated = selectedChatOnly.phone.threadMessages.filter((entry) => entry.contactId === selectedDirectContact?.id && entry.lifeEventId);
  assert.equal(selectedDirectGenerated.length, 2, "chat update writes 2-5 character-authored direct messages");
  assert.ok(selectedDirectGenerated.every((entry) => entry.sender === "character"), "does not generate an owner-side bubble");
  assert.ok(selectedDirectGenerated.some((entry) => entry.content === "刚忙完，想跟你说一声。"));
  assert.deepEqual(new Set(selectedChatOnly.phone.lifeEvents?.at(-1)?.artifactRefs.map((ref) => ref.app)), new Set(["chat"]));
  assert.equal(selectedDiaryOnly.phone.generationCooldowns?.diary, 7_000 + 3 * 60 * 60 * 1000);
  assert.equal(selectedDiaryOnly.phone.generationCooldowns?.chat, undefined, "generating diary does not cool down chat");
  assert.equal(selectedChatOnly.phone.generationCooldowns?.chat, 8_000 + 3 * 60 * 60 * 1000);

  const requestsBeforeCoolingRetry = requestBodies.length;
  const coolingChatRetry = await advanceCharacterPhoneWithResult({
    phone: selectedChatOnly.phone,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    selectedApps: ["chat"],
    now: 8_001,
  });
  assert.equal(coolingChatRetry.reason, "cooldown", "a selected app in cooldown returns before calling the model");
  assert.equal(requestBodies.length, requestsBeforeCoolingRetry, "cooldown rejection consumes no model request");

  responsePayload = {
    lifeEventSummary: "记下散步后的想法",
    evidenceSourceIds: ["chat:chat-generation"],
    diaryEntries: [
      { title: "夜风", body: "回来的路上想了很多，心里安静一些。" },
      { title: "明天再说", body: "今天先休息，明天再把没说完的话讲清楚。" },
    ],
  };
  const diaryWhileChatCooling = await advanceCharacterPhoneWithResult({
    phone: selectedChatOnly.phone,
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    selectedApps: ["diary"],
    now: 8_002,
  });
  assert.equal(diaryWhileChatCooling.status, "generated", "an unrelated app remains available while chat is cooling down");
  assert.equal(diaryWhileChatCooling.phone.generationCooldowns?.chat, selectedChatOnly.phone.generationCooldowns?.chat, "generating diary preserves chat's existing deadline");
  assert.equal(diaryWhileChatCooling.phone.generationCooldowns?.diary, 8_002 + 3 * 60 * 60 * 1000, "only the newly selected diary app receives a deadline");

  responsePayload = {
    lifeEventSummary: "尝试生成但数量不足",
    evidenceSourceIds: ["chat:chat-generation"],
    browserEntries: [{ query: "仅一条", title: "单条搜索" }],
  };
  const incompleteBrowser = await advanceCharacterPhoneWithResult({
    phone: { ...phone, initialContentGeneratedAt: 900 },
    character,
    activeIdentity: identity,
    relationships: [relation],
    messages,
    moments: [],
    worldBookEntries: worldBook,
    settings,
    selectedApps: ["browser"],
    now: 9_000,
  });
  assert.equal(incompleteBrowser.reason, "incomplete_content", "one visible record cannot masquerade as a successful app update");
  assert.equal(incompleteBrowser.phone.generationCooldowns?.browser, undefined, "failed app generation does not start cooldown");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("character phone generation contract tests passed");
