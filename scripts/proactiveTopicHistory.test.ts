import assert from "node:assert/strict";
import {
  appendProactiveTopic,
  createProactiveTopicRecord,
  getRecentProactiveTopics,
} from "../src/domain/characterLife/proactive/proactiveTopicHistory";
import {
  isDuplicateProactiveTopic,
  isProactiveTopicCoolingDown,
} from "../src/domain/characterLife/proactive/proactiveTopicPolicy";
import type { ProactiveTopicRecord } from "../src/domain/characterLife/proactive/proactiveTopicTypes";

const makeTopic = (
  characterId: string,
  relationId: string,
  topic: string,
  createdAt: number,
): ProactiveTopicRecord => {
  const record = createProactiveTopicRecord({
    topic,
    category: "care",
    createdAt,
    characterId,
    relationId,
  });
  assert.ok(record);
  return record;
};

const first = makeTopic("character-a", "relation-a1", "check in after work", 9_999);
const second = makeTopic("character-a", "relation-a1", "share a daily detail", 9_998);
const otherRelation = makeTopic("character-a", "relation-a2", "relation two only", 9_999);
const otherCharacter = makeTopic("character-b", "relation-b1", "check in after work", 9_999);
const history = [first, second, otherRelation, otherCharacter];

assert.equal(createProactiveTopicRecord({
  topic: "",
  category: "care",
  createdAt: 1,
  characterId: "character-a",
  relationId: "relation-a1",
}), undefined, "empty topics are rejected");
assert.equal(createProactiveTopicRecord({
  topic: "missing relation",
  category: "care",
  createdAt: 1,
  characterId: "character-a",
  relationId: "",
}), undefined, "relation scope is required");

const sourceHistory = [first];
const appended = appendProactiveTopic(sourceHistory, second);
assert.deepEqual(appended, [first, second]);
assert.deepEqual(sourceHistory, [first], "append does not mutate the input history");

assert.deepEqual(
  getRecentProactiveTopics(history, "character-a", "relation-a1", { now: 10_000 }),
  [first, second],
  "recent topics are newest first and scoped by character plus relation",
);
assert.deepEqual(
  getRecentProactiveTopics(history, "character-a", "relation-a1", { now: 10_000, limit: 1 }),
  [first],
);
assert.deepEqual(
  getRecentProactiveTopics(history, "character-a", "relation-a1", { now: 10_000, withinMs: 500 }),
  [first, second],
);

assert.equal(isDuplicateProactiveTopic("Check-in after work!", history, "character-a", "relation-a1", { now: 10_000 }), true);
assert.equal(isDuplicateProactiveTopic("relation two only", history, "character-a", "relation-a2", { now: 10_000 }), true);
assert.equal(isDuplicateProactiveTopic("relation two only", history, "character-a", "relation-a1", { now: 10_000 }), false);
assert.equal(isDuplicateProactiveTopic("check in after work", history, "character-a", "relation-missing", { now: 10_000 }), false);
assert.equal(isDuplicateProactiveTopic("check in after work", history, "character-b", "relation-b1", { now: 10_000 }), true);
assert.equal(isDuplicateProactiveTopic("check in after work", history, "character-a", "relation-b1", { now: 10_000 }), false);

assert.equal(isProactiveTopicCoolingDown("share a daily detail", history, "character-a", "relation-a1", { now: 10_000 }), true);
assert.equal(isProactiveTopicCoolingDown("share a daily detail", history, "character-a", "relation-a1", { now: 10_000, cooldownMs: 500 }), true);
assert.equal(isProactiveTopicCoolingDown("check in after work", history, "character-a", "relation-a1", { now: 10_000, cooldownMs: 0 }), false);

assert.deepEqual(getRecentProactiveTopics([], "character-a", "relation-a1", { now: 10_000 }), []);
assert.equal(isDuplicateProactiveTopic("anything", [], "character-a", "relation-a1", { now: 10_000 }), false);
assert.equal(isProactiveTopicCoolingDown("anything", [], "character-a", "relation-a1", { now: 10_000 }), false);

console.log("PASS Proactive topic recording, recent query, duplicate/cooldown detection, relation and character isolation, and empty-history compatibility");
