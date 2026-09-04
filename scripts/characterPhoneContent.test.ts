import assert from "node:assert/strict";
import { ensureCharacterPhoneContent, normalizeCharacterPhoneMessages } from "../src/features/characterPhone/characterPhoneContent";
import type { Character, Message, Moment, UserIdentity, WorldBookEntry } from "../src/types";
import type { CharacterPhoneRecord } from "../src/domain/characterPhone/types";

const characterA: Character = {
  id: "character-a",
  name: "阿宁",
  avatar: "🌙",
  personality: "安静、克制，喜欢夜晚散步。",
  backstory: "在海边城市工作，和林晓是旧识。舍友/朋友：很多，但都是泛泛之交。",
};
const characterB: Character = {
  id: "character-b",
  name: "阿澈",
  avatar: "☀️",
  personality: "外向，喜欢热闹。",
  backstory: "住在另一座城市。",
};
const identity: UserIdentity = {
  id: "identity-a",
  name: "用户甲",
  avatar: "",
  signature: "",
  bio: "",
};
const relation = {
  id: "relation-a",
  userIdentityId: identity.id,
  characterId: characterA.id,
  conversationId: "conversation-a",
  relationship: "friend" as const,
  createdAt: 1,
  updatedAt: 1,
};
const worldBook: WorldBookEntry[] = [{
  id: "world-a",
  title: "阿宁的生活",
  category: "人物",
  content: "林晓是阿宁认识很久的朋友。",
  timestamp: 1,
  characterId: characterA.id,
  isActive: true,
}];
const messages: Message[] = [
  { id: "message-a", characterId: characterA.id, relationId: relation.id, sender: "user", content: "今晚还散步吗？", timestamp: 10 },
  { id: "message-b", characterId: characterB.id, sender: "user", content: "另一条关系的消息", timestamp: 11 },
  { id: "message-unscoped", characterId: characterA.id, sender: "user", content: "没有归属的旧消息", timestamp: 12 },
  { id: "message-other-relation", characterId: characterA.id, relationId: "relation-other", sender: "user", content: "其他身份的关系消息", timestamp: 13 },
];
const moments: Moment[] = [
  { id: "moment-a", ownerIdentityId: identity.id, characterId: characterA.id, authorName: characterA.name, authorAvatar: characterA.avatar, content: "海边的风很大。", timestamp: 20, likes: [], comments: [] },
  { id: "moment-b", ownerIdentityId: identity.id, characterId: characterB.id, authorName: characterB.name, authorAvatar: characterB.avatar, content: "不属于阿宁的内容。", timestamp: 21, likes: [], comments: [] },
  { id: "moment-user", ownerIdentityId: identity.id, authorName: identity.name, authorAvatar: identity.avatar, content: "用户公开发布的内容。", timestamp: 22, likes: [], comments: [] },
  { id: "moment-other-owner", ownerIdentityId: "identity-other", characterId: characterA.id, authorName: characterA.name, authorAvatar: characterA.avatar, content: "其他身份下的角色动态。", timestamp: 23, likes: [], comments: [] },
];

function emptyPhone(id: string, characterId: string): CharacterPhoneRecord {
  return {
    id,
    ownerIdentityId: identity.id,
    characterId,
    passcode: "0000",
    failedAttempts: 0,
    createdAt: 1,
    updatedAt: 1,
    wallpaper: "linear-gradient(white, white)",
    appOrder: ["chat", "browser", "schedule", "gallery", "diary", "moments", "notes", "music", "settings"],
    messages: [],
    contacts: [],
    threadMessages: [],
    posts: [],
    browserHistory: [],
    diaryEntries: [],
    scheduleItems: [],
    galleryItems: [],
    activities: [],
  };
}

const phoneA = ensureCharacterPhoneContent({
  phone: emptyPhone("phone-a", characterA.id),
  character: characterA,
  characters: [characterA, characterB],
  activeIdentity: identity,
  relationships: [relation],
  messages,
  moments,
  worldBookEntries: worldBook,
  now: 100,
});
const phoneB = ensureCharacterPhoneContent({
  phone: emptyPhone("phone-b", characterB.id),
  character: characterB,
  characters: [characterA, characterB],
  activeIdentity: identity,
  relationships: [],
  messages,
  moments,
  worldBookEntries: worldBook,
  now: 100,
});

assert.equal(phoneA.contacts[0].name, identity.name);
assert.ok(phoneA.contacts.some((contact) => contact.name === "林晓"));
assert.ok(!phoneA.contacts.some((contact) => contact.name === "很多"), "does not treat quantity words as contact names");
assert.ok(!phoneA.contacts.some((contact) => contact.name === "周岚"), "does not add hard-coded contacts without context");
assert.ok(phoneA.threadMessages.some((message) => message.sourceMessageId === "message-a"));
assert.ok(!phoneA.threadMessages.some((message) => message.content.includes("另一条关系")));
assert.ok(!phoneA.threadMessages.some((message) => message.content.includes("没有归属")));
assert.ok(!phoneA.threadMessages.some((message) => message.content.includes("其他身份")));
assert.ok(phoneA.posts.some((post) => post.sourceMomentId === "moment-a"));
assert.ok(phoneA.posts.some((post) => post.sourceMomentId === "moment-user"));
assert.ok(!phoneA.posts.some((post) => post.sourceMomentId === "moment-b"));
assert.ok(!phoneA.posts.some((post) => post.sourceMomentId === "moment-other-owner"));
assert.ok(phoneA.contentSeededAt);
assert.notEqual(phoneA.posts.find((post) => post.sourceMomentId === "moment-a")?.id, phoneB.posts.find((post) => post.sourceMomentId === "moment-b")?.id);
assert.equal(phoneA.diaryEntries.length, 0, "does not seed a synthetic diary before a life event is generated");
assert.equal(phoneA.scheduleItems.length, 0, "does not seed a synthetic schedule before a life event is generated");
assert.equal(phoneA.musicTracks?.length, 0, "does not seed a synthetic music library without a user source");
assert.equal(phoneA.listeningHistory?.length, 0, "does not seed synthetic listening history without a user source");
assert.equal(phoneA.musicPlaylists?.length, 0, "does not seed a synthetic playlist without a user source");

const staleUserThreadPhone = emptyPhone("phone-stale-user-thread", characterA.id);
staleUserThreadPhone.contacts = [{
  id: "character-phone:phone-stale-user-thread:contact:user",
  name: identity.name,
  relation: "与角色聊天",
  kind: "user",
  isLongTerm: true,
  isNpc: false,
  source: "user",
}];
staleUserThreadPhone.threadMessages = [{
  id: "stale-user-thread-message",
  contactId: "character-phone:phone-stale-user-thread:contact:user",
  sender: "contact",
  content: "这条消息只存在于角色手机旧数据中。",
  timestamp: 30,
}];
const reconciledStaleUserThread = ensureCharacterPhoneContent({
  phone: staleUserThreadPhone,
  character: characterA,
  characters: [characterA, characterB],
  activeIdentity: identity,
  relationships: [relation],
  messages: [],
  moments: [],
  worldBookEntries: worldBook,
  now: 100,
});
assert.equal(
  reconciledStaleUserThread.threadMessages.some((message) => message.id === "stale-user-thread-message"),
  false,
  "role-phone user thread strictly mirrors the main chat and drops stale local messages",
);

const duplicatePhoneAlert = {
  id: "phone-discovery-action-2",
  sender: characterA.name,
  body: "我的联系人备注好像被改过了。你知道是谁改的吗？",
  timestamp: 2,
  unread: true,
};
const normalizedPhoneMessages = normalizeCharacterPhoneMessages([
  { ...duplicatePhoneAlert, id: "phone-discovery-action-1" },
  duplicatePhoneAlert,
  { id: "phone-message-user-copy", sender: characterA.name, body: duplicatePhoneAlert.body, timestamp: 3 },
]);
assert.equal(normalizedPhoneMessages.length, 2, "collapses duplicate generated alerts but preserves normal messages");

const duplicateSearch = {
  id: "phone-generated-search-legacy",
  query: "旧版搜索",
  title: "旧版搜索标题",
  timestamp: 2,
};
const normalizedHistoryPhone = ensureCharacterPhoneContent({
  phone: {
    ...phoneA,
    browserHistory: [
      ...phoneA.browserHistory,
      { ...duplicateSearch, id: "phone-search-generated-duplicate" },
      { ...duplicateSearch, id: "phone-search-user-repeat" },
    ],
  },
  character: characterA,
  characters: [characterA, characterB],
  activeIdentity: identity,
  relationships: [relation],
  messages,
  moments,
  worldBookEntries: worldBook,
  now: 200,
});
assert.equal(normalizedHistoryPhone.browserHistory.length, 1, "removes legacy generated history while preserving the explicit user search");

const duplicateSchedule = {
  id: "phone-generated-schedule-legacy",
  title: "旧版日程",
  detail: "旧版日程详情",
  timestamp: 2,
};
const normalizedSchedulePhone = ensureCharacterPhoneContent({
  phone: {
    ...phoneA,
    scheduleItems: [
      ...phoneA.scheduleItems,
      { ...duplicateSchedule, id: "phone-schedule-generated-duplicate" },
      { ...duplicateSchedule, id: "character-phone-schedule-user-repeat" },
    ],
  },
  character: characterA,
  characters: [characterA, characterB],
  activeIdentity: identity,
  relationships: [relation],
  messages,
  moments,
  worldBookEntries: worldBook,
  now: 300,
});
assert.equal(normalizedSchedulePhone.scheduleItems.length, 1, "removes legacy generated schedules while preserving the explicit user schedule");

const legacyPhone = ensureCharacterPhoneContent({
  phone: {
    ...phoneA,
    contacts: [
      { id: "phone-contact-old", name: "林晓", relation: "现实朋友", isLongTerm: true, isNpc: true },
      phoneA.contacts[0],
    ],
    threadMessages: [{ id: "phone-thread-message-old", contactId: "phone-contact-old", sender: "contact", content: "旧模板消息", timestamp: 2 }],
    browserHistory: [{ id: "phone-search-old", query: "旧模板搜索", title: "旧模板标题", timestamp: 2 }],
    diaryEntries: [{ id: "phone-diary-old", title: "旧模板日记", body: "旧模板内容", timestamp: 2 }],
    notes: [{ id: "phone-note-old", title: "旧模板备忘录", content: "旧模板内容", timestamp: 2 }],
    todos: [{ id: "phone-todo-old", text: "旧模板待办", checked: false, source: "generated" }],
    scheduleItems: [{ id: "phone-schedule-old", title: "旧模板日程", detail: "旧模板内容", timestamp: 2 }],
    posts: [{ id: "phone-post-old", author: characterA.name, content: "旧模板朋友圈", timestamp: 2, likes: 0, comments: [], source: "generated" }],
    galleryItems: [
      { id: "phone-gallery-old", title: "旧模板相册", caption: "旧模板内容", timestamp: 2, source: "generated" },
      { id: "phone-gallery-received", title: "用户发送的图片", caption: "保留", timestamp: 3, source: "received" },
    ],
  },
  character: characterA,
  characters: [characterA, characterB],
  activeIdentity: identity,
  relationships: [relation],
  messages,
  moments,
  worldBookEntries: worldBook,
  now: 400,
});
assert.ok(!legacyPhone.contacts.some((contact) => contact.id === "phone-contact-old"), "removes legacy generated contacts");
assert.ok(!legacyPhone.threadMessages.some((message) => message.id === "phone-thread-message-old"), "removes orphaned legacy contact messages");
assert.equal(legacyPhone.browserHistory.some((entry) => entry.id === "phone-search-old"), false);
assert.equal(legacyPhone.diaryEntries.some((entry) => entry.id === "phone-diary-old"), false);
assert.equal(legacyPhone.notes?.some((note) => note.id === "phone-note-old"), false);
assert.equal(legacyPhone.todos?.some((todo) => todo.id === "phone-todo-old"), false);
assert.equal(legacyPhone.scheduleItems.some((entry) => entry.id === "phone-schedule-old"), false);
assert.equal(legacyPhone.posts.some((post) => post.id === "phone-post-old"), false);
assert.equal(legacyPhone.galleryItems.some((item) => item.id === "phone-gallery-old"), false);
assert.equal(legacyPhone.galleryItems.some((item) => item.id === "phone-gallery-received"), true, "preserves received photos");

const repeatedMusicPrefix = `character-phone:${phoneA.id}:music:`;
const normalizedMusicPhone = ensureCharacterPhoneContent({
  phone: {
    ...phoneA,
    musicTracks: [{
      id: `${repeatedMusicPrefix}${repeatedMusicPrefix}track-1`,
      title: "海边散步",
      artist: "林晓",
      duration: "3:20",
    }],
    musicPlaylists: [{ id: "playlist", name: "最近常听", trackIds: [`${repeatedMusicPrefix}${repeatedMusicPrefix}track-1`] }],
  },
  character: characterA,
  characters: [characterA, characterB],
  activeIdentity: identity,
  relationships: [relation],
  messages,
  moments,
  worldBookEntries: worldBook,
  now: 500,
});
assert.equal(normalizedMusicPhone.musicTracks?.[0]?.id, `${repeatedMusicPrefix}track-1`, "music IDs stay bounded across repeated phone syncs");
assert.equal(normalizedMusicPhone.musicPlaylists?.[0]?.trackIds[0], `${repeatedMusicPrefix}track-1`);

const scopedWorldBookPhone = ensureCharacterPhoneContent({
  phone: emptyPhone("phone-worldbook-scope", characterA.id),
  character: characterA,
  characters: [characterA, characterB],
  activeIdentity: identity,
  relationships: [relation],
  messages,
  moments,
  worldBookEntries: [
    ...worldBook,
    {
      id: "world-correct-relation",
      title: "当前关系联系人",
      category: "人物",
      content: "朋友：顾南\n家庭群：我们一家（成员：妈妈、哥哥）",
      timestamp: 2,
      scope: { kind: "relationship", relationId: relation.id, characterId: characterA.id, userIdentityId: identity.id },
      visibility: "private",
      isActive: true,
    },
    {
      id: "world-other-identity",
      title: "其他身份联系人",
      category: "人物",
      content: "朋友：越界人物",
      timestamp: 3,
      scope: { kind: "identity", userIdentityId: "identity-other" },
      visibility: "private",
      isActive: true,
    },
  ],
  now: 600,
});
assert.ok(scopedWorldBookPhone.contacts.some((contact) => contact.name === "顾南"), "uses the current relationship world book");
assert.ok(!scopedWorldBookPhone.contacts.some((contact) => contact.name === "越界人物"), "rejects another identity's world book");
const familyGroup = scopedWorldBookPhone.contacts.find((contact) => contact.name === "我们一家");
assert.equal(familyGroup?.kind, "group", "extracts an explicitly described group chat");
assert.deepEqual(familyGroup?.memberNames, ["妈妈", "哥哥"]);
assert.deepEqual(familyGroup?.sourceRefs, [{ kind: "worldbook", id: "world-correct-relation" }]);

console.log("character phone content isolation tests passed");
