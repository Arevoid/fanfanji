import assert from "node:assert/strict";
import { projectRelationshipState } from "../src/domain/characterLife/relationshipProjection";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";

const event = (id: string, kind: string, overrides: Partial<CharacterEvent> = {}): CharacterEvent => ({
  id,
  relationId: "relation-a",
  characterId: "character-1",
  userIdentityId: "identity-a",
  kind,
  summary: `${kind} summary`,
  source: "explicit",
  occurredAt: 10,
  recordedAt: 11,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
  ...overrides,
});

const created = projectRelationshipState(undefined, event("created", "relationship_created"));
assert.ok(created, "relationship creation initializes a projection");
assert.equal(created.stage, "friend");
assert.equal(created.tone, "neutral");
assert.equal(created.lastMeaningfulEventId, "created");

const completed = projectRelationshipState(created, event("offline", "offline_story_completed", { occurredAt: 20 }));
assert.equal(completed?.lastMeaningfulEventId, "offline", "completed story becomes the last meaningful event");
assert.equal(completed?.stage, "friend", "offline completion never upgrades stage");

const promised = projectRelationshipState(completed, event("promise-made", "promise_made", {
  source: "promise:tea",
  summary: "Meet for tea later.",
}));
assert.deepEqual(promised?.openLoops.map((loop) => loop.id), ["tea"], "promise creates an open loop");

const kept = projectRelationshipState(promised, event("promise-kept", "promise_kept", { source: "promise:tea" }));
assert.deepEqual(kept?.openLoops, [], "matching promise reference closes the loop");

const conflicted = projectRelationshipState(kept, event("conflict", "conflict"));
assert.equal(conflicted?.tone, "strained");
const repaired = projectRelationshipState(conflicted, event("repair", "repair"));
assert.equal(repaired?.tone, "repairing");

const bounded = projectRelationshipState(repaired, event("boundary", "boundary_set", { summary: "Do not contact after midnight." }));
assert.deepEqual(bounded?.boundaries, ["Do not contact after midnight."]);

const inferred = projectRelationshipState(bounded, event("inferred", "relationship_stage_confirmed", {
  source: "inferred",
  summary: "Upgrade to partner",
}));
assert.equal(inferred?.stage, "friend", "inferred event cannot upgrade relationship stage");
assert.equal(inferred?.lastMeaningfulEventId, "boundary", "inferred event is not projected as meaningful");

const relationB = event("relation-b", "conflict", { relationId: "relation-b", userIdentityId: "identity-b" });
assert.equal(projectRelationshipState(bounded, relationB), bounded, "events from another relation are ignored");

console.log("relationship projection tests passed");
