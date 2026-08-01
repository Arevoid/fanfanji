import assert from "node:assert/strict";
import { buildCharacterCognitiveContext } from "../src/domain/characterCognitive/contextBuilder";
import type { CharacterCognitiveEventCandidate } from "../src/domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import {
  buildForumDirectMessagePromptContext,
  formatForumDirectMessagePromptContext,
} from "../src/features/characterCognitive/promptAdapters/forumDirectMessagePromptAdapter";
import type { Character, MemoryItem } from "../src/types";

const character: Character = {
  id: "character-shared",
  name: "Rin",
  avatar: "avatar.png",
  personality: "quiet and observant",
  backstory: "A test character.",
};
const relationA = createRelationship({ id: "relation-a", characterId: character.id, userIdentityId: "identity-a", now: 1 });
const relationB = createRelationship({ id: "relation-b", characterId: character.id, userIdentityId: "identity-b", now: 2 });
const event = (id: string, relationId: string, userIdentityId: string, summary: string): CharacterEvent => ({
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
const events: CharacterCognitiveEventCandidate[] = [
  { event: event("event-a", relationA.id, relationA.userIdentityId, "A verified event"), promptVisibility: "safe" },
  { event: event("event-b", relationB.id, relationB.userIdentityId, "B verified event"), promptVisibility: "safe" },
  { event: event("private-a", relationA.id, relationA.userIdentityId, "A private event"), promptVisibility: "private" },
];
const privateMemories: MemoryItem[] = [
  { id: "memory-a", characterId: character.id, relationId: relationA.id, content: "A private chat memory", timestamp: 3 },
  { id: "memory-b", characterId: character.id, relationId: relationB.id, content: "B private chat memory", timestamp: 4 },
];
const buildContext = (relation: typeof relationA) => buildCharacterCognitiveContext({
  character,
  relation,
  memories: privateMemories,
  events,
  timeContext: { now: 12, date: "2026-08-01", time: "20:00" },
  knowledgeBoundary: { known: [], unknown: ["other identities"], forbidden: ["invented shared scenes"] },
  behaviorConstraints: [{ id: "no-invention", description: "Do not invent shared scenes." }],
});

const promptA = formatForumDirectMessagePromptContext(buildForumDirectMessagePromptContext(buildContext(relationA)));
const promptB = formatForumDirectMessagePromptContext(buildForumDirectMessagePromptContext(buildContext(relationB)));

assert.match(promptA, /A verified event/);
assert.doesNotMatch(promptA, /B verified event|A private event|A private chat memory|B private chat memory/);
assert.match(promptB, /B verified event/);
assert.doesNotMatch(promptB, /A verified event|A private event|A private chat memory|B private chat memory/);
assert.match(promptA, /2026-08-01 20:00/);
assert.equal(promptA.includes(relationA.id), false);
assert.equal(promptA.includes(relationB.id), false);
assert.equal(promptA.includes(relationA.userIdentityId), false);
assert.equal(promptA.includes(relationB.userIdentityId), false);
assert.equal(promptA.includes(character.id), false);
assert.equal(formatForumDirectMessagePromptContext(undefined), "", "missing context keeps the legacy Forum DM path");

console.log("PASS forum direct-message prompt adapter scope isolation, private-event filtering, identifier redaction, and legacy fallback");
