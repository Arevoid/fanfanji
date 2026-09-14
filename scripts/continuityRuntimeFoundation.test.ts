import assert from "node:assert/strict";
import { createHandoffCapsule } from "../src/domain/continuity/handoffCapsule";
import { buildCrossAppContext, canExposeVisibility } from "../src/domain/continuity/contextGateway";
import { defaultSceneForApp, transitionScene } from "../src/domain/continuity/sceneRuntime";
import { applyTopicRuntimeTransition, createTopicRuntimeState } from "../src/domain/continuity/topicRuntime";
import { applyEmotionDelta, createEmotionState, decayEmotion } from "../src/domain/continuity/emotionRuntime";
import { createBeliefRecord, listBeliefsForScope, upsertBelief } from "../src/domain/continuity/beliefRuntime";
import { closeOpenLoop, createOpenLoop, listOpenLoops, upsertOpenLoop } from "../src/domain/continuity/openLoopRuntime";
import { applyRelationshipGrowthEvent, createRelationshipDimensions } from "../src/domain/characterLife/relationshipGrowth";
import { projectRelationshipState } from "../src/domain/characterLife/relationshipProjection";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import { buildInnerVoiceContext } from "../src/domain/continuity/innerVoiceContract";
import type { RelationshipState } from "../src/domain/characterLife/relationshipStateTypes";

const scope = { characterId: "character-a", relationId: "relation-a", userIdentityId: "identity-a", conversationId: "direct:relation-a" };
const otherScope = { characterId: "character-b", relationId: "relation-b", userIdentityId: "identity-b" };

const handoff = createHandoffCapsule({
  id: "handoff-1",
  scope,
  previousScene: "offline_story",
  exitTimestamp: 100,
  recentInteractionSummary: "一起吃午饭后回到线上。",
  recentInteractionRefs: ["m1", "m1"],
  unresolvedTopicRefs: ["topic-1"],
  recentMeaningfulEventRefs: ["event-1"],
  relationshipContinuityRef: "relationship:relation-a",
});
assert.ok(handoff);
assert.deepEqual(handoff.recentInteractionRefs, ["m1"]);
assert.equal("transcript" in handoff, false, "handoff must not copy a transcript");

assert.equal(defaultSceneForApp("chat"), "online_chat");
assert.equal(defaultSceneForApp("offline"), "offline_story");
assert.equal(transitionScene({ current: "online_chat", target: "offline_story", explicit: false }).to, "online_chat");
assert.equal(transitionScene({ current: "online_chat", target: "offline_story", explicit: true }).to, "offline_story");

let topic = createTopicRuntimeState(scope, 100);
topic = applyTopicRuntimeTransition(topic, { scope, mode: "shift", topic: "吃午饭", at: 100, relevantMessageRefs: ["m1"] });
topic = applyTopicRuntimeTransition(topic, { scope, mode: "shift", topic: "回到线上后的安排", at: 200, transitionReason: "offline_to_online", relevantMessageRefs: ["m2"] });
assert.equal(topic.activeTopic, "回到线上后的安排");
assert.equal(topic.topicHistory.length, 1);
assert.equal(applyTopicRuntimeTransition(topic, { scope: otherScope, mode: "shift", topic: "隔离", at: 300 }), topic, "topic state is scope isolated");
assert.equal(
  applyTopicRuntimeTransition(topic, {
    scope: { ...scope, conversationId: "direct:another" },
    mode: "shift",
    topic: "另一会话",
    at: 300,
  }),
  topic,
  "topic state is conversation isolated when a conversation ID is present",
);

let emotion = createEmotionState(scope, 100);
emotion = applyEmotionDelta(emotion, { scope, current: "开心", intensityDelta: 0.8, causeEventRefs: ["event-1"], at: 100 });
assert.equal(emotion.baseline, "neutral", "temporary emotion does not rewrite baseline");
assert.equal(decayEmotion(emotion, 100 + 60 * 60 * 1000).intensity, 0.65);

const belief = createBeliefRecord({ id: "belief-1", scope, subjectScope: "user", proposition: "用户喜欢午饭后散步", confidence: 0.7, supportingEventRefs: ["event-1"], updatedAt: 100 });
assert.ok(belief);
const beliefs = upsertBelief([], belief);
assert.equal(listBeliefsForScope(beliefs, scope).length, 1);
assert.equal(listBeliefsForScope(beliefs, otherScope).length, 0);

const loop = createOpenLoop({ id: "loop-1", scope, type: "promise", description: "稍后一起散步", createdAt: 100, sourceRefs: ["event-2"] });
assert.ok(loop);
const loops = upsertOpenLoop([], loop);
assert.equal(listOpenLoops(loops, scope).length, 1);
assert.equal(listOpenLoops(closeOpenLoop(loops, scope, "loop-1", "completed", 200), scope).length, 0);

const dimensions = applyRelationshipGrowthEvent(createRelationshipDimensions(), { kind: "conflict", status: "active", confidence: 1 });
assert.equal(dimensions.conflict, 0.15);
assert.ok(Math.abs(dimensions.security - 0.02) < 1e-9);
const repairedDimensions = applyRelationshipGrowthEvent(dimensions, { kind: "repair", status: "active", confidence: 1 });
assert.ok(repairedDimensions.conflict < dimensions.conflict);

const relationship: RelationshipState = {
  relationId: scope.relationId,
  characterId: scope.characterId,
  userIdentityId: scope.userIdentityId,
  stage: "friend",
  tone: "warm",
  openLoops: [],
  boundaries: [],
  updatedAt: 100,
  version: 1,
};
const conflictEvent: CharacterEvent = {
  id: "conflict-event",
  relationId: scope.relationId,
  characterId: scope.characterId,
  userIdentityId: scope.userIdentityId,
  kind: "conflict",
  summary: "冲突",
  source: "explicit",
  occurredAt: 120,
  recordedAt: 120,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
};
const projectedOnce = projectRelationshipState(undefined, conflictEvent);
const projectedTwice = projectRelationshipState(projectedOnce, conflictEvent);
assert.equal(projectedTwice, projectedOnce, "relationship projection ignores a replayed event ID");
const context = buildCrossAppContext({
  app: "chat",
  scope,
  scene: "online_chat",
  topic,
  emotion,
  beliefs: [belief, { ...belief, id: "foreign", scope: otherScope }],
  relationship,
  openLoops: loops,
  handoff,
});
assert.equal(context.beliefs.length, 1);
assert.equal(context.openLoops.length, 1);
assert.equal(buildCrossAppContext({ app: "chat", scope, handoff: { ...handoff, scope: otherScope } }).handoff, undefined);
assert.equal(canExposeVisibility("PRIVATE_TO_USER", "character"), false);
assert.equal(canExposeVisibility("PRIVATE_TO_CHARACTER", "character"), true);

const innerVoice = buildInnerVoiceContext({ scope, topic, emotion, beliefs: [belief], relationship, openLoops: loops, relevantMemoryRefs: ["memory-1"] });
assert.equal(innerVoice.visibility, "character_private");
assert.deepEqual(innerVoice.relevantMemoryRefs, ["memory-1"]);
assert.equal(JSON.stringify(innerVoice).includes("transcript"), false);

// A JSON round-trip is the same shape used by the repository adapter and must
// preserve all bounded state without replaying events or changing scope.
const reloadedTopic = JSON.parse(JSON.stringify(topic)) as typeof topic;
assert.equal(reloadedTopic.activeTopic, topic.activeTopic);
assert.deepEqual(reloadedTopic.topicHistory, topic.topicHistory);
assert.deepEqual(reloadedTopic.scope, topic.scope);

console.log("PASS continuity runtime foundation: handoff, scene, topic, emotion, belief, relationship growth, open loops, gateway, privacy, and reload");
