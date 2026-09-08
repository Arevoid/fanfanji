import assert from "node:assert/strict";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import type { AiChatRequest } from "../src/features/chat/services/chatServiceTypes";
import { buildProactiveCognitiveContext } from "../src/features/chat/services/proactiveCognitiveContext";
import { generateProactiveReplyCandidates } from "../src/features/chat/services/proactiveMessageService";
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
const memories: MemoryItem[] = [
  { id: "memory-a", characterId: character.id, relationId: relationA.id, content: "A private chat memory", timestamp: 3 },
  { id: "memory-b", characterId: character.id, relationId: relationB.id, content: "B private chat memory", timestamp: 4 },
];
const event = (id: string, relationId: string, userIdentityId: string, kind: CharacterEvent["kind"], summary: string): CharacterEvent => ({
  id,
  relationId,
  characterId: character.id,
  userIdentityId,
  kind,
  summary,
  source: "test",
  occurredAt: 10,
  recordedAt: 11,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
});
const events = [
  event("event-a", relationA.id, relationA.userIdentityId, "offline_story_completed", "A safe event"),
  event("event-b", relationB.id, relationB.userIdentityId, "offline_story_completed", "B safe event"),
  event("event-private", relationA.id, relationA.userIdentityId, "unreviewed", "A private event"),
];
const occurredAt = Date.UTC(2026, 7, 1, 20, 0);
const contextA = buildProactiveCognitiveContext({ character, relationship: relationA, memories, events, occurredAt });
const contextB = buildProactiveCognitiveContext({ character, relationship: relationB, memories, events, occurredAt });
assert.ok(contextA);
assert.ok(contextB);

const request: AiChatRequest = { message: "existing proactive task", history: [], systemInstruction: "Existing proactive prompt", apiKey: "", model: "test" };
const capturedRequests: AiChatRequest[] = [];
const requestAi = async (input: AiChatRequest) => {
  capturedRequests.push(input);
  return { text: "A proactive hello" };
};
const sharedInput = {
  requestAi,
  request,
  characterId: character.id,
  disableBracketActions: false,
  keepPeriods: false,
  createId: (index: number) => `message-${index}`,
  currentTime: (index: number) => 20 + index,
};

await generateProactiveReplyCandidates({ ...sharedInput, cognitiveContext: contextA });
const promptA = capturedRequests[0].systemInstruction || "";
assert.match(promptA, /RELATION-SAFE PROACTIVE COGNITIVE CONTEXT/);
assert.match(promptA, /A safe event/);
assert.match(promptA, /2026-08-01 20:00/);
assert.equal(promptA.includes("B safe event"), false);
assert.equal(promptA.includes("A private event"), false);
assert.equal(promptA.includes("A private chat memory"), false);
assert.equal(promptA.includes(relationA.id), false);
assert.equal(promptA.includes(relationB.id), false);
assert.equal(promptA.includes(relationA.userIdentityId), false);
assert.equal(promptA.includes(relationB.userIdentityId), false);

await generateProactiveReplyCandidates({ ...sharedInput, cognitiveContext: contextB });
const promptB = capturedRequests[1].systemInstruction || "";
assert.match(promptB, /B safe event/);
assert.equal(promptB.includes("A safe event"), false);

const legacyRequests: AiChatRequest[] = [];
await generateProactiveReplyCandidates({
  ...sharedInput,
  requestAi: async (input) => {
    legacyRequests.push(input);
    return { text: "Legacy proactive hello" };
  },
});
assert.equal(legacyRequests[0], request, "a missing cognitive context must retain the legacy request object");

console.log("PASS proactive prompt adapter integration, scope isolation, private-event exclusion, time projection, identifier redaction, and legacy fallback");
