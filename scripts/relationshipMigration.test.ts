import assert from "node:assert/strict";
import { migrateLegacyRelationshipData } from "../src/domain/relationship/relationshipMigration";
import { removeCanonicalCharacterData, removeRelationshipData } from "../src/domain/relationship/relationshipCleanup";
import { createRelationship, findRelationshipForCanonicalCharacter } from "../src/domain/relationship/characterRelationship";
import type { Character, MemoryItem, Message, OfflineStory } from "../src/types";

const character: Character = { id: "char_001", name: "Qi Che", avatar: "q.png", personality: "", backstory: "" };
const legacyContact: Character = { ...character, id: "contact_copy_001", isContactInstance: true, profileSourceId: character.id };
const group: Character = { id: "group_1", name: "Group", avatar: "g.png", personality: "", backstory: "", isGroupChat: true };
const message: Message = { id: "message_1", characterId: character.id, sender: "user", content: "hello", timestamp: 1 };
const memory: MemoryItem = { id: "memory_1", characterId: character.id, content: "memory", timestamp: 1 };
const story: OfflineStory = { id: "story_1", characterId: character.id, title: "story", createdAt: 1, updatedAt: 1, mode: "continue", messages: [message] };

// Legacy friend/message/memory/story records create exactly one default relation.
const input = {
  characters: [character, group], relationships: [], legacyFriendIds: [character.id],
  messages: [message, { ...message, id: "group-message", characterId: group.id }],
  memories: [memory], offlineStories: [story], now: 100,
};
const first = migrateLegacyRelationshipData(input);
assert.equal(first.createdRelationshipCount, 1);
assert.equal(first.relationships[0].characterId, character.id);
assert.equal(first.relationships[0].userIdentityId, "identity-1");
assert.equal(first.messages[0].relationId, "relation_default_char_001");
assert.equal(first.messages[0].conversationId, "direct:relation_default_char_001");
assert.equal(first.messages[1].relationId, undefined, "group records never become direct relationships");
assert.equal(first.memories[0].relationId, "relation_default_char_001");
assert.equal(first.offlineStories[0].relationId, "relation_default_char_001");
assert.equal(first.offlineStories[0].messages[0].relationId, "relation_default_char_001");

// Repeated startup migration is completely idempotent.
const second = migrateLegacyRelationshipData({ ...input, relationships: first.relationships, messages: first.messages, memories: first.memories, offlineStories: first.offlineStories });
assert.equal(second.createdRelationshipCount, 0);
assert.equal(second.migratedMessageCount, 0);
assert.equal(second.migratedMemoryCount, 0);
assert.equal(second.migratedStoryCount, 0);

// Existing relationships retain their stored owner. A legacy-looking ID is
// not enough evidence to reassign an identity's data.
const wronglyOwnedDefault = createRelationship({
  id: "relation_default_char_001",
  characterId: character.id,
  userIdentityId: "identity-fanfan",
  now: 1,
});
const repairedDefault = migrateLegacyRelationshipData({
  ...input,
  legacyFriendIds: [],
  relationships: [wronglyOwnedDefault],
  messages: [{ ...message, relationId: wronglyOwnedDefault.id, conversationId: wronglyOwnedDefault.conversationId }],
  memories: [{ ...memory, relationId: wronglyOwnedDefault.id }],
  offlineStories: [{ ...story, relationId: wronglyOwnedDefault.id, conversationId: wronglyOwnedDefault.conversationId }],
  defaultIdentityId: "identity-fanfan",
});
assert.equal(repairedDefault.relationships.length, 1);
assert.equal(repairedDefault.relationships[0].userIdentityId, "identity-fanfan");
assert.equal(repairedDefault.messages[0].relationId, "relation_default_char_001");

// A corrupted duplicate identity+character relation is merged without losing
// its messages, memories, or stories, and no duplicate relationship remains.
const duplicatePrimary = createRelationship({ id: "relation_default_char_001", characterId: character.id, userIdentityId: "identity-1", now: 1 });
const duplicateSecondary = createRelationship({ id: "rel-duplicate", characterId: character.id, userIdentityId: "identity-1", now: 2 });
const deduplicated = migrateLegacyRelationshipData({
  ...input,
  relationships: [duplicatePrimary, duplicateSecondary],
  messages: [{ ...message, id: "duplicate-message", relationId: duplicateSecondary.id, conversationId: duplicateSecondary.conversationId }],
  memories: [{ ...memory, id: "duplicate-memory", relationId: duplicateSecondary.id }],
  offlineStories: [{ ...story, id: "duplicate-story", relationId: duplicateSecondary.id, conversationId: duplicateSecondary.conversationId }],
});
assert.equal(deduplicated.relationships.length, 1);
assert.equal(deduplicated.deduplicatedRelationshipCount, 1);
assert.equal(deduplicated.relationIdRemaps[duplicateSecondary.id], duplicatePrimary.id);
assert.equal(deduplicated.messages[0].relationId, duplicatePrimary.id);
assert.equal(deduplicated.memories[0].relationId, duplicatePrimary.id);
assert.equal(deduplicated.offlineStories[0].relationId, duplicatePrimary.id);

// A historical contact copy resolves to its archive's canonical character before migration.
const contactMigration = migrateLegacyRelationshipData({
  ...input,
  characters: [character, legacyContact, group],
  legacyFriendIds: [legacyContact.id],
  messages: [{ ...message, characterId: legacyContact.id }],
  memories: [{ ...memory, characterId: legacyContact.id }],
  offlineStories: [{ ...story, characterId: legacyContact.id }],
  relationships: [],
});
assert.equal(contactMigration.relationships.length, 1);
assert.equal(contactMigration.relationships[0].characterId, character.id);
assert.equal(contactMigration.messages[0].characterId, character.id);
assert.equal(contactMigration.memories[0].characterId, character.id);
assert.equal(contactMigration.offlineStories[0].characterId, character.id);

// A relation left against the legacy contact-copy ID is still removable from
// the canonical profile for its own identity.
const legacyRelation = createRelationship({ id: "legacy-contact-relation", characterId: legacyContact.id, userIdentityId: "identity-fanfan", now: 1 });
assert.equal(
  findRelationshipForCanonicalCharacter([legacyRelation], "identity-fanfan", character.id, [character, legacyContact])?.id,
  legacyRelation.id,
);
assert.equal(
  findRelationshipForCanonicalCharacter([legacyRelation], "identity-other", character.id, [character, legacyContact]),
  undefined,
  "canonical recovery never crosses identity boundaries",
);

// The same canonical character can have isolated relationships for two identities.
const relA = createRelationship({ id: "rel_little_flower", characterId: character.id, userIdentityId: "identity-little-flower", now: 1 });
const relB = createRelationship({ id: "rel_fanfan", characterId: character.id, userIdentityId: "identity-fanfan", now: 2 });
assert.notEqual(relA.id, relB.id);
const isolated = {
  relationships: [relA, relB],
  messages: [{ ...message, id: "a-message", relationId: relA.id }, { ...message, id: "b-message", relationId: relB.id }, { ...message, id: "group-message", characterId: group.id }],
  memories: [{ ...memory, id: "a-memory", relationId: relA.id }, { ...memory, id: "b-memory", relationId: relB.id }],
  offlineStories: [{ ...story, id: "a-story", relationId: relA.id }, { ...story, id: "b-story", relationId: relB.id }],
};
const afterRelationDelete = removeRelationshipData(isolated, [relA.id]);
assert.deepEqual(afterRelationDelete.relationships.map((relation) => relation.id), [relB.id]);
assert.deepEqual(afterRelationDelete.messages.map((item) => item.id).sort(), ["b-message", "group-message"]);
assert.deepEqual(afterRelationDelete.memories.map((item) => item.id), ["b-memory"]);
assert.deepEqual(afterRelationDelete.offlineStories.map((item) => item.id), ["b-story"]);

const afterCharacterDelete = removeCanonicalCharacterData(isolated, character.id);
assert.equal(afterCharacterDelete.relationships.length, 0);
assert.equal(afterCharacterDelete.memories.length, 0);
assert.equal(afterCharacterDelete.offlineStories.length, 0);
assert.deepEqual(afterCharacterDelete.messages.map((item) => item.id), ["group-message"], "canonical deletion keeps unrelated group data");

console.log("PASS relationship migration, canonicalization, group exclusion, isolation, and cascade cleanup");
