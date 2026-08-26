import { strict as assert } from "node:assert";
import { buildOfflineMemberKnowledgeSnapshots } from "../src/features/offline/services/offlineMemberMemorySnapshot";
import { createOfflineGroupParticipantMemories } from "../src/features/offline/services/offlineGroupMemorySync";
import { canSyncOfflineStoryToMemory } from "../src/domain/offlineStory/offlineStoryFactPolicy";
import { hasOfflineStorySummary } from "../src/domain/memory/offlineMemorySync";
import type { Character, MemoryItem, Message, OfflineStory } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";

const group: Character = { id: "g", name: "群", avatar: "", personality: "", backstory: "", isGroupChat: true, memberIds: ["a", "b"] };
const a: Character = { id: "a", name: "A", avatar: "", personality: "", backstory: "" };
const b: Character = { id: "b", name: "B", avatar: "", personality: "", backstory: "" };
const relationships: CharacterRelationship[] = [
  { id: "ra", characterId: "a", userIdentityId: "identity-1", conversationId: "direct:ra", relationship: "friend", compressedMemory: "A 摘要", createdAt: 1, updatedAt: 1 },
  { id: "rb", characterId: "b", userIdentityId: "identity-1", conversationId: "direct:rb", relationship: "friend", compressedMemory: "B 摘要", createdAt: 1, updatedAt: 1 },
  { id: "ra2", characterId: "a", userIdentityId: "identity-2", conversationId: "direct:ra2", relationship: "friend", compressedMemory: "其他身份摘要", createdAt: 1, updatedAt: 1 },
];
const memories: MemoryItem[] = [
  { id: "ma", characterId: "a", relationId: "ra", content: "A 私聊", timestamp: 1 },
  { id: "mb", characterId: "b", relationId: "rb", content: "B 私聊", timestamp: 1 },
  { id: "ma2", characterId: "a", relationId: "ra2", content: "其他身份私聊", timestamp: 1 },
];
const snapshots = buildOfflineMemberKnowledgeSnapshots({
  memberIds: ["a", "b"], characters: [group, a, b], relationships,
  activeIdentityId: "identity-1", memories, claims: [],
});
assert.deepEqual(snapshots.a, ["A 摘要", "A 私聊"]);
assert.deepEqual(snapshots.b, ["B 摘要", "B 私聊"]);
assert.equal(JSON.stringify(snapshots).includes("其他身份"), false);

const sourceMessages: Message[] = [
  { id: "u", characterId: "g", sender: "user", content: "我推开门", timestamp: 2 },
  { id: "m", characterId: "g", sender: "character", content: "A 看向 B，B 点了点头。", timestamp: 3 },
];
const story: OfflineStory = {
  id: "story-g", characterId: "g", characterIds: ["a", "b"], title: "多人故事",
  createdAt: 1, updatedAt: 3, mode: "continue", messages: sourceMessages,
};
assert.equal(canSyncOfflineStoryToMemory({ story, userConfirmed: true, syncIntent: "automatic_end", sourceMessages, participantRelationIds: ["ra", "rb"] }), true);
assert.equal(canSyncOfflineStoryToMemory({ story, userConfirmed: true, syncIntent: "automatic_end", sourceMessages, participantRelationIds: ["ra"] }), false);

const syncedResult = await createOfflineGroupParticipantMemories({
  story, participants: [a, b], characters: [group, a, b], relationships,
  activeIdentityId: "identity-1", sourceMessages, userName: "用户", now: 10,
  settings: { apiKey: "", selectedModel: "test-model", apiEndpoint: "" } as any,
  recallSettings: { extractModel: "test-model" } as any,
  existingMemories: memories,
  extractApi: async () => ({ candidates: [] }),
});
const synced = syncedResult.memories;
assert.equal(synced.length, 2);
assert.deepEqual(synced.map((memory) => memory.relationId).sort(), ["ra", "rb"]);
assert.equal(synced.every((memory) => memory.content.includes("offline-story:story-g:summary")), true);
assert.equal(synced.every((memory) => !memory.content.includes("我推开门")), true);
assert.deepEqual(syncedResult.fallbackParticipantNames.sort(), ["A", "B"]);
assert.equal(hasOfflineStorySummary(story, synced), true);

console.log("PASS group offline snapshots and synced memories stay participant-scoped");
