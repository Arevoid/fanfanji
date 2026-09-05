import assert from "node:assert/strict";
import { buildMomentPublicCognitiveContext } from "../src/domain/momentCognitive/momentPublicContextBuilder";
import { canExposeToMomentPublicContext } from "../src/domain/momentCognitive/momentPublicVisibilityPolicy";
import type { Character } from "../src/types";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";

const characterA: Character = {
  id: "character-a-internal",
  name: "公开角色 A",
  avatar: "a.png",
  personality: "安静观察",
  backstory: "公开背景 A",
};
const characterB: Character = {
  id: "character-b-internal",
  name: "公开角色 B",
  avatar: "b.png",
  personality: "外向直接",
  backstory: "公开背景 B",
};

const event = (characterId: string, summary: string, relationId = "relation-private"): CharacterEvent => ({
  id: `${characterId}-${summary}`,
  relationId,
  characterId,
  userIdentityId: "identity-private",
  kind: "offline_story_completed",
  summary,
  source: "offline-story",
  occurredAt: 10,
  recordedAt: 11,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
});
const shareAuthorization = (sourceEventId: string) => ({
  id: `share-${sourceEventId}`,
  sourceEventId,
  relationId: "relation-private",
  characterId: characterA.id,
  userIdentityId: "identity-private",
  scope: "moment" as const,
  status: "authorized" as const,
  createdAt: 12,
});
const authorizedEvent = event(characterA.id, "已授权公开经历");

assert.equal(canExposeToMomentPublicContext(undefined), false);
assert.equal(canExposeToMomentPublicContext({}), false);
assert.equal(canExposeToMomentPublicContext({ visibility: "relationship" }), false);
assert.equal(canExposeToMomentPublicContext({ visibility: "private" }), false);
assert.equal(canExposeToMomentPublicContext({ visibility: "public" }), true);
assert.equal(
  canExposeToMomentPublicContext({ visibility: "public", isRelationshipScoped: true }),
  false,
  "relationship-derived facts require explicit public authorization",
);
assert.equal(
  canExposeToMomentPublicContext(
    { visibility: "public", isRelationshipScoped: true, authorization: shareAuthorization("event-a") },
    { sourceEventId: "event-a", relationId: "relation-private", characterId: characterA.id, userIdentityId: "identity-private", scope: "moment" },
  ),
  true,
);

const context = buildMomentPublicCognitiveContext({
  character: characterA,
  publicMomentHistory: [
    { characterId: characterA.id, visibility: "public", authorName: "公开角色 A", content: "A 的公开动态", timestamp: 1 },
    { characterId: characterB.id, visibility: "public", authorName: "公开角色 B", content: "B 的公开动态", timestamp: 2 },
    { characterId: characterA.id, authorName: "公开角色 A", content: "未知可见性的动态", timestamp: 3 },
  ],
  publicCommentHistory: [
    { characterId: characterA.id, visibility: "public", authorName: "访客", content: "公开评论", timestamp: 4 },
    { characterId: characterB.id, visibility: "public", authorName: "访客", content: "B 的公开评论", timestamp: 5 },
  ],
  publicFacts: [
    { characterId: characterA.id, visibility: "public", content: "公开事实" },
    { characterId: characterA.id, visibility: "public", isRelationshipScoped: true, content: "未授权共同经历" },
    { characterId: characterA.id, visibility: "public", isRelationshipScoped: true, sourceEventId: "fact-authorized", authorization: shareAuthorization("fact-authorized"), content: "已授权共同经历" },
  ],
  publicEvents: [
    { event: event(characterA.id, "公开事件"), visibility: "public" },
    { event: event(characterA.id, "私密事件"), visibility: "private" },
    { event: event(characterA.id, "关系事件"), visibility: "relationship" },
    { event: event(characterA.id, "未授权共同经历"), visibility: "public", isRelationshipScoped: true },
    { event: authorizedEvent, visibility: "public", isRelationshipScoped: true, authorization: shareAuthorization(authorizedEvent.id) },
    { event: event(characterB.id, "B 的公开事件"), visibility: "public" },
  ],
  publicBehaviorConstraints: [
    { visibility: "public", description: "只表达公开可验证内容" },
    { description: "未知约束" },
  ],
  currentTime: { now: 1_725_120_000_000, date: "2026-08-01", time: "20:00" },
});

assert.equal(context.publicCharacterProfile.name, characterA.name);
assert.deepEqual(context.publicMomentHistory.map((item) => item.content), ["A 的公开动态"]);
assert.deepEqual(context.publicCommentHistory.map((item) => item.content), ["公开评论"]);
assert.deepEqual(context.authorizedPublicFacts.map((item) => item.content), ["公开事实", "已授权共同经历"]);
assert.deepEqual(context.publicEvents.map((item) => item.summary), ["公开事件", "已授权公开经历"]);
assert.deepEqual(context.publicBehaviorConstraints.map((item) => item.description), ["只表达公开可验证内容"]);
assert.equal(context.currentTime.date, "2026-08-01");
assert.equal(context.currentTime.time, "20:00");

const serialized = JSON.stringify(context);
for (const forbidden of [
  characterA.id,
  characterB.id,
  "relation-private",
  "identity-private",
  "私密事件",
  "关系事件",
  "未授权共同经历",
  "B 的公开动态",
  "B 的公开事件",
]) {
  assert.equal(serialized.includes(forbidden), false, `Moment public context must not expose ${forbidden}`);
}

const empty = buildMomentPublicCognitiveContext({
  character: characterA,
  currentTime: { now: 1_725_120_000_000 },
});
assert.deepEqual(empty.publicMomentHistory, []);
assert.deepEqual(empty.publicCommentHistory, []);
assert.deepEqual(empty.authorizedPublicFacts, []);
assert.deepEqual(empty.publicEvents, []);
assert.deepEqual(empty.publicBehaviorConstraints, []);

console.log("PASS Moment public cognitive context isolation, explicit authorization, deny-by-default, and empty compatibility");
