import assert from "node:assert/strict";
import { advanceCharacterPhone } from "../src/features/characterPhone/characterPhoneProgression";
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
}];
const messages: Message[] = [{
  id: "chat-generation",
  characterId: character.id,
  sender: "user",
  content: "今晚还去海边散步吗？",
  timestamp: 30,
}];

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
    relationships: [],
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
  assert.ok(generated.scheduleItems[0]?.title, "schedule title is derived from its detail");
  assert.ok(generated.galleryItems[0]?.title, "gallery title is derived from its caption");
  assert.ok(!JSON.stringify(generated).includes("role-card.json"), "source filename never leaks into generated records");

  const request = requestBodies[0];
  const systemInstruction = String(request.systemInstruction || "");
  assert.match(systemInstruction, /角色资料：阿宁/);
  assert.match(systemInstruction, /条目标题（不是角色姓名）/);
  assert.match(systemInstruction, /今晚还去海边散步吗/);

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
    phone: generated,
    character,
    activeIdentity: identity,
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
  assert.equal(withoutPlaceholders.galleryItems.length, generated.galleryItems.length);
  assert.ok(!withoutPlaceholders.threadMessages.some((message) => message.content === "你应该看不到这句话。"));
} finally {
  globalThis.fetch = originalFetch;
}

console.log("character phone generation contract tests passed");
