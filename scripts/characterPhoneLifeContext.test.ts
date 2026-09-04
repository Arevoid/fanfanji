import assert from "node:assert/strict";
import { buildCharacterPhoneLifeContext } from "../src/features/characterPhone/characterPhoneLifeContext";
import type { Character, Message, Moment, UserIdentity, WorldBookEntry } from "../src/types";
import type { CharacterPhoneRecord } from "../src/domain/characterPhone/types";

const character: Character = {
  id: "life-character",
  name: "阿宁",
  avatar: "",
  personality: "安静",
  backstory: "住在海边。",
};
const identity: UserIdentity = { id: "life-owner", name: "用户", avatar: "", signature: "", bio: "" };
const relation = {
  id: "life-relation",
  userIdentityId: identity.id,
  characterId: character.id,
  conversationId: "life-conversation",
  relationship: "friend" as const,
  createdAt: 1,
  updatedAt: 1,
};
const phone: CharacterPhoneRecord = {
  id: "life-phone",
  ownerIdentityId: identity.id,
  characterId: character.id,
  passcode: "0000",
  failedAttempts: 0,
  createdAt: 1,
  updatedAt: 1,
  wallpaper: "",
  appOrder: ["chat", "browser", "schedule", "gallery", "diary", "notes", "music", "settings"],
  messages: [], contacts: [], threadMessages: [], posts: [], browserHistory: [], diaryEntries: [], scheduleItems: [], galleryItems: [], activities: [],
};
const messages: Message[] = [
  { id: "owned-message", characterId: character.id, relationId: relation.id, conversationId: relation.conversationId, sender: "user", content: "当前关系", timestamp: 1 },
  { id: "other-message", characterId: character.id, relationId: "other-relation", conversationId: "other-conversation", sender: "user", content: "其他关系", timestamp: 2 },
  { id: "legacy-unscoped-message", characterId: character.id, sender: "user", content: "无归属", timestamp: 3 },
];
const moments: Moment[] = [
  { id: "owned-moment", ownerIdentityId: identity.id, characterId: character.id, authorName: character.name, authorAvatar: "", content: "当前身份", timestamp: 1, likes: [], comments: [] },
  { id: "other-moment", ownerIdentityId: "other-owner", characterId: character.id, authorName: character.name, authorAvatar: "", content: "其他身份", timestamp: 2, likes: [], comments: [] },
];
const worldBookEntries: WorldBookEntry[] = [
  { id: "owned-world", title: "当前关系", category: "人物", content: "朋友：林晓", timestamp: 1, scope: { kind: "relationship", relationId: relation.id, characterId: character.id, userIdentityId: identity.id }, visibility: "private" },
  { id: "other-world", title: "其他身份", category: "人物", content: "朋友：越界人物", timestamp: 2, scope: { kind: "identity", userIdentityId: "other-owner" }, visibility: "private" },
];

const context = buildCharacterPhoneLifeContext({
  phone,
  character,
  activeIdentity: identity,
  relationships: [relation],
  messages,
  moments,
  worldBookEntries,
});

assert.deepEqual(context.relationIds, [relation.id]);
assert.deepEqual(context.conversationIds, [relation.conversationId]);
assert.deepEqual(context.messages.map((message) => message.id), ["owned-message"]);
assert.deepEqual(context.moments.map((moment) => moment.id), ["owned-moment"]);
assert.deepEqual(context.worldBookEntries.map((entry) => entry.id), ["owned-world"]);
assert.ok(context.sourceRefs.some((source) => source.kind === "character" && source.id === character.id));
assert.ok(context.sourceRefs.some((source) => source.kind === "chat" && source.id === "owned-message"));
assert.ok(!context.sourceRefs.some((source) => source.id === "other-message" || source.id === "other-world"));

console.log("character phone life context tests passed");
