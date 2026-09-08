import assert from "node:assert/strict";
import { createProactiveTopicRecord } from "../src/domain/characterLife/proactive/proactiveTopicHistory";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { buildProactiveCognitiveContext } from "../src/features/chat/services/proactiveCognitiveContext";
import {
  buildProactivePromptContext,
  formatProactivePromptContext,
} from "../src/features/characterCognitive/promptAdapters/proactivePromptAdapter";
import type { Character } from "../src/types";

const characterA: Character = {
  id: "proactive-topic-character-a",
  name: "Proactive Character A",
  avatar: "a.png",
  personality: "calm",
  backstory: "topic context A",
};
const relationA = createRelationship({
  id: "proactive-topic-relation-a",
  characterId: characterA.id,
  userIdentityId: "proactive-topic-identity-a",
  now: 1,
});
const relationB = createRelationship({
  id: "proactive-topic-relation-b",
  characterId: characterA.id,
  userIdentityId: "proactive-topic-identity-b",
  now: 2,
});

const makeTopic = (characterId: string, relationId: string, topic: string, createdAt: number, category: "care" | "daily_share" = "care") => {
  const record = createProactiveTopicRecord({ characterId, relationId, topic, createdAt, category });
  assert.ok(record);
  return record;
};

const topicHistory = [
  makeTopic(characterA.id, relationA.id, "check-in after work", 9_999),
  makeTopic(characterA.id, relationA.id, "check-in after work", 9_998),
  makeTopic(characterA.id, relationA.id, "share a daily detail", 9_997, "daily_share"),
  makeTopic(characterA.id, relationB.id, "relation B private topic", 9_999),
  makeTopic("other-character", relationA.id, "other character topic", 9_999),
];
const occurredAt = 10_000;
const contextA = buildProactiveCognitiveContext({
  character: characterA,
  relationship: relationA,
  memories: [],
  events: [],
  occurredAt,
  topicHistory,
});
assert.ok(contextA);
assert.deepEqual(contextA.topicContext?.recentTopics, ["check-in after work", "share a daily detail"]);
assert.deepEqual(contextA.topicContext?.repeatedTopics, ["check-in after work"]);
assert.deepEqual(contextA.topicContext?.cooldownTopics, ["check-in after work", "share a daily detail"]);

const prompt = formatProactivePromptContext(buildProactivePromptContext(contextA));
assert.match(prompt, /Topic diversity guidance/);
assert.match(prompt, /check-in after work/);
assert.match(prompt, /share a daily detail/);
assert.match(prompt, /hints only; not facts or hard bans/);
assert.match(prompt, /do not block, reschedule, or suppress/);
for (const forbidden of [
  characterA.id,
  relationA.id,
  relationB.id,
  relationA.userIdentityId,
  relationB.userIdentityId,
  "relation B private topic",
  "other character topic",
]) {
  assert.equal(prompt.includes(forbidden), false, `${forbidden} must not enter proactive prompt output`);
}

const contextB = buildProactiveCognitiveContext({
  character: characterA,
  relationship: relationB,
  memories: [],
  events: [],
  occurredAt,
  topicHistory,
});
assert.ok(contextB);
assert.deepEqual(contextB.topicContext?.recentTopics, ["relation B private topic"]);
assert.equal(contextB.topicContext?.recentTopics.includes("check-in after work"), false);

const legacyContext = buildProactiveCognitiveContext({
  character: characterA,
  relationship: relationA,
  memories: [],
  events: [],
  occurredAt,
});
assert.ok(legacyContext);
assert.equal(legacyContext.topicContext, undefined);
const legacyPrompt = formatProactivePromptContext(buildProactivePromptContext(legacyContext));
assert.doesNotMatch(legacyPrompt, /Topic diversity guidance/);

console.log("PASS proactive topic history flows through cognitive context and prompt adapter with relation/character isolation and legacy compatibility");
