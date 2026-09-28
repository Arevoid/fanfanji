import { strict as assert } from "node:assert";
import type { Character, Message } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import { storageKeys } from "../src/core/storage/storageKeys";
import { loadKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries } from "../src/core/storage/repositories/conversationSummaryRepository";
import { retrieveTruthForPrivatePrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";
import { setGroupMemorySyncEnabled, syncGroupMemoryToMembers } from "../src/features/chat/services/groupMemorySyncService";

const values = new Map<string, string>();
const localStorageStub: Storage = {
  get length() { return values.size; },
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: (index) => Array.from(values.keys())[index] ?? null,
  removeItem: (key) => { values.delete(key); },
  setItem: (key, value) => { values.set(key, value); },
};
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: localStorageStub } });

const group: Character = { id: "group-sync-test", name: "同步测试群", avatar: "", personality: "", backstory: "", isGroupChat: true, memberIds: ["member-a", "member-b"] };
const memberA: Character = { id: "member-a", name: "甲", avatar: "", personality: "", backstory: "" };
const memberB: Character = { id: "member-b", name: "乙", avatar: "", personality: "", backstory: "" };
const relationships: CharacterRelationship[] = [
  { id: "relation-a", characterId: memberA.id, userIdentityId: "identity-1", conversationId: "direct:relation-a", relationship: "friend", createdAt: 1, updatedAt: 1 },
  { id: "relation-b", characterId: memberB.id, userIdentityId: "identity-1", conversationId: "direct:relation-b", relationship: "friend", createdAt: 1, updatedAt: 1 },
];
const baseMessages: Message[] = [
  { id: "group-msg-1", characterId: group.id, conversationId: `group:${group.id}`, sender: "user", content: "周六一起去展会", timestamp: 10 },
  { id: "group-msg-2", characterId: group.id, conversationId: `group:${group.id}`, sender: "character", senderId: memberA.id, content: "我有空", timestamp: 11 },
];

setGroupMemorySyncEnabled(group.id, true);
const first = syncGroupMemoryToMembers({ group, messages: baseMessages, members: [memberA, memberB], characters: [group, memberA, memberB], relationships, activeIdentityId: "identity-1", userName: "用户" });
assert.equal(first.processed, 4, "the first enable syncs every historical message to every member");
assert.equal(loadKnowledgeClaims().value.length, 4);
assert.equal(loadConversationSummaries().value.length, 4);

const second = syncGroupMemoryToMembers({ group, messages: baseMessages, members: [memberA, memberB], characters: [group, memberA, memberB], relationships, activeIdentityId: "identity-1", userName: "用户" });
assert.equal(second.processed, 0, "reopening/retrying does not duplicate an unchanged message");
assert.equal(loadConversationSummaries().value.length, 4);

setGroupMemorySyncEnabled(group.id, false);
const pausedMessages = [...baseMessages, { id: "group-msg-3", characterId: group.id, conversationId: `group:${group.id}`, sender: "character" as const, senderId: memberB.id, content: "我也想去", timestamp: 12 }];
const paused = syncGroupMemoryToMembers({ group, messages: pausedMessages, members: [memberA, memberB], characters: [group, memberA, memberB], relationships, activeIdentityId: "identity-1", userName: "用户" });
assert.equal(paused.processed, 0, "disabled sync keeps existing projections but does not write new group messages");
assert.equal(loadConversationSummaries().value.filter((summary) => summary.status === "active").length, 4);

setGroupMemorySyncEnabled(group.id, true);
const resumed = syncGroupMemoryToMembers({ group, messages: pausedMessages, members: [memberA, memberB], characters: [group, memberA, memberB], relationships, activeIdentityId: "identity-1", userName: "用户" });
assert.equal(resumed.processed, 2, "re-enabling backfills only the gap while retaining the original cursor");

const editedMessages = baseMessages.map((message) => message.id === "group-msg-1" ? { ...message, content: "周六一起去看展览" } : message);
const edited = syncGroupMemoryToMembers({ group, messages: editedMessages, members: [memberA, memberB], characters: [group, memberA, memberB], relationships, activeIdentityId: "identity-1", userName: "用户" });
assert.equal(edited.changed, 2, "an edited source message creates one replacement per member");
const summariesAfterEdit = loadConversationSummaries().value;
assert.equal(summariesAfterEdit.filter((summary) => summary.status === "active").length, 6);
assert.equal(summariesAfterEdit.filter((summary) => summary.status === "retracted").length, 2);

const privateTruth = retrieveTruthForPrivatePrompt({
  scope: { relationId: "relation-a", characterId: memberA.id, userIdentityId: "identity-1", conversationId: "direct:relation-a" },
  queryText: "展览",
  limit: 5,
  claims: loadKnowledgeClaims().value,
  summaries: summariesAfterEdit,
  corrections: [],
});
assert.equal(privateTruth.summaries.some((summary) => summary.summary.includes("周六一起去看展览")), true, "direct chat can recall the synced group event");

console.log("PASS group memory sync supports full history, pause/resume idempotency, edit replacement, and private retrieval");
