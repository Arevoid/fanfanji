import assert from "node:assert/strict";
import { createOocCorrectionMemory } from "../src/domain/memory/oocMemory";
import { MemoryService } from "../src/domain/memory/MemoryService";
import { migrateLegacyRelationshipData } from "../src/domain/relationship/relationshipMigration";
import { createRelationship, getDefaultRelationId } from "../src/domain/relationship/characterRelationship";
import type { Character, MemoryItem } from "../src/types";

const character: Character = { id: "character-a", name: "A", avatar: "", personality: "", backstory: "" };
const relationA = createRelationship({ id: "relation-a", characterId: character.id, userIdentityId: "identity-a", now: 1 });
const relationB = createRelationship({ id: "relation-b", characterId: character.id, userIdentityId: "identity-b", now: 2 });

const oocFromIdentityA = createOocCorrectionMemory({
  id: "ooc-a",
  characterId: character.id,
  relationId: relationA.id,
  originalResponse: "错误回复",
  feedback: "请保持冷静语气",
  timestamp: 3,
});
const oocFromIdentityB = createOocCorrectionMemory({
  id: "ooc-b",
  characterId: character.id,
  relationId: relationB.id,
  originalResponse: "错误回复",
  feedback: "请保持热情语气",
  timestamp: 4,
});

const memories = [oocFromIdentityA, oocFromIdentityB];
const relationAMemories = MemoryService.retrieveRelevantMemories({
  characterId: character.id,
  relationId: relationA.id,
  queryText: "语气",
  existingMemories: memories,
  scenario: "chat",
});
const relationBMemories = MemoryService.retrieveRelevantMemories({
  characterId: character.id,
  relationId: relationB.id,
  queryText: "语气",
  existingMemories: memories,
  scenario: "chat",
});

assert.deepEqual(relationAMemories.map((memory) => memory.id), ["ooc-a"]);
assert.deepEqual(relationBMemories.map((memory) => memory.id), ["ooc-b"]);
assert.equal(relationBMemories.some((memory) => memory.id === oocFromIdentityA.id), false);
assert.throws(
  () => createOocCorrectionMemory({
    id: "invalid-ooc",
    characterId: character.id,
    relationId: "",
    originalResponse: "回复",
    feedback: "修正",
    timestamp: 4,
  }),
  /requires relationId/,
);

const legacyMemory: MemoryItem = {
  id: "legacy-ooc",
  characterId: character.id,
  content: "历史 OOC 修正",
  timestamp: 5,
};
const migrated = migrateLegacyRelationshipData({
  characters: [character],
  relationships: [relationA, relationB],
  legacyFriendIds: [],
  messages: [],
  memories: [legacyMemory],
  offlineStories: [],
  now: 6,
});
const defaultRelation = migrated.relationships.find((relation) => relation.id === getDefaultRelationId(character.id));
assert.ok(defaultRelation, "legacy unscoped memory should create the historical default relation");
assert.equal(migrated.memories[0]?.relationId, defaultRelation?.id);
assert.equal(
  MemoryService.retrieveRelevantMemories({
    characterId: character.id,
    relationId: relationA.id,
    queryText: "历史",
    existingMemories: migrated.memories,
    scenario: "chat",
  }).some((memory) => memory.id === legacyMemory.id),
  false,
);
assert.deepEqual(
  MemoryService.retrieveRelevantMemories({
    characterId: character.id,
    relationId: defaultRelation?.id,
    queryText: "历史",
    existingMemories: migrated.memories,
    scenario: "chat",
  }).map((memory) => memory.id),
  [legacyMemory.id],
);

const legacyOnly = [{ ...legacyMemory, id: "legacy-only" }];
assert.deepEqual(
  MemoryService.retrieveRelevantMemories({
    characterId: character.id,
    queryText: "历史",
    existingMemories: legacyOnly,
    scenario: "chat",
  }).map((memory) => memory.id),
  ["legacy-only"],
  "omitting relationId reads only unscoped legacy records, never another relation",
);

console.log("PASS OOC relationId creation, default legacy migration, and A/B memory isolation");
