import assert from "node:assert/strict";
import { buildCharacterCognitiveContext } from "../src/domain/characterCognitive/contextBuilder";
import type { CharacterCognitiveEventCandidate } from "../src/domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { buildPublicForumCognitiveContext } from "../src/domain/publicCognitive/publicContextBuilder";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { buildMomentPromptContext, formatMomentPromptContext } from "../src/features/characterCognitive/promptAdapters/momentPromptAdapter";
import type { Character, MemoryItem } from "../src/types";

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
const publicEvent = makeEvent("event-public", relationA.id, relationA.userIdentityId, "Public book-club announcement.");
const privateEvent = makeEvent("event-private", relationA.id, relationA.userIdentityId, "Private argument.");
const relationEventB = makeEvent("event-b", relationB.id, relationB.userIdentityId, "Identity B relationship event.");
const memories: MemoryItem[] = [
  { id: "memory-a", characterId: character.id, relationId: relationA.id, content: "Private chat memory.", timestamp: 3 },
];
const cognitiveEvents: CharacterCognitiveEventCandidate[] = [
  { event: publicEvent, promptVisibility: "safe" },
  { event: privateEvent, promptVisibility: "private" },
  { event: relationEventB, promptVisibility: "safe" },
];
const contextA = buildCharacterCognitiveContext({
  character,
  relation: relationA,
  memories,
  events: cognitiveEvents,
  timeContext: { now: 12, date: "2026-08-01", time: "20:00" },
  knowledgeBoundary: { known: ["private boundary"], unknown: [], forbidden: ["Private relation boundary."] },
  behaviorConstraints: [{ id: "private-constraint", description: "Private relationship constraint." }],
});
const contextB = buildCharacterCognitiveContext({
  character,
  relation: relationB,
  memories,
  events: cognitiveEvents,
  timeContext: { now: 12, date: "2026-08-01", time: "20:00" },
  knowledgeBoundary: { known: [], unknown: [], forbidden: [] },
});
const publicContextA = buildPublicForumCognitiveContext({
  character,
  events: [
    { event: publicEvent, visibility: "public" },
    { event: privateEvent, visibility: "private" },
    { event: relationEventB, visibility: "relationship" },
  ],
  worldSettings: [
    { title: "Public setting", content: "Everyone can know this.", visibility: "public" },
    { title: "Private setting", content: "Never expose this.", visibility: "private" },
  ],
  currentTime: { now: 12, date: "2026-08-01", time: "20:00" },
});

const publicPrompt = buildMomentPromptContext(contextA, { publicContext: publicContextA });
const formatted = formatMomentPromptContext(publicPrompt);
assert.deepEqual(publicPrompt.publicEvents.map((event) => event.summary), ["Public book-club announcement."]);
assert.deepEqual(publicPrompt.publicWorldKnowledge, [{ title: "Public setting", content: "Everyone can know this." }]);
assert.deepEqual(publicPrompt.publicFacts, [], "Memory is never projected into Moments");
assert.deepEqual(publicPrompt.behaviorConstraints, [], "private behavior constraints are denied by default");
assert.match(formatted, /Public book-club announcement/);
assert.match(formatted, /Public setting: Everyone can know this/);
for (const forbidden of [
  "Private argument.",
  "Identity B relationship event.",
  "Private chat memory.",
  "Private relationship constraint.",
  "Private relation boundary.",
  relationA.id,
  relationB.id,
  relationA.userIdentityId,
  relationB.userIdentityId,
  publicEvent.id,
]) {
  assert.equal(formatted.includes(forbidden), false, `${forbidden} must not enter Moment prompt output`);
}

const contextBPrompt = buildMomentPromptContext(contextB);
assert.deepEqual(contextBPrompt.publicEvents, [], "a relation context cannot promote its safe events to public");
assert.equal(formatMomentPromptContext(contextBPrompt).includes("Identity B relationship event."), false);

const legacyPrompt = buildMomentPromptContext(contextA);
assert.deepEqual(legacyPrompt.publicEvents, [], "missing public context keeps public event projection empty");
assert.deepEqual(legacyPrompt.publicWorldKnowledge, [], "missing public context keeps world projection empty");
assert.equal(formatMomentPromptContext(undefined), "", "missing adapter context remains compatible");

console.log("PASS Moment prompt adapter public visibility, relation isolation, and legacy fallback");
