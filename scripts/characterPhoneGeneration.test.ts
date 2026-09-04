import assert from "node:assert/strict";
import { advanceCharacterPhone } from "../src/features/characterPhone/characterPhoneProgression";
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
  content: "林晓是角色认识很久的朋友。",
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
    searchReflection: "先把路线和营业时间看清楚，别到了海边才发现白跑。其实是想找个不用解释太多的地方。",
    diaryTitle: "",
    diaryBody: "今晚又在入口站了很久，明明知道他可能不会来。",
    noteTitle: "未命名笔记",
    noteContent: "记得把借来的书放回林晓那里。",
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

  responsePayload = {
    lifeEventSummary: "把聊天里那张文字图收进相册",
    evidenceSourceIds: ["chat:chat-text-image"],
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
} finally {
  globalThis.fetch = originalFetch;
}

console.log("character phone generation contract tests passed");
