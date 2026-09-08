import assert from "node:assert/strict";
import { buildRelationshipCognitiveProjection } from "../src/features/characterLife/services/relationshipCognitiveProjectionService";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";

const relationA: CharacterRelationship = {
  id: "relation-a",
  characterId: "char-a",
  userIdentityId: "identity-a",
  conversationId: "direct:relation-a",
  relationship: "friend",
  createdAt: 1,
  updatedAt: 1,
};
const relationB: CharacterRelationship = {
  ...relationA,
  id: "relation-b",
  userIdentityId: "identity-b",
  conversationId: "direct:relation-b",
};
const event = (id: string, relation: CharacterRelationship, kind: string, occurredAt: number, overrides: Partial<CharacterEvent> = {}): CharacterEvent => ({
  id,
  relationId: relation.id,
  characterId: relation.characterId,
  userIdentityId: relation.userIdentityId,
  kind,
  summary: `${kind}:${id}`,
  source: "explicit",
  occurredAt,
  recordedAt: occurredAt + 1,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
  ...overrides,
});

const projection = buildRelationshipCognitiveProjection({
  relation: relationA,
  events: [
    event("created-a", relationA, "relationship_created", 1),
    event("promise-a", relationA, "promise_made", 2, { source: "promise:tea", summary: "promise:tea — meet for tea" }),
    event("foreign", relationB, "conflict", 50),
  ],
  now: 100,
});
assert.equal(projection.timeline.eventCount, 2);
assert.deepEqual(projection.timeline.recentEvents.map((item) => item.id), ["promise-a", "created-a"]);
assert.equal(projection.state?.stage, "friend");
assert.deepEqual(projection.state?.openLoops.map((loop) => loop.id), ["tea"]);
assert.equal(projection.timeline.userIdentityId, "identity-a");
assert.equal(projection.timeline.generatedAt, 100);

const identityB = buildRelationshipCognitiveProjection({
  relation: relationB,
  events: [
    event("created-b", relationB, "relationship_created", 1),
    event("conflict-b", relationB, "conflict", 2),
  ],
  now: 101,
});
assert.equal(identityB.timeline.eventCount, 2);
assert.equal(identityB.state?.tone, "strained");
assert.deepEqual(identityB.state?.openLoops, []);

console.log("PASS production RelationshipState/Timeline projection rebuilds from scoped events and isolates identities");
