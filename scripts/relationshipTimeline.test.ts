import assert from "node:assert/strict";
import { buildRelationshipTimeline } from "../src/domain/characterLife/relationshipTimelineQuery";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import type { RelationshipState } from "../src/domain/characterLife/relationshipStateTypes";

const event = (id: string, occurredAt: number, overrides: Partial<CharacterEvent> = {}): CharacterEvent => ({
  id,
  relationId: "relation-a",
  characterId: "character-1",
  userIdentityId: "identity-a",
  kind: "offline_story_completed",
  summary: id,
  source: `offline_story:${id}:completed`,
  occurredAt,
  recordedAt: occurredAt + 1,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
  ...overrides,
});

const state: RelationshipState = {
  relationId: "relation-a",
  characterId: "character-1",
  userIdentityId: "identity-a",
  stage: "friend",
  tone: "neutral",
  openLoops: [],
  boundaries: [],
  updatedAt: 40,
  version: 1,
};

const events = [
  event("old", 10),
  event("new", 30),
  event("middle", 20),
  event("other-relation", 100, { relationId: "relation-b" }),
  event("other-identity", 90, { userIdentityId: "identity-b" }),
];

const timeline = buildRelationshipTimeline({
  relationId: "relation-a",
  characterId: "character-1",
  userIdentityId: "identity-a",
  events,
  state,
  generatedAt: 50,
});
assert.equal(timeline.state, state, "matching state is included without copying");
assert.equal(timeline.eventCount, 3, "only the current relation scope is counted");
assert.deepEqual(timeline.recentEvents.map((item) => item.id), ["new", "middle", "old"], "events are newest first");
assert.equal(timeline.lastEventAt, 30);
assert.equal(timeline.generatedAt, 50);

const limited = buildRelationshipTimeline({
  relationId: "relation-a",
  characterId: "character-1",
  userIdentityId: "identity-a",
  events,
  state,
  limit: 2,
  generatedAt: 51,
});
assert.deepEqual(limited.recentEvents.map((item) => item.id), ["new", "middle"], "limit applies after scope filtering and sorting");

const identityB = buildRelationshipTimeline({
  relationId: "relation-a",
  characterId: "character-1",
  userIdentityId: "identity-b",
  events,
  state,
  generatedAt: 52,
});
assert.deepEqual(identityB.recentEvents.map((item) => item.id), ["other-identity"], "different identity cannot read identity A events");
assert.equal(identityB.state, undefined, "mismatched state is excluded");

const empty = buildRelationshipTimeline({
  relationId: "relation-empty",
  characterId: "character-1",
  userIdentityId: "identity-a",
  events: [],
  generatedAt: 53,
});
assert.equal(empty.eventCount, 0);
assert.deepEqual(empty.recentEvents, []);
assert.equal(empty.lastEventAt, undefined);

console.log("relationship timeline tests passed");
