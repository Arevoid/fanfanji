import assert from "node:assert/strict";
import { buildCharacterCognitiveContext } from "../src/domain/characterCognitive/contextBuilder";
import type { CharacterCognitiveEventCandidate } from "../src/domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { buildMomentPublicCognitiveContext } from "../src/domain/momentCognitive/momentPublicContextBuilder";
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

const publicContext = buildMomentPublicCognitiveContext({
  character,
  publicMomentHistory: [
    { characterId: character.id, visibility: "public", authorName: "Test Character", content: "A recent public post", timestamp: 2 },
    { characterId: character.id, visibility: "public", authorName: "Test Character", content: "B older public post", timestamp: 1 },
    { characterId: "other-character", visibility: "public", authorName: "Other", content: "Other character post", timestamp: 3 },
  ],
  publicCommentHistory: [
    { characterId: character.id, visibility: "public", authorName: "Visitor", content: "A public comment", timestamp: 4 },
    { characterId: "other-character", visibility: "public", authorName: "Visitor", content: "Other character comment", timestamp: 5 },
  ],
  publicFacts: [
    { characterId: character.id, visibility: "public", content: "Explicit public fact" },
    { characterId: character.id, visibility: "public", isRelationshipScoped: true, content: "Unauthorized shared experience" },
  ],
  publicEvents: [
    { event: publicEvent, visibility: "public" },
    { event: privateEvent, visibility: "private" },
    { event: relationEventB, visibility: "relationship" },
  ],
  publicBehaviorConstraints: [{ visibility: "public", description: "Do not invent private experiences." }],
  currentTime: { now: 12, date: "2026-08-01", time: "20:00" },
});

const publicPrompt = buildMomentPromptContext(contextA, { publicContext, maxPublicHistory: 1, maxPublicComments: 1 });
const formatted = formatMomentPromptContext(publicPrompt);
assert.deepEqual(publicPrompt.publicFacts, [{ content: "Explicit public fact" }]);
assert.deepEqual(publicPrompt.publicEvents.map((event) => event.summary), ["Public book-club announcement."]);
assert.deepEqual(publicPrompt.publicMomentHistory.map((item) => item.content), ["A recent public post"]);
assert.deepEqual(publicPrompt.publicCommentHistory.map((item) => item.content), ["A public comment"]);
assert.deepEqual(publicPrompt.behaviorConstraints, [{ description: "Do not invent private experiences." }]);
assert.match(formatted, /A recent public post/);
assert.match(formatted, /A public comment/);
assert.match(formatted, /Explicit public fact/);
assert.match(formatted, /Public book-club announcement/);
assert.match(formatted, /Do not invent private experiences/);
assert.match(formatted, /2026-08-01 20:00/);

for (const forbidden of [
  "Private argument.",
  "Identity B relationship event.",
  "Private chat memory.",
  "Private relationship constraint.",
  "Private relation boundary.",
  "Unauthorized shared experience",
  "Other character post",
  "Other character comment",
  relationA.id,
  relationB.id,
  relationA.userIdentityId,
  relationB.userIdentityId,
  publicEvent.id,
]) {
  assert.equal(formatted.includes(forbidden), false, `${forbidden} must not enter Moment prompt output`);
}

const legacyPrompt = buildMomentPromptContext(contextA);
assert.deepEqual(legacyPrompt.publicFacts, [], "missing public context keeps facts empty");
assert.deepEqual(legacyPrompt.publicEvents, [], "missing public context keeps events empty");
assert.deepEqual(legacyPrompt.publicMomentHistory, [], "missing public context keeps history empty");
assert.deepEqual(legacyPrompt.publicCommentHistory, [], "missing public context keeps comments empty");
assert.deepEqual(legacyPrompt.behaviorConstraints, [], "missing public context keeps constraints empty");
assert.equal(formatMomentPromptContext(undefined), "", "missing adapter context remains compatible");

const previousEvening = new Date(2026, 7, 14, 22, 35).getTime();
const datedFormatted = formatMomentPromptContext({
  ...publicPrompt,
  time: { date: "2026-08-15", time: "11:26" },
  relationFacts: [{ content: "用户发送红包 52.1 元。", timestamp: previousEvening }],
  relationEvents: [{
    kind: "red_packet_received",
    summary: "收到用户发送的红包 52.1 元。",
    occurredAt: previousEvening,
    confidence: 1,
  }],
});
assert.match(datedFormatted, /相对本条朋友圈为“昨天”/);
assert.match(datedFormatted, /用户发送红包 52\.1 元/);
assert.match(datedFormatted, /Never rewrite a yesterday\/earlier event as happening today/);

console.log("PASS Moment Prompt Adapter uses MomentPublicCognitiveContext with public isolation, bounded history, and legacy fallback");
