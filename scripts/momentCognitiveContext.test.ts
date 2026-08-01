import assert from "node:assert/strict";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { requestAutomaticMomentComment } from "../src/features/moments/services/momentCommentService";
import { buildMomentCognitiveContext } from "../src/features/moments/services/momentCognitiveContext";
import { requestCharacterMoment } from "../src/features/moments/services/momentGenerator";
import { requestMomentCommentReply } from "../src/features/moments/services/momentReplyService";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import type { Character, MemoryItem } from "../src/types";

const character: Character = {
  id: "character-1",
  name: "阿岚",
  avatar: "avatar.png",
  personality: "克制而温和",
  backstory: "测试角色",
};
const relationA = createRelationship({
  id: "relation-a",
  characterId: character.id,
  userIdentityId: "identity-a",
  now: 1,
});
const relationB = createRelationship({
  id: "relation-b",
  characterId: character.id,
  userIdentityId: "identity-b",
  now: 1,
});
const memories: MemoryItem[] = [
  { id: "memory-a", characterId: character.id, relationId: relationA.id, content: "A 身份的共同经历", timestamp: 1 },
  { id: "memory-b", characterId: character.id, relationId: relationB.id, content: "B 身份的共同经历", timestamp: 2 },
];
const event = (id: string, relationId: string, userIdentityId: string, kind = "relationship_created"): CharacterEvent => ({
  id,
  relationId,
  characterId: character.id,
  userIdentityId,
  kind,
  summary: `${id} summary`,
  source: "test",
  occurredAt: 1,
  recordedAt: 1,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
});
const events = [
  event("event-a", relationA.id, relationA.userIdentityId),
  event("event-b", relationB.id, relationB.userIdentityId),
  event("event-private", relationA.id, relationA.userIdentityId, "unreviewed"),
];

const contextA = buildMomentCognitiveContext({
  character,
  relationship: relationA,
  memories,
  events,
  occurredAt: 10,
});
const contextB = buildMomentCognitiveContext({
  character,
  relationship: relationB,
  memories,
  events,
  occurredAt: 20,
});

assert.equal(contextA.scope.relationId, relationA.id);
assert.equal(contextA.scope.userIdentityId, relationA.userIdentityId);
assert.deepEqual(contextA.knownFacts.map((fact) => fact.id), ["memory-a"]);
assert.deepEqual(contextA.recentEvents.map((item) => item.id), ["event-a"]);
assert.equal(contextA.knownFacts.some((fact) => fact.id === "memory-b"), false);
assert.equal(contextA.recentEvents.some((item) => item.id === "event-b"), false);
assert.equal(contextA.recentEvents.some((item) => item.id === "event-private"), false);
assert.equal(contextA.temporalContext.now, 10);

assert.equal(contextB.scope.relationId, relationB.id);
assert.equal(contextB.scope.userIdentityId, relationB.userIdentityId);
assert.deepEqual(contextB.knownFacts.map((fact) => fact.id), ["memory-b"]);
assert.deepEqual(contextB.recentEvents.map((item) => item.id), ["event-b"]);
assert.equal(contextB.knownFacts.some((fact) => fact.id === "memory-a"), false);
assert.equal(contextB.recentEvents.some((item) => item.id === "event-a"), false);

const request = { message: "m", history: [], systemInstruction: "s", apiKey: "", model: "test" };
const requestAi = async () => ({ text: "一条原有流程可接受的动态" });
const post = await requestCharacterMoment({
  requestAi,
  request,
  character,
  ownerIdentityId: relationA.userIdentityId,
  relationId: relationA.id,
  parseContent: (content) => ({ content, selfComments: [] }),
  occurredAt: () => 30,
  random: () => 0.1,
  cognitiveContext: contextA,
});
assert.equal(post.moment?.content, "一条原有流程可接受的动态");
assert.equal(post.moment?.relationId, relationA.id);

const comment = await requestAutomaticMomentComment({
  requestAi,
  request,
  character,
  cleanText: (content) => content,
  now: () => 40,
  random: () => 0.2,
  cognitiveContext: contextA,
});
assert.equal(comment?.content, "一条原有流程可接受的动态");

const reply = await requestMomentCommentReply({
  requestAi,
  request,
  character,
  userName: "机主",
  cleanText: (content) => content,
  now: () => 50,
  random: () => 0.3,
  cognitiveContext: contextA,
});
assert.equal(reply?.content, "回复机主：一条原有流程可接受的动态");

console.log("PASS Moment cognitive context construction, relation isolation, event visibility, and legacy generation compatibility");
