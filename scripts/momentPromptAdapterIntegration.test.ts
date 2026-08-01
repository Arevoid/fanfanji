import assert from "node:assert/strict";
import { buildCharacterCognitiveContext } from "../src/domain/characterCognitive/contextBuilder";
import type { CharacterCognitiveEventCandidate } from "../src/domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { requestAutomaticMomentComment } from "../src/features/moments/services/momentCommentService";
import { requestCharacterMoment } from "../src/features/moments/services/momentGenerator";
import { requestMomentCommentReply } from "../src/features/moments/services/momentReplyService";
import type { Character, MemoryItem } from "../src/types";
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
const memories: MemoryItem[] = [
  { id: "memory-a", characterId: character.id, relationId: relationA.id, content: "A private chat memory", timestamp: 3 },
  { id: "memory-b", characterId: character.id, relationId: relationB.id, content: "B private chat memory", timestamp: 4 },
];
const event = (id: string, relationId: string, userIdentityId: string, summary: string): CharacterEvent => ({
  id,
  relationId,
  characterId: character.id,
  userIdentityId,
  kind: "offline_story_completed",
  summary,
  source: "test",
  occurredAt: 10,
  recordedAt: 11,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
});
const events: CharacterCognitiveEventCandidate[] = [
  { event: event("event-a", relationA.id, relationA.userIdentityId, "A safe event"), promptVisibility: "safe" },
  { event: event("event-b", relationB.id, relationB.userIdentityId, "B safe event"), promptVisibility: "safe" },
  { event: event("event-private", relationA.id, relationA.userIdentityId, "A private event"), promptVisibility: "private" },
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
type ChatRequest = Parameters<typeof apiChat>[0];

const baseRequest: ChatRequest = { message: "existing message", history: [], systemInstruction: "Existing Moment prompt", apiKey: "", model: "test" };

const captureRequest = async (request: ChatRequest) => {
  capturedRequests.push(request);
  return { text: "A safe moment reply" };
};
const capturedRequests: ChatRequest[] = [];

await requestCharacterMoment({
  requestAi: captureRequest,
  request: baseRequest,
  character,
  ownerIdentityId: relationA.userIdentityId,
  relationId: relationA.id,
  parseContent: (content) => ({ content, selfComments: [] }),
  occurredAt: () => 30,
  random: () => 0.1,
  cognitiveContext: contextA,
});
await requestAutomaticMomentComment({
  requestAi: captureRequest,
  request: baseRequest,
  character,
  cleanText: (content) => content,
  now: () => 40,
  random: () => 0.2,
  cognitiveContext: contextA,
});
await requestMomentCommentReply({
  requestAi: captureRequest,
  request: baseRequest,
  character,
  userName: "User",
  cleanText: (content) => content,
  now: () => 50,
  random: () => 0.3,
  cognitiveContext: contextA,
});

assert.equal(capturedRequests.length, 3, "post, comment, and reply should all consume the adapter projection");
for (const request of capturedRequests) {
  const prompt = request.systemInstruction || "";
  assert.match(prompt, /PUBLIC-SAFE MOMENT COGNITIVE CONTEXT/);
  assert.match(prompt, /A safe event/);
  assert.equal(prompt.includes("B safe event"), false);
  assert.equal(prompt.includes("A private event"), false);
  assert.equal(prompt.includes("A private chat memory"), false);
  assert.equal(prompt.includes(relationA.id), false);
  assert.equal(prompt.includes(relationB.id), false);
  assert.equal(prompt.includes(relationA.userIdentityId), false);
  assert.equal(prompt.includes(relationB.userIdentityId), false);
}

const contextBRequests: ChatRequest[] = [];
await requestAutomaticMomentComment({
  requestAi: async (request) => {
    contextBRequests.push(request);
    return { text: "A safe moment reply" };
  },
  request: baseRequest,
  character,
  cleanText: (content) => content,
  cognitiveContext: contextB,
});
assert.match(contextBRequests[0].systemInstruction || "", /B safe event/);
assert.equal((contextBRequests[0].systemInstruction || "").includes("A safe event"), false);

const legacyRequests: ChatRequest[] = [];
await requestAutomaticMomentComment({
  requestAi: async (request) => {
    legacyRequests.push(request);
    return { text: "Legacy flow" };
  },
  request: baseRequest,
  character,
  cleanText: (content) => content,
});
assert.equal(legacyRequests[0], baseRequest, "a missing cognitive context must retain the original request object");

console.log("PASS Moment prompt adapter integration, scope isolation, private-event exclusion, identifier redaction, and legacy fallback");
