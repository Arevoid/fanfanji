import assert from "node:assert/strict";
import { buildCharacterCognitiveContext } from "../src/domain/characterCognitive/contextBuilder";
import type { CharacterCognitiveEventCandidate } from "../src/domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { buildChatPromptContext } from "../src/features/characterCognitive/promptAdapters/chatPromptAdapter";
import { buildMomentPromptContext } from "../src/features/characterCognitive/promptAdapters/momentPromptAdapter";
import { buildProactivePromptContext } from "../src/features/characterCognitive/promptAdapters/proactivePromptAdapter";
import type { Character, MemoryItem } from "../src/types";

const character: Character = {
  id: "character-shared",
  name: "阿岚",
  avatar: "avatar.png",
  personality: "克制温和",
  backstory: "测试角色背景",
};
const relationA = createRelationship({ id: "relation-a", characterId: character.id, userIdentityId: "identity-a", now: 1 });
const relationB = createRelationship({ id: "relation-b", characterId: character.id, userIdentityId: "identity-b", now: 2 });
const memories: MemoryItem[] = [
  { id: "memory-a", characterId: character.id, relationId: relationA.id, content: "仅 A 关系可见的聊天事实", timestamp: 3, importance: 8 },
  { id: "memory-b", characterId: character.id, relationId: relationB.id, content: "仅 B 关系可见的聊天事实", timestamp: 4, importance: 9 },
];
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
  { event: event("event-a", relationA.id, relationA.userIdentityId, "A 的安全事件"), promptVisibility: "safe" },
  { event: event("event-b", relationB.id, relationB.userIdentityId, "B 的安全事件"), promptVisibility: "safe" },
  { event: event("event-private", relationA.id, relationA.userIdentityId, "不应公开的私密事件"), promptVisibility: "private" },
];

const buildContext = (relation: typeof relationA) => buildCharacterCognitiveContext({
  character,
  relation,
  memories,
  events,
  timeContext: { now: 12, date: "2026-08-01", time: "20:00", timezone: "UTC+8" },
  knowledgeBoundary: { known: ["当前关系的明确事实"], unknown: ["其他身份"], forbidden: ["虚构共同场景"] },
  behaviorConstraints: [{ id: "no-invented-scenes", description: "不得虚构共同场景" }],
});

const contextA = buildContext(relationA);
const contextB = buildContext(relationB);
const chatA = buildChatPromptContext(contextA);
const chatB = buildChatPromptContext(contextB);
const momentA = buildMomentPromptContext(contextA);
const proactiveA = buildProactivePromptContext(contextA);

assert.deepEqual(chatA.relevantMemories, [{ content: "仅 A 关系可见的聊天事实", importance: 8 }]);
assert.deepEqual(chatA.safeEvents.map((item) => item.summary), ["A 的安全事件"]);
assert.equal(JSON.stringify(chatA).includes("不应公开的私密事件"), false);
assert.equal(JSON.stringify(chatA).includes("仅 B 关系可见的聊天事实"), false);
assert.equal(JSON.stringify(chatB).includes("仅 A 关系可见的聊天事实"), false);
assert.equal(JSON.stringify(chatB).includes("A 的安全事件"), false);

assert.deepEqual(momentA.publicFacts, [], "unclassified Memory must never become a public Moment fact");
assert.deepEqual(momentA.publicEvents.map((item) => item.summary), ["A 的安全事件"]);
assert.equal(JSON.stringify(momentA).includes("仅 A 关系可见的聊天事实"), false);
assert.equal(JSON.stringify(momentA).includes("不应公开的私密事件"), false);
assert.deepEqual(momentA.behaviorConstraints, [{ description: "不得虚构共同场景" }]);

assert.deepEqual(proactiveA.recentMeaningfulEvents.map((item) => item.summary), ["A 的安全事件"]);
assert.deepEqual(proactiveA.openContext, []);

for (const output of [chatA, chatB, momentA, proactiveA]) {
  const serialized = JSON.stringify(output);
  assert.equal(serialized.includes(relationA.id), false, "relationId must not reach an adapter output");
  assert.equal(serialized.includes(relationB.id), false, "relationId must not reach an adapter output");
  assert.equal(serialized.includes(relationA.userIdentityId), false, "userIdentityId must not reach an adapter output");
  assert.equal(serialized.includes(relationB.userIdentityId), false, "userIdentityId must not reach an adapter output");
  assert.equal(serialized.includes(character.id), false, "character storage ID must not reach an adapter output");
}

console.log("PASS cognitive prompt adapters scope information, public safety, and identifier redaction");
