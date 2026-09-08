import assert from "node:assert/strict";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { buildMomentPromptContext, formatMomentPromptContext } from "../src/features/characterCognitive/promptAdapters/momentPromptAdapter";
import { buildMomentCognitiveContext } from "../src/features/moments/services/momentCognitiveContext";
import type { Character, MemoryItem } from "../src/types";

const character: Character = {
  id: "moment-scope-character",
  name: "Scope Character",
  avatar: "scope.png",
  personality: "observant and dry-humoured",
  backstory: "lives near a bookshop",
};
const relationA = createRelationship({
  id: "moment-scope-relation-a",
  characterId: character.id,
  userIdentityId: "moment-scope-user-a",
  now: 1,
});
const relationB = createRelationship({
  id: "moment-scope-relation-b",
  characterId: character.id,
  userIdentityId: "moment-scope-user-b",
  now: 2,
});
relationA.compressedMemory = "stale unverified relationship summary";

const event = (
  id: string,
  relationId: string,
  userIdentityId: string,
  summary: string,
  overrides: Partial<CharacterEvent> = {},
): CharacterEvent => ({
  id,
  relationId,
  characterId: character.id,
  userIdentityId,
  kind: "offline_story_completed",
  summary,
  source: "offline_story",
  occurredAt: 100,
  recordedAt: 101,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
  ...overrides,
});

const memories: MemoryItem[] = [
  { id: "memory-a", characterId: character.id, relationId: relationA.id, content: "We found a quiet ramen shop together.", timestamp: 10 },
  { id: "memory-b", characterId: character.id, relationId: relationB.id, content: "Other identity private memory.", timestamp: 11 },
];
const contextA = buildMomentCognitiveContext({
  character,
  relationship: relationA,
  memories,
  events: [
    event("event-a", relationA.id, relationA.userIdentityId, "The two confirmed a weekend museum visit."),
    event("event-b", relationB.id, relationB.userIdentityId, "Other identity confirmed event."),
    event("event-unconfirmed", relationA.id, relationA.userIdentityId, "Unconfirmed imagined outing.", { confidence: 0 }),
    event("event-ai", relationA.id, relationA.userIdentityId, "AI invented event.", { source: "ai_generated" }),
  ],
  occurredAt: 200,
});

assert.deepEqual(contextA.knownFacts.map((fact) => fact.content), ["We found a quiet ramen shop together."]);
assert.deepEqual(contextA.recentEvents.map((item) => item.summary), ["The two confirmed a weekend museum visit."]);

const prompt = formatMomentPromptContext(buildMomentPromptContext(contextA, {
  relationContext: contextA,
  relationWorldKnowledge: [
    { title: "Local setting", content: "The bookshop closes at nine." },
  ],
}));

for (const allowed of [
  "We found a quiet ramen shop together.",
  "The two confirmed a weekend museum visit.",
  "Local setting: The bookshop closes at nine.",
]) {
  assert.match(prompt, new RegExp(allowed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${allowed} should reach the scoped Moment prompt`);
}

for (const forbidden of [
  "Other identity private memory.",
  "Other identity confirmed event.",
  "Unconfirmed imagined outing.",
  "AI invented event.",
  "stale unverified relationship summary",
  relationA.id,
  relationA.userIdentityId,
  relationB.id,
  relationB.userIdentityId,
]) {
  assert.equal(prompt.includes(forbidden), false, `${forbidden} must not enter the Moment prompt`);
}

console.log("PASS scoped Moment context admits only confirmed current-relation material and strips internal identifiers");
