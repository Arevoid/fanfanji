import assert from "node:assert/strict";
import { buildCharacterCognitiveContext } from "../src/domain/characterCognitive/contextBuilder";
import type { CharacterCognitiveEventCandidate } from "../src/domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import {
  buildDiaryPromptContext,
  formatDiaryPromptContext,
} from "../src/features/characterCognitive/promptAdapters/diaryPromptAdapter";
import { generateDiaryEntry } from "../src/features/diary/services/diaryGenerationService";
import type { Character, MemoryItem, UserSettings } from "../src/types";
import type { apiChat } from "../src/utils/apiHelper";

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
const memories: MemoryItem[] = [
  { id: "private-memory-a", characterId: character.id, relationId: relationA.id, content: "A private user memory", timestamp: 3 },
  { id: "private-memory-b", characterId: character.id, relationId: relationB.id, content: "B private user memory", timestamp: 4 },
];
const buildContext = (relation: typeof relationA) => buildCharacterCognitiveContext({
  character,
  relation,
  memories,
  events,
  timeContext: { now: 12, date: "2026-08-01", time: "20:00" },
  knowledgeBoundary: { known: [], unknown: ["other identities"], forbidden: ["invented shared scenes"] },
  behaviorConstraints: [{ id: "no-invention", description: "Do not invent shared scenes." }],
});

const contextA = buildContext(relationA);
const contextB = buildContext(relationB);
const promptA = formatDiaryPromptContext(buildDiaryPromptContext(contextA));
const promptB = formatDiaryPromptContext(buildDiaryPromptContext(contextB));

assert.match(promptA, /A verified event/);
assert.doesNotMatch(promptA, /B verified event|A private event|A private user memory|B private user memory/);
assert.match(promptB, /B verified event/);
assert.doesNotMatch(promptB, /A verified event|A private event|A private user memory|B private user memory/);
assert.match(promptA, /2026-08-01 20:00/);
assert.match(promptA, /Do not invent shared scenes/);
assert.equal(promptA.includes(relationA.id), false);
assert.equal(promptA.includes(relationB.id), false);
assert.equal(promptA.includes(relationA.userIdentityId), false);
assert.equal(promptA.includes(relationB.userIdentityId), false);
assert.equal(formatDiaryPromptContext(undefined), "", "missing context must keep the legacy path available");

type ChatRequest = Parameters<typeof apiChat>[0];
const settings: UserSettings = { apiKey: "", selectedModel: "test" } as UserSettings;
const messages = [{ id: "message-a", characterId: character.id, relationId: relationA.id, conversationId: relationA.conversationId, sender: "user" as const, content: "Today was calm.", timestamp: 5 }];
const captured: ChatRequest[] = [];
const fakeChat: typeof apiChat = async (request) => {
  captured.push(request);
  return { text: '{"title":"Test","body":"A short entry.","emotionalState":"calm","weather":"","location":"","tags":["daily"]}' } as Awaited<ReturnType<typeof apiChat>>;
};

await generateDiaryEntry({ relation: relationA, character, ownerIdentityId: relationA.userIdentityId, messages, settings, trigger: "manual", occurredAt: 20, cognitiveContext: contextA, chat: fakeChat });
assert.match(captured[0].message, /RELATION-SAFE DIARY COGNITIVE CONTEXT/);
assert.match(captured[0].message, /A verified event/);
assert.doesNotMatch(captured[0].message, /B verified event|A private event|A private user memory/);

const legacyCaptured: ChatRequest[] = [];
await generateDiaryEntry({ relation: relationA, character, ownerIdentityId: relationA.userIdentityId, messages, settings, trigger: "manual", occurredAt: 21, chat: async (request) => {
  legacyCaptured.push(request);
  return { text: '{"title":"Test","body":"A short entry.","emotionalState":"calm","weather":"","location":"","tags":["daily"]}' } as Awaited<ReturnType<typeof apiChat>>;
} });
assert.doesNotMatch(legacyCaptured[0].message, /RELATION-SAFE DIARY COGNITIVE CONTEXT/);

console.log("PASS diary prompt adapter safety, relation isolation, identifier redaction, time projection, and legacy generation fallback");
