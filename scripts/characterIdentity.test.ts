import assert from "node:assert/strict";
import {
  getAvailableCanonicalCharacterIds,
  migrateLegacyCharacterIdentityData,
  pruneUnavailableCharacterRelations,
  resolveCanonicalCharacterIds,
  resolveOfflineStoryCharacterId,
  resolveOfflineStoryCharacterIds,
} from "../src/domain/character/characterIdentity";
import type { Character, MemoryItem, Moment, OfflineStory } from "../src/types";

const archiveCharacter: Character = { id: "yang-cheng", name: "杨丞", avatar: "archive.png", personality: "稳重", backstory: "邻居" };
const legacyContact: Character = {
  ...archiveCharacter,
  id: "contact-identity-1-old",
  isContactInstance: true,
  profileSourceId: archiveCharacter.id,
};

const canonical = resolveCanonicalCharacterIds([legacyContact.id, archiveCharacter.id], [archiveCharacter, legacyContact]);
assert.deepEqual([...canonical], [archiveCharacter.id]);
assert.deepEqual([...resolveCanonicalCharacterIds([archiveCharacter.id], [archiveCharacter])], [archiveCharacter.id]);
assert.deepEqual(
  pruneUnavailableCharacterRelations([legacyContact.id], [archiveCharacter, legacyContact]),
  [legacyContact.id],
  "a legacy contact resolves to its still-existing archive profile",
);
assert.equal(
  getAvailableCanonicalCharacterIds([legacyContact]).has(archiveCharacter.id),
  false,
  "a contact copy cannot become an independent canonical character",
);
assert.deepEqual(
  pruneUnavailableCharacterRelations([legacyContact.id], [legacyContact]),
  [],
  "deleting the archive profile releases the stale friend relation without deleting history",
);
const sameNameDifferentId: Character = { ...archiveCharacter, id: "yang-cheng-2" };
assert.deepEqual(
  [...getAvailableCanonicalCharacterIds([archiveCharacter, sameNameDifferentId])],
  [archiveCharacter.id, sameNameDifferentId.id],
  "same-name characters with different IDs remain distinct",
);

const legacyMemory: MemoryItem = {
  id: "legacy-memory",
  characterId: legacyContact.id,
  content: "A historical memory",
  timestamp: 1,
};
const legacyMoment: Moment = {
  id: "legacy-moment",
  characterId: legacyContact.id,
  authorName: archiveCharacter.name,
  authorAvatar: archiveCharacter.avatar,
  content: "A historical moment",
  timestamp: 1,
  likes: [],
  comments: [],
};
const legacyStory: OfflineStory = {
  id: "legacy-story",
  characterId: legacyContact.id,
  characterIds: [legacyContact.id],
  sourceChatId: legacyContact.id,
  title: "Legacy story",
  createdAt: 1,
  updatedAt: 1,
  mode: "continue",
  messages: [],
};
const migration = migrateLegacyCharacterIdentityData({
  characters: [archiveCharacter, legacyContact],
  memories: [legacyMemory],
  moments: [legacyMoment],
  offlineStories: [legacyStory],
});
assert.equal(migration.idMap.get(legacyContact.id), archiveCharacter.id);
assert.equal(migration.memories[0].characterId, archiveCharacter.id);
assert.equal(migration.moments[0].characterId, archiveCharacter.id);
assert.equal(migration.migratedMemoryCount, 1);
assert.equal(migration.migratedMomentCount, 1);
assert.equal(migration.referencedOfflineStoryCount, 1);
assert.equal(resolveOfflineStoryCharacterId(legacyStory, [archiveCharacter, legacyContact]), archiveCharacter.id);
assert.deepEqual(
  resolveOfflineStoryCharacterIds(legacyStory, [archiveCharacter, legacyContact]),
  [archiveCharacter.id],
);

const unlinkedSameName = { ...archiveCharacter, id: "same-name-unlinked" };
const noMigration = migrateLegacyCharacterIdentityData({
  characters: [archiveCharacter, unlinkedSameName],
  memories: [{ ...legacyMemory, characterId: unlinkedSameName.id }],
  moments: [],
  offlineStories: [],
});
assert.equal(noMigration.idMap.size, 0, "unlinked same-name records stay distinct");
assert.equal(noMigration.memories[0].characterId, unlinkedSameName.id);

console.log("PASS canonical identity migration, memory-library deduplication, and legacy-story resolution");
