import assert from "node:assert/strict";
import type { InnerVoiceRecord, MemoryItem, Message, OfflineStory } from "../src/types";
import { MemoryService } from "../src/domain/memory/MemoryService";
import { isMessageInConversationRelation } from "../src/features/chat/services/conversationRelationScope";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

Object.defineProperty(globalThis, "window", { value: { localStorage: new MemoryStorage() }, configurable: true });

const relationship = await import("../src/domain/relationship/relationshipService");
const innerVoice = await import("../src/core/storage/repositories/innerVoiceRepository");

const canonicalCharacterId = "char-x";
const contactA = "contact-identity-a-x";
const contactB = "contact-identity-b-x";
const relationA = relationship.getOrCreateRelationship(canonicalCharacterId, "identity-a", 1).id;
const relationB = relationship.getOrCreateRelationship(canonicalCharacterId, "identity-b", 2).id;

assert.notEqual(relationA, relationB);
assert.equal(relationship.getOrCreateRelationship(canonicalCharacterId, "identity-a", 3).id, relationA, "relation ids stay stable across repeated calls");

const messages: Message[] = [
  { id: "msg-a", characterId: contactA, relationId: relationA, sender: "user", content: "A only", timestamp: 1 },
  { id: "msg-b", characterId: contactB, relationId: relationB, sender: "user", content: "B only", timestamp: 2 },
  { id: "legacy-a", characterId: contactA, sender: "character", content: "legacy A", timestamp: 3 },
];
assert.deepEqual(messages.filter((message) => isMessageInConversationRelation(message, { characterId: contactA, relationId: relationA, allowLegacyCharacterMessages: true })).map((message) => message.id), ["msg-a", "legacy-a"]);
assert.deepEqual(messages.filter((message) => isMessageInConversationRelation(message, { characterId: contactB, relationId: relationB, allowLegacyCharacterMessages: true })).map((message) => message.id), ["msg-b"]);

const memories: MemoryItem[] = [
  { id: "memory-a", characterId: canonicalCharacterId, relationId: relationA, content: "A memory", timestamp: 1 },
  { id: "memory-b", characterId: canonicalCharacterId, relationId: relationB, content: "B memory", timestamp: 2 },
];
assert.deepEqual(MemoryService.retrieveRelevantMemories({ characterId: canonicalCharacterId, relationId: relationA, queryText: "", existingMemories: memories, scenario: "chat" }).map((memory) => memory.id), ["memory-a"]);
assert.deepEqual(MemoryService.retrieveRelevantMemories({ characterId: canonicalCharacterId, relationId: relationB, queryText: "", existingMemories: memories, scenario: "chat" }).map((memory) => memory.id), ["memory-b"]);

const stories: OfflineStory[] = [
  { id: "story-a", characterId: contactA, relationId: relationA, title: "A", createdAt: 1, updatedAt: 1, mode: "director", messages: [] },
  { id: "story-b", characterId: contactB, relationId: relationB, title: "B", createdAt: 1, updatedAt: 1, mode: "director", messages: [] },
];
assert.equal(stories.filter((story) => story.relationId === relationA).length, 1);
assert.equal(stories.filter((story) => story.relationId === relationB).length, 1);

const voices: InnerVoiceRecord[] = [
  { id: "voice-a", characterId: canonicalCharacterId, relationId: relationA, messageId: "msg-a", conversationId: contactA, triggerMessageSummary: "A", state: "A", content: "A", createdAt: 1 },
  { id: "voice-b", characterId: canonicalCharacterId, relationId: relationB, messageId: "msg-b", conversationId: contactB, triggerMessageSummary: "B", state: "B", content: "B", createdAt: 2 },
];
innerVoice.saveInnerVoiceRecords(voices);
assert.equal(innerVoice.listInnerVoicesByRelation(relationA).length, 1);
assert.equal(innerVoice.listInnerVoicesByRelation(relationB).length, 1);

const contactAScope = { characterIds: [contactA], relationIds: [relationA] };
assert.equal(relationship.deleteRelationshipById(relationA).success, true);
assert.equal(relationship.listRelationshipsByCharacter(canonicalCharacterId).some((item) => item.id === relationB), true, "deleting contact A keeps relation B");
assert.equal(messages.filter((message) => !relationship.isRelationshipScopedRecord(message, contactAScope)).map((message) => message.id).includes("msg-b"), true);
assert.equal(memories.filter((memory) => !relationship.isRelationshipScopedRecord(memory, contactAScope)).map((memory) => memory.id).includes("memory-b"), true);
assert.equal(stories.filter((story) => !relationship.isRelationshipScopedRecord(story, contactAScope)).map((story) => story.id).includes("story-b"), true);
innerVoice.deleteInnerVoicesByRelation(relationA);
assert.equal(innerVoice.listInnerVoicesByRelation(relationB).length, 1);

assert.equal(relationship.deleteRelationshipsByCharacter(canonicalCharacterId).success, true);
assert.equal(relationship.listRelationshipsByCharacter(canonicalCharacterId).length, 0, "deleting the canonical character clears every relation");
innerVoice.deleteInnerVoicesByCharacter(canonicalCharacterId);
assert.equal(innerVoice.listInnerVoicesByRelation(relationB).length, 0);

console.log("PASS relation lifecycle keeps identities isolated and cleans the correct scope");
