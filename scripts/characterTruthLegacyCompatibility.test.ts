import assert from "node:assert/strict";
import { projectLegacyMemoryToKnowledgeClaim } from "../src/domain/characterKnowledge/legacyKnowledgeCompatibility";
import { DEFAULT_IDENTITY_ID, type CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import type { MemoryItem } from "../src/types";

const relationship = (id: string, identityId: string, characterId = "character-shared"): CharacterRelationship => ({
  id,
  characterId,
  userIdentityId: identityId,
  conversationId: `direct:${id}`,
  relationship: "friend",
  createdAt: 1,
  updatedAt: 1,
});
const memory = (overrides: Partial<MemoryItem> = {}): MemoryItem => ({
  id: "memory-1",
  characterId: "character-shared",
  content: "Legacy memory content",
  timestamp: 100,
  ...overrides,
});

const defaultRelation = relationship("relation-default", DEFAULT_IDENTITY_ID);
const siblingIdentity = relationship("relation-b", "identity-b");
const projected = projectLegacyMemoryToKnowledgeClaim(memory(), [defaultRelation, siblingIdentity]);
assert.equal(projected.migrated, true);
if (!projected.migrated) throw new Error("expected legacy projection");
assert.equal(projected.claim.relationId, defaultRelation.id);
assert.equal(projected.claim.userIdentityId, DEFAULT_IDENTITY_ID);
assert.equal(projected.claim.truthStatus, "legacy_unverified");
assert.equal(projected.claim.userConfirmed, false);

const scoped = projectLegacyMemoryToKnowledgeClaim(memory({ relationId: siblingIdentity.id }), [defaultRelation, siblingIdentity]);
assert.equal(scoped.migrated, true);
if (!scoped.migrated) throw new Error("expected scoped legacy projection");
assert.equal(scoped.claim.userIdentityId, "identity-b");

assert.deepEqual(projectLegacyMemoryToKnowledgeClaim(memory(), [siblingIdentity]), {
  migrated: false,
  diagnostic: "missing_relation",
});
assert.deepEqual(projectLegacyMemoryToKnowledgeClaim(memory(), [defaultRelation, relationship("relation-default-2", DEFAULT_IDENTITY_ID)]), {
  migrated: false,
  diagnostic: "ambiguous_default_relation",
});
assert.deepEqual(projectLegacyMemoryToKnowledgeClaim(memory({ relationId: "wrong-character-relation" }), [relationship("wrong-character-relation", DEFAULT_IDENTITY_ID, "other-character")]), {
  migrated: false,
  diagnostic: "scope_mismatch",
});

console.log("PASS Character Truth legacy default-relation compatibility and orphan isolation");
