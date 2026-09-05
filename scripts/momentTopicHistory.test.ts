import assert from "node:assert/strict";
import {
  appendMomentTopic,
  createMomentTopicRecord,
  findMomentTopic,
  getRecentMomentTopics,
} from "../src/domain/moments/momentGeneration/momentTopicHistory";
import {
  calculateMomentTopicSimilarity,
  evaluateMomentTopic,
  isDuplicateMomentTopic,
  isMomentTopicCoolingDown,
  isSimilarMomentTopic,
} from "../src/domain/moments/momentGeneration/momentTopicPolicy";
import type { MomentTopicRecord } from "../src/domain/moments/momentGeneration/momentTopicTypes";

const makeTopic = (input: Partial<MomentTopicRecord> & Pick<MomentTopicRecord, "topic" | "generatedAt" | "momentId" | "characterId">): MomentTopicRecord => ({
  category: "daily_life",
  scope: "character-public",
  ...input,
});

const recordA = createMomentTopicRecord({
  topic: "下班后的咖啡",
  category: "daily_life",
  generatedAt: 1_000,
  momentId: "moment-a-1",
  characterId: "character-a",
});
assert.ok(recordA);
assert.equal(recordA.scope, "character-public");
assert.equal(createMomentTopicRecord({
  topic: " ",
  category: "daily_life",
  generatedAt: 1_000,
  momentId: "moment-empty",
  characterId: "character-a",
}), undefined);

const history = [
  recordA,
  makeTopic({ topic: "周末看展", generatedAt: 3_000, momentId: "moment-a-2", characterId: "character-a", category: "hobby" }),
  makeTopic({ topic: "朋友聚餐", generatedAt: 2_000, momentId: "moment-b-1", characterId: "character-b", category: "social" }),
  makeTopic({ topic: "内部主题", generatedAt: 4_000, momentId: "moment-a-private", characterId: "character-a", scope: "character-public" }),
];
const appended = appendMomentTopic(history, makeTopic({ topic: "夜间散步", generatedAt: 5_000, momentId: "moment-a-3", characterId: "character-a" }));
assert.equal(appended.length, history.length + 1);
assert.equal(history.length, 4, "append keeps the source history immutable");

const recentA = getRecentMomentTopics(appended, "character-a", { now: 5_000, limit: 2 });
assert.deepEqual(recentA.map((record) => record.topic), ["夜间散步", "内部主题"]);
assert.deepEqual(getRecentMomentTopics(appended, "character-b", { now: 5_000 }).map((record) => record.topic), ["朋友聚餐"]);
assert.equal(getRecentMomentTopics(appended, "character-a", { now: 5_000, withinMs: 500 }).length, 1);
assert.equal(getRecentMomentTopics([], "character-a").length, 0);

assert.equal(findMomentTopic(" 下班后的咖啡！ ", appended, "character-a", { now: 5_000 })?.momentId, "moment-a-1");
assert.equal(findMomentTopic("朋友聚餐", appended, "character-a", { now: 5_000 }), undefined);
assert.equal(isDuplicateMomentTopic("下班后的咖啡", appended, "character-a", { now: 5_000, duplicateWindowMs: 10_000 }), true);
assert.equal(isDuplicateMomentTopic("朋友聚餐", appended, "character-a", { now: 5_000, duplicateWindowMs: 10_000 }), false);
assert.equal(isMomentTopicCoolingDown("下班后的咖啡", appended, "character-a", { now: 5_000, cooldownMs: 5_000 }), true);
assert.equal(isMomentTopicCoolingDown("下班后的咖啡", appended, "character-a", { now: 5_000, cooldownMs: 1_000 }), false);

assert.ok(calculateMomentTopicSimilarity("周末去看展", "周末看展") >= 0.72);
assert.equal(isSimilarMomentTopic("周末去看展", appended, "character-a", { now: 5_000, similarThreshold: 0.72 }), true);
assert.equal(isSimilarMomentTopic("朋友聚餐", appended, "character-a", { now: 5_000 }), false);

assert.deepEqual(
  evaluateMomentTopic("下班后的咖啡", appended, "character-a", { now: 5_000, cooldownMs: 5_000 }),
  { avoid: true, reason: "cooldown", matchedTopic: recordA },
);
assert.equal(evaluateMomentTopic("朋友聚餐", appended, "character-a", { now: 5_000 }).avoid, false);

console.log("PASS Moment topic recording, recent query, duplicate/similar detection, cooldown, character isolation, and empty-history compatibility");
