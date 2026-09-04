import assert from "node:assert/strict";
import { appendCharacterPhoneThreadMessage } from "../src/features/characterPhone/characterPhoneThreadService";
import { discoverCharacterPhoneActions } from "../src/features/characterPhone/characterPhoneDetection";
import type { CharacterPhoneRecord } from "../src/domain/characterPhone/types";

const character = {
  id: "character-1",
  name: "林晓",
  personality: "冷静、克制",
  backstory: "习惯简短表达",
} as any;
const phone: CharacterPhoneRecord = {
  id: "phone-1",
  ownerIdentityId: "user-1",
  characterId: character.id,
  passcode: "0000",
  failedAttempts: 0,
  createdAt: 1,
  updatedAt: 1,
  wallpaper: "#fcfbfb",
  appOrder: ["chat", "browser", "schedule", "gallery", "diary", "notes", "music", "settings"],
  messages: [],
  contacts: [{ id: "npc-1", name: "周叔", relation: "家人", isLongTerm: true, isNpc: true, source: "generated" }],
  threadMessages: [],
  posts: [],
  browserHistory: [],
  diaryEntries: [],
  scheduleItems: [],
  galleryItems: [],
  activities: [],
  todos: [],
  actionLog: [],
};

const sent = appendCharacterPhoneThreadMessage({
  phone,
  contactId: "npc-1",
  content: "您好，我保证明天一定会去处理这件事！！！！",
  operatedByUser: true,
  character,
  now: 100,
  sourceMessageId: "main-chat-message-1",
});
assert.equal(sent.threadMessages.length, 1, "sending only records the action that actually happened");
assert.equal(sent.threadMessages[0].operatedByUser, true);
assert.equal(sent.threadMessages[0].sourceMessageId, "main-chat-message-1");
assert.equal(sent.threadMessages[0].promise, undefined, "does not infer a promise from wording alone");
assert.equal(sent.todos?.length, 0, "does not invent a todo from an outgoing message");
assert.match(sent.activities[0]?.label || "", /联系人/);

const discovered = discoverCharacterPhoneActions({
  ...sent,
  phoneOpenCount: 2,
  actionLog: [{
    id: "action-1",
    kind: "contact_removed",
    app: "chat",
    detail: "删除联系人周叔",
    timestamp: 200,
    actor: "user",
    detectability: "likely",
  }],
}, character, 300);
assert.equal(discovered.actionLog?.[0]?.discovered, true);
assert.match(discovered.messages.at(-1)?.body || "", /联系人列表里少了一个人/);

const repeatedDiscovery = discoverCharacterPhoneActions({
  ...discovered,
  actionLog: [{
    id: "action-2",
    kind: "contact_removed",
    app: "chat",
    detail: "删除联系人周叔",
    timestamp: 201,
    actor: "user",
    detectability: "likely",
  }],
}, character, 301);
assert.equal(repeatedDiscovery.messages.length, discovered.messages.length, "does not append an identical discovery alert twice");

const notYetReopened = discoverCharacterPhoneActions({
  ...phone,
  phoneOpenCount: 8,
  actionLog: [{
    id: "action-after-many-opens",
    kind: "contact_removed",
    app: "chat",
    detail: "刚刚删除联系人",
    timestamp: 295,
    actor: "user",
    detectability: "likely",
    discoveryAfterOpens: 2,
    phoneOpenCountAtAction: 8,
  }],
}, character, 300);
assert.equal(notYetReopened.actionLog?.[0]?.discovered, undefined, "counts opens after the action instead of lifetime opens");
const reopenedTwice = discoverCharacterPhoneActions({ ...notYetReopened, phoneOpenCount: 10 }, character, 301);
assert.equal(reopenedTwice.actionLog?.[0]?.discovered, true);
console.log("character phone interaction tests passed");
