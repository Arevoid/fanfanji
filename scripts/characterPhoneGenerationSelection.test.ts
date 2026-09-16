import assert from "node:assert/strict";
import type { Character, Message } from "../src/types";
import type { CharacterPhoneRecord } from "../src/domain/characterPhone/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import {
  mirrorGeneratedCharacterPhoneChat,
} from "../src/features/characterPhone/characterPhoneChatMirror";
import {
  DEFAULT_CHARACTER_PHONE_GENERATION_SELECTION,
  resolveCharacterPhoneGenerationApps,
  toggleCharacterPhoneGenerationApp,
} from "../src/features/characterPhone/characterPhoneGenerationSelection";

const allApps = resolveCharacterPhoneGenerationApps(DEFAULT_CHARACTER_PHONE_GENERATION_SELECTION);
assert.equal(allApps.length, 9, "all-selection includes every content-generating app, excluding settings");
let selection = toggleCharacterPhoneGenerationApp(DEFAULT_CHARACTER_PHONE_GENERATION_SELECTION, "diary");
assert.deepEqual(resolveCharacterPhoneGenerationApps(selection), ["diary"], "choosing an app exits exclusive all mode");
selection = toggleCharacterPhoneGenerationApp(selection, "chat");
assert.deepEqual(resolveCharacterPhoneGenerationApps(selection), ["chat", "diary"], "individual apps can be multi-selected in stable app order");
selection = toggleCharacterPhoneGenerationApp(selection, "diary");
assert.deepEqual(resolveCharacterPhoneGenerationApps(selection), ["chat"], "individual selections toggle independently");

const character: Character = { id: "mirror-character", name: "角色", avatar: "", personality: "", backstory: "" };
const relation: CharacterRelationship = {
  id: "mirror-relation",
  userIdentityId: "mirror-owner",
  characterId: character.id,
  conversationId: "direct:mirror-relation",
  relationship: "friend",
  createdAt: 1,
  updatedAt: 1,
};
const userContactId = "phone-mirror-user-contact";
const phone: CharacterPhoneRecord = {
  id: "phone-mirror",
  ownerIdentityId: relation.userIdentityId,
  characterId: character.id,
  passcode: "0000",
  failedAttempts: 0,
  createdAt: 1,
  updatedAt: 1,
  lastOpenedAt: 1,
  wallpaper: "linear-gradient(white, white)",
  appOrder: ["chat", "browser", "schedule", "gallery", "diary", "moments", "notes", "music", "settings"],
  messages: [],
  contacts: [{
    id: userContactId,
    name: "用户",
    relation: "身份聊天",
    userIdentityId: relation.userIdentityId,
    relationId: relation.id,
    kind: "user",
    isLongTerm: true,
    isNpc: false,
    source: "user",
  }],
  threadMessages: [{
    id: "phone-generated-thread-id",
    contactId: userContactId,
    sender: "character",
    content: "我刚忙完，晚点和你说。",
    timestamp: 30,
    lifeEventId: "phone-life-event-id",
  }],
  posts: [],
  browserHistory: [],
  diaryEntries: [],
  notes: [],
  todos: [],
  scheduleItems: [],
  galleryItems: [],
  activities: [],
};
const previousPhone: CharacterPhoneRecord = { ...phone, threadMessages: [] };
const existingMainMessage: Message = {
  id: "main-existing",
  characterId: character.id,
  relationId: relation.id,
  conversationId: relation.conversationId,
  sender: "user",
  content: "看到了。",
  timestamp: 10,
};
const mirrored = mirrorGeneratedCharacterPhoneChat({
  phone,
  previousPhone,
  character,
  relationships: [relation],
  mainMessages: [existingMainMessage],
  now: 20,
});
assert.ok(mirrored, "new role-phone direct message is promoted to main chat");
assert.equal(mirrored.messages.length, 1);
assert.equal(mirrored.messages[0]?.sender, "character", "only role-authored bubbles are promoted");
assert.equal(mirrored.messages[0]?.relationId, relation.id, "uses the owning identity's matching relationship");
assert.equal(mirrored.messages[0]?.timestamp, 20, "new main-chat message is ordered after current chat history");
assert.equal(mirrored.phone.threadMessages[0]?.sourceMessageId, mirrored.messages[0]?.id, "phone bubble links to the durable main message ID");
assert.equal(mirrored.phone.threadMessages[0]?.id, "phone-generated-thread-id", "phone artifact ID remains stable");
assert.ok(mirrored.messages.every((message) => message.sender !== "user"), "never fabricates a user-side message");
assert.equal(mirrorGeneratedCharacterPhoneChat({
  phone: mirrored.phone,
  previousPhone: mirrored.phone,
  character,
  relationships: [relation],
  mainMessages: [existingMainMessage, ...mirrored.messages],
  now: 40,
}), undefined, "linking is idempotent and does not duplicate main-chat messages");

const ambiguousResult = mirrorGeneratedCharacterPhoneChat({
  phone: { ...phone, contacts: [{ ...phone.contacts[0]!, relationId: undefined }], threadMessages: [{ ...phone.threadMessages[0]!, id: "ambiguous-message" }] },
  previousPhone: { ...previousPhone, threadMessages: [] },
  character,
  relationships: [relation, { ...relation, id: "other-owner-relation", conversationId: "direct:other-owner-relation" }],
  mainMessages: [existingMainMessage],
  now: 20,
});
assert.equal(ambiguousResult, undefined, "does not guess when a direct thread has no unique destination relationship");

console.log("character phone generation selection and chat mirror tests passed");
