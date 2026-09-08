import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCharacterCognitiveContext } from "../src/domain/characterCognitive/contextBuilder";
import type { CharacterCognitiveEventCandidate } from "../src/domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { buildChatPromptContext, formatChatPromptContext } from "../src/features/characterCognitive/promptAdapters/chatPromptAdapter";
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
  { id: "memory-a", characterId: character.id, relationId: relationA.id, content: "A 的检索命中记忆", timestamp: 3 },
  { id: "memory-b", characterId: character.id, relationId: relationB.id, content: "B 的检索命中记忆", timestamp: 4 },
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
  { event: event("event-private", relationA.id, relationA.userIdentityId, "私密事件"), promptVisibility: "private" },
];
const buildContext = (relation: typeof relationA) => buildCharacterCognitiveContext({
  character,
  relation,
  memories,
  events,
  timeContext: { now: 12, date: "2026-08-01", time: "20:00" },
  knowledgeBoundary: { known: [], unknown: ["其他身份事实"], forbidden: ["虚构共同场景"] },
});

const contextA = buildContext(relationA);
const contextB = buildContext(relationB);
const promptContextA = buildChatPromptContext(contextA, { relevantMemoryIds: ["memory-a"] });
const promptContextB = buildChatPromptContext(contextB, { relevantMemoryIds: ["memory-b"] });
const promptA = formatChatPromptContext(promptContextA);
const promptB = formatChatPromptContext(promptContextB);

assert.match(promptA, /A 的检索命中记忆/);
assert.match(promptA, /A 的安全事件/);
assert.doesNotMatch(promptA, /B 的检索命中记忆|B 的安全事件|私密事件/);
assert.match(promptB, /B 的检索命中记忆/);
assert.doesNotMatch(promptB, /A 的检索命中记忆|A 的安全事件/);
assert.equal(formatChatPromptContext(undefined), "", "legacy replies remain valid when no cognitive context is available");

for (const prompt of [promptA, promptB]) {
  assert.equal(prompt.includes(relationA.id), false, "relationId must not enter the prompt supplement");
  assert.equal(prompt.includes(relationB.id), false, "relationId must not enter the prompt supplement");
  assert.equal(prompt.includes(relationA.userIdentityId), false, "userIdentityId must not enter the prompt supplement");
  assert.equal(prompt.includes(relationB.userIdentityId), false, "userIdentityId must not enter the prompt supplement");
}

const appChatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(appChatSource, /buildChatPromptContext\(cognitiveContext/);
assert.match(appChatSource, /formatChatPromptContext\(chatPromptContext\)/);
assert.match(appChatSource, /assembledInstructions\.push\(cognitivePromptBlock\)/);

console.log("PASS chat prompt adapter integration, scope isolation, private-event exclusion, and legacy fallback");
