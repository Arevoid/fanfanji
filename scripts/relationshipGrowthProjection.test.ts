import assert from "node:assert/strict";
import { projectRelationshipState } from "../src/domain/characterLife/relationshipProjection";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";

const event = (
  id: string,
  kind: string,
  overrides: Partial<CharacterEvent> = {},
): CharacterEvent => ({
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

const initial = projectRelationshipState(undefined, event("created", "relationship_created"));
assert.ok(initial);
assert.equal(initial.stage, "friend");
assert.deepEqual(initial.habitSummaries, []);
assert.deepEqual(initial.meaningfulEvents, []);
assert.deepEqual(initial.milestones, []);

const habit = projectRelationshipState(initial, event("habit", "habit_formed", {
  summary: "We check in after work.",
  occurredAt: 20,
}));
assert.deepEqual(habit?.habitSummaries, [{
  id: "habit",
  summary: "We check in after work.",
  formedAt: 20,
  sourceEventId: "habit",
}]);
assert.equal(habit?.lastMeaningfulEventId, "habit");
assert.equal(habit?.stage, "friend", "growth events do not upgrade relationship stage");

const shared = projectRelationshipState(habit, event("share", "meaningful_share", {
  summary: "Shared a difficult decision honestly.",
  occurredAt: 30,
}));
assert.deepEqual(shared?.meaningfulEvents, [{
  id: "share",
  kind: "meaningful_share",
  summary: "Shared a difficult decision honestly.",
  occurredAt: 30,
  sourceEventId: "share",
}]);

const cared = projectRelationshipState(shared, event("care", "care_shown", {
  occurredAt: 40,
}));
assert.equal(cared?.tone, "warm", "care warms a neutral relationship");
assert.equal(cared?.stage, "friend", "care cannot jump the relationship stage");

const conflicted = projectRelationshipState(cared, event("conflict", "conflict", { occurredAt: 50 }));
const careDuringConflict = projectRelationshipState(conflicted, event("care-2", "care_shown", { occurredAt: 60 }));
assert.equal(careDuringConflict?.tone, "strained", "care does not erase an unresolved conflict");

const milestone = projectRelationshipState(careDuringConflict, event("milestone", "milestone_reached", {
  summary: "Kept a long-running promise.",
  occurredAt: 70,
}));
assert.deepEqual(milestone?.milestones, [{
  id: "milestone",
  summary: "Kept a long-running promise.",
  reachedAt: 70,
  sourceEventId: "milestone",
}]);

const duplicateMilestone = projectRelationshipState(milestone, event("milestone", "milestone_reached", {
  summary: "Kept a long-running promise.",
  occurredAt: 71,
}));
assert.equal(duplicateMilestone?.milestones?.length, 1, "the same event is not recorded twice");

const inferred = projectRelationshipState(milestone, event("inferred-care", "care_shown", {
  source: "inferred",
  confidence: 0.5,
  occurredAt: 80,
}));
assert.equal(inferred, milestone, "inferred or low-confidence events are rejected");

const foreign = projectRelationshipState(milestone, event("foreign", "habit_formed", {
  relationId: "relation-b",
  userIdentityId: "identity-b",
  occurredAt: 90,
}));
assert.equal(foreign, milestone, "cross-relation events are ignored");

console.log("PASS relationship growth event projection, tone bounds, stage stability, scope isolation, and confidence policy");
