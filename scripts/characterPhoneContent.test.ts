import assert from "node:assert/strict";
import { ensureCharacterPhoneContent, normalizeCharacterPhoneMessages } from "../src/features/characterPhone/characterPhoneContent";
import type { Character, Message, Moment, UserIdentity, WorldBookEntry } from "../src/types";
import type { CharacterPhoneRecord } from "../src/domain/characterPhone/types";

const characterA: Character = {
  id: "character-a",
  name: "阿宁",
  avatar: "🌙",
  personality: "安静、克制，喜欢夜晚散步。",
  backstory: "在海边城市工作，和林晓是旧识。",
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
];
const moments: Moment[] = [
  { id: "moment-a", characterId: characterA.id, authorName: characterA.name, authorAvatar: characterA.avatar, content: "海边的风很大。", timestamp: 20, likes: [], comments: [] },
  { id: "moment-b", characterId: characterB.id, authorName: characterB.name, authorAvatar: characterB.avatar, content: "不属于阿宁的内容。", timestamp: 21, likes: [], comments: [] },
  { id: "moment-user", ownerIdentityId: identity.id, authorName: identity.name, authorAvatar: identity.avatar, content: "用户公开发布的内容。", timestamp: 22, likes: [], comments: [] },
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
assert.ok(phoneA.threadMessages.some((message) => message.sourceMessageId === "message-a"));
assert.ok(!phoneA.threadMessages.some((message) => message.content.includes("另一条关系")));
assert.ok(phoneA.posts.some((post) => post.sourceMomentId === "moment-a"));
assert.ok(phoneA.posts.some((post) => post.sourceMomentId === "moment-user"));
assert.ok(!phoneA.posts.some((post) => post.sourceMomentId === "moment-b"));
assert.ok(phoneA.contentSeededAt);
assert.notEqual(phoneA.posts.find((post) => post.sourceMomentId === "moment-a")?.id, phoneB.posts.find((post) => post.sourceMomentId === "moment-b")?.id);
assert.ok(phoneA.diaryEntries.length > 0 && phoneA.scheduleItems.length > 0);

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

const duplicateSearch = phoneA.browserHistory[0];
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
assert.equal(
  normalizedHistoryPhone.browserHistory.filter((entry) => entry.title === duplicateSearch.title).length,
  1,
  "removes legacy seed history while preserving the explicit user search",
);

const duplicateSchedule = phoneA.scheduleItems[0];
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
assert.equal(
  normalizedSchedulePhone.scheduleItems.filter((entry) => entry.title === duplicateSchedule.title).length,
  1,
  "removes legacy seed schedules while preserving the explicit user schedule",
);

console.log("character phone content isolation tests passed");
