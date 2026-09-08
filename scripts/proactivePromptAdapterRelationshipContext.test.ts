import assert from "node:assert/strict";
import { buildCharacterCognitiveContext } from "../src/domain/characterCognitive/contextBuilder";
import type { CharacterCognitiveEventCandidate } from "../src/domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { buildRelationshipTimeline } from "../src/domain/characterLife/relationshipTimelineQuery";
import type { RelationshipState } from "../src/domain/characterLife/relationshipStateTypes";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { buildProactivePromptContext, formatProactivePromptContext } from "../src/features/characterCognitive/promptAdapters/proactivePromptAdapter";
import type { Character } from "../src/types";

const character: Character = {
  id: "character-shared",
  name: "Test Character",
  avatar: "avatar.png",
  personality: "calm",
  backstory: "test persona",
};
const relationA = createRelationship({ id: "relation-a", characterId: character.id, userIdentityId: "identity-a", now: 1 });
const relationB = createRelationship({ id: "relation-b", characterId: character.id, userIdentityId: "identity-b", now: 2 });
const makeEvent = (id: string, relationId: string, userIdentityId: string, summary: string): CharacterEvent => ({
  id,
  relationId,
  characterId: character.id,
  userIdentityId,
  kind: "offline_story_completed",
  summary,
  source: "offline_story",
  occurredAt: 10,
  recordedAt: 11,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
});
const eventA = makeEvent("event-a", relationA.id, relationA.userIdentityId, "Confirmed tea appointment.");
const eventB = makeEvent("event-b", relationB.id, relationB.userIdentityId, "Identity B private context.");
const privateEvent = makeEvent("event-private", relationA.id, relationA.userIdentityId, "Private argument.");
const candidateEvents: CharacterCognitiveEventCandidate[] = [
  { event: eventA, promptVisibility: "safe" },
  { event: eventB, promptVisibility: "safe" },
  { event: privateEvent, promptVisibility: "private" },
];
const stateA: RelationshipState = {
  relationId: relationA.id,
  characterId: character.id,
  userIdentityId: relationA.userIdentityId,
  stage: "friend",
  tone: "warm",
  openLoops: [{ id: "loop-a", kind: "promise", description: "Bring back the borrowed book.", createdAt: 12, sourceEventId: "event-a" }],
  boundaries: ["No late-night calls."],
  lastMeaningfulEventId: eventA.id,
  lastMeaningfulEventAt: 12,
  updatedAt: 12,
  version: 1,
};
const timelineA = buildRelationshipTimeline({
  relationId: relationA.id,
  characterId: character.id,
  userIdentityId: relationA.userIdentityId,
  state: stateA,
  events: [eventA, privateEvent],
  generatedAt: 13,
});
const timelineB = buildRelationshipTimeline({
  relationId: relationB.id,
  characterId: character.id,
  userIdentityId: relationB.userIdentityId,
  events: [eventB],
  generatedAt: 13,
});
const buildContext = (relation: typeof relationA, timeline?: typeof timelineA) => buildCharacterCognitiveContext({
  character,
  relation,
  memories: [],
  events: candidateEvents,
  timeContext: { now: 14, date: "2026-08-01", time: "20:00" },
  knowledgeBoundary: { known: [], unknown: [], forbidden: [] },
  relationshipTimeline: timeline,
});

const proactiveA = buildProactivePromptContext(buildContext(relationA, timelineA));
const formattedA = formatProactivePromptContext(proactiveA);
assert.deepEqual(proactiveA.relationshipState, { stage: "friend", tone: "warm" });
assert.deepEqual(proactiveA.relationshipTimeline?.openLoops, ["Bring back the borrowed book."]);
assert.deepEqual(proactiveA.relationshipTimeline?.boundaries, ["No late-night calls."]);
assert.equal(proactiveA.relationshipTimeline?.lastMeaningfulEventAt, 12);
assert.deepEqual(proactiveA.relationshipTimeline?.recentEvents.map((event) => event.summary), ["Confirmed tea appointment."]);
assert.match(formattedA, /Open relationship loops \(candidate topics only\):/);
assert.match(formattedA, /Candidate topic only; do not assume completion: Bring back the borrowed book/);
assert.match(formattedA, /Last meaningful relationship event at: 12/);
assert.doesNotMatch(formattedA, /Private argument/);

const foreignRelation = buildProactivePromptContext(buildContext(relationA, timelineB));
assert.equal(foreignRelation.relationshipTimeline, undefined, "other relation timeline is not exposed");

const sameRelationOtherIdentity = buildRelationshipTimeline({
  relationId: relationA.id,
  characterId: character.id,
  userIdentityId: relationB.userIdentityId,
  events: [eventA],
  generatedAt: 13,
});
const foreignIdentity = buildProactivePromptContext(buildContext(relationA, sameRelationOtherIdentity));
assert.equal(foreignIdentity.relationshipTimeline, undefined, "other identity timeline is not exposed");

const legacy = buildProactivePromptContext(buildContext(relationA));
assert.equal(legacy.relationshipState, undefined, "missing timeline preserves legacy adapter output");
assert.equal(legacy.relationshipTimeline, undefined, "missing timeline preserves legacy adapter output");

for (const output of [proactiveA, foreignRelation, foreignIdentity, legacy]) {
  const serialized = JSON.stringify(output);
  for (const internalId of [relationA.id, relationB.id, relationA.userIdentityId, relationB.userIdentityId, eventA.id]) {
    assert.equal(serialized.includes(internalId), false, `${internalId} must not enter proactive prompt context`);
  }
  assert.equal(serialized.includes('"version"'), false, "state version must not enter proactive prompt context");
  assert.equal(serialized.includes('"projectionVersion"'), false, "timeline version must not enter proactive prompt context");
  assert.equal(serialized.includes('"lastMeaningfulEventId"'), false, "event ID must not enter proactive prompt context");
}

console.log("PASS proactive prompt adapter relationship context scope and redaction");
