import assert from "node:assert/strict";
import { buildCharacterCognitiveContext } from "../src/domain/characterCognitive/contextBuilder";
import type { CharacterCognitiveEventCandidate } from "../src/domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { buildRelationshipTimeline } from "../src/domain/characterLife/relationshipTimelineQuery";
import type { RelationshipState } from "../src/domain/characterLife/relationshipStateTypes";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import type { Character, MemoryItem } from "../src/types";

const character: Character = {
  id: "character-shared",
  name: "Shared Character",
  avatar: "avatar",
  age: 24,
  gender: "nonbinary",
  mbti: "INTJ",
  personality: "quiet and precise",
  backstory: "A compact canonical backstory.",
  remark: "must not be projected",
  enableProactiveChat: true,
};

const relationA = createRelationship({
  id: "relation-a",
  characterId: character.id,
  userIdentityId: "identity-a",
  now: 10,
});
const relationB = createRelationship({
  id: "relation-b",
  characterId: character.id,
  userIdentityId: "identity-b",
  now: 20,
});

const memories: MemoryItem[] = [
  { id: "memory-a", characterId: character.id, relationId: relationA.id, content: "fact only A knows", timestamp: 30 },
  { id: "memory-b", characterId: character.id, relationId: relationB.id, content: "fact only B knows", timestamp: 40 },
  { id: "legacy-memory", characterId: character.id, content: "unscoped legacy fact", timestamp: 50 },
];

const event = (id: string, relationId: string, userIdentityId: string, summary: string): CharacterEvent => ({
  id,
  relationId,
  characterId: character.id,
  userIdentityId,
  kind: "relationship_created",
  summary,
  source: "relationship",
  occurredAt: 60,
  recordedAt: 61,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
});

const events: CharacterCognitiveEventCandidate[] = [
  { event: event("event-a", relationA.id, relationA.userIdentityId, "event only A knows"), promptVisibility: "safe" },
  { event: event("event-b", relationB.id, relationB.userIdentityId, "event only B knows"), promptVisibility: "safe" },
  { event: event("event-private", relationA.id, relationA.userIdentityId, "private event"), promptVisibility: "private" },
];

const relationshipStateA: RelationshipState = {
  relationId: relationA.id,
  characterId: character.id,
  userIdentityId: relationA.userIdentityId,
  stage: "friend",
  tone: "warm",
  openLoops: [{ id: "tea", kind: "promise", description: "Have tea", createdAt: 55, sourceEventId: "event-a" }],
  boundaries: ["No late-night calls."],
  updatedAt: 65,
  version: 1,
};
const relationshipEvents = events.map((candidate) => candidate.event);
const timelineA = buildRelationshipTimeline({
  relationId: relationA.id,
  characterId: character.id,
  userIdentityId: relationA.userIdentityId,
  events: relationshipEvents,
  state: relationshipStateA,
  generatedAt: 70,
});

const contextA = buildCharacterCognitiveContext({
  character,
  relation: relationA,
  memories,
  events,
  timeContext: {
    now: Date.UTC(2026, 7, 1, 12, 34),
    date: "2026-08-01",
    time: "20:34",
    timezone: "UTC+8",
    period: "evening",
  },
  knowledgeBoundary: {
    known: ["the current direct relation"],
    unknown: ["other identity private facts"],
    forbidden: ["invented shared scenes"],
  },
  relationshipTimeline: timelineA,
});

// A/B relation isolation: neither scoped nor legacy data may cross into A.
assert.deepEqual(contextA.knownFacts.map((fact) => fact.id), ["memory-a"]);
assert.equal(contextA.knownFacts.some((fact) => fact.content.includes("B knows")), false);
assert.equal(contextA.knownFacts.some((fact) => fact.id === "legacy-memory"), false);
assert.deepEqual(contextA.recentEvents.map((item) => item.id), ["event-a"]);
assert.equal(contextA.recentEvents.some((item) => item.summary.includes("B knows")), false);

// Event admission is explicit: private event candidates never enter context.
assert.equal(contextA.recentEvents.some((item) => item.id === "event-private"), false);

// Timeline and its state are admitted only as a scope-matched, read-only projection.
assert.equal(contextA.relationshipTimeline, timelineA);
assert.equal(contextA.relationshipState, relationshipStateA);
assert.deepEqual(contextA.relationshipState?.openLoops.map((loop) => loop.id), ["tea"]);
assert.deepEqual(contextA.relationshipState?.boundaries, ["No late-night calls."]);

const timelineB = buildRelationshipTimeline({
  relationId: relationB.id,
  characterId: character.id,
  userIdentityId: relationB.userIdentityId,
  events: relationshipEvents,
  generatedAt: 71,
});
const contextWithForeignTimeline = buildCharacterCognitiveContext({
  character,
  relation: relationA,
  memories: [],
  events: [],
  timeContext: { now: 72 },
  knowledgeBoundary: { known: [], unknown: [] },
  relationshipTimeline: timelineB,
});
assert.equal(contextWithForeignTimeline.relationshipTimeline, undefined, "other relation timeline is rejected");
assert.equal(contextWithForeignTimeline.relationshipState, undefined, "other identity state is rejected");

const sameRelationOtherIdentityTimeline = buildRelationshipTimeline({
  relationId: relationA.id,
  characterId: character.id,
  userIdentityId: relationB.userIdentityId,
  events: [],
  generatedAt: 72,
});
const contextWithForeignIdentityTimeline = buildCharacterCognitiveContext({
  character,
  relation: relationA,
  memories: [],
  events: [],
  timeContext: { now: 72 },
  knowledgeBoundary: { known: [], unknown: [] },
  relationshipTimeline: sameRelationOtherIdentityTimeline,
});
assert.equal(contextWithForeignIdentityTimeline.relationshipTimeline, undefined, "same relation with another identity is rejected");

const emptyTimeline = buildRelationshipTimeline({
  relationId: relationA.id,
  characterId: character.id,
  userIdentityId: relationA.userIdentityId,
  events: [],
  generatedAt: 73,
});
const contextWithEmptyTimeline = buildCharacterCognitiveContext({
  character,
  relation: relationA,
  memories: [],
  events: [],
  timeContext: { now: 74 },
  knowledgeBoundary: { known: [], unknown: [] },
  relationshipTimeline: emptyTimeline,
});
assert.equal(contextWithEmptyTimeline.relationshipTimeline?.eventCount, 0, "empty timeline remains compatible");
assert.equal(contextWithEmptyTimeline.relationshipState, undefined, "empty timeline has no state");

// Persona is compact and contains no UI/contact configuration or full Character copy.
assert.deepEqual(Object.keys(contextA.persona).sort(), ["age", "backstory", "gender", "id", "mbti", "name", "personality"]);
assert.equal("remark" in contextA.persona, false);
assert.equal("enableProactiveChat" in contextA.persona, false);

// Caller-provided local time is retained exactly rather than inferred from data timestamps.
assert.deepEqual(contextA.temporalContext, {
  now: Date.UTC(2026, 7, 1, 12, 34),
  date: "2026-08-01",
  time: "20:34",
  timezone: "UTC+8",
  period: "evening",
});

assert.throws(
  () => buildCharacterCognitiveContext({
    character,
    relation: relationA,
    conversationId: relationB.conversationId,
    memories: [],
    events: [],
    timeContext: { now: 1 },
    knowledgeBoundary: { known: [], unknown: [] },
  }),
  /conversationId must match relation.conversationId/,
);

console.log("PASS CharacterCognitiveContext scope, event visibility, persona projection, and time context");
