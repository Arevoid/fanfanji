import { strict as assert } from "node:assert";
import type { Character, MemoryItem, Message } from "../src/types";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import type { KnowledgeClaim, ConversationSummaryRecord } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { memoryRecordFromKnowledgeClaim, isMemoryRecordVisibleToRelation } from "../src/domain/memory/memoryModel";
import { retrieveTruthForPrivatePrompt, formatTruthRetrievalForPrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";
import {
  acknowledgeOfflineHandoff,
  buildPendingOfflineHandoffPromptBlock,
  createPendingOfflineHandoff,
  getOfflineMemorySourceMessages,
  recordOfflineHandoffDelivery,
  sanitizeOfflineMemoryForOnlineUse,
} from "../src/domain/memory/offlineMemorySync";
import { buildCharacterCognitiveContext } from "../src/domain/characterCognitive/contextBuilder";
import { buildDiaryPromptContext, formatDiaryPromptContext } from "../src/features/characterCognitive/promptAdapters/diaryPromptAdapter";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { buildRelationshipTimeline } from "../src/domain/characterLife/relationshipTimelineQuery";

const scope = {
  characterId: "character-a",
  relationId: "relation-a",
  userIdentityId: "identity-a",
  conversationId: "conversation-a",
};

const claim: KnowledgeClaim = {
  id: "claim-a",
  ...scope,
  kind: "fact",
  subject: "relationship",
  statement: "用户已经确认周末见面。",
  truthStatus: "confirmed",
  temporalStatus: "past",
  source: { kind: "user_message", authorship: "user", messageIds: ["message-a"], producer: "test", evidenceKey: "message-a" },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 10,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
};

const summary: ConversationSummaryRecord = {
  id: "summary-a",
  ...scope,
  summary: "双方周末见面的派生摘要。",
  sourceMessageIds: ["message-a"],
  sourceClaimIds: [claim.id],
  generatedAt: 11,
  generator: "test",
  projectionVersion: 1,
  status: "active",
  schemaVersion: 1,
};

// Canonical Memory vocabulary retains exact relation/identity scope. A record
// from another relation must never be visible through a direct relation read.
const canonical = memoryRecordFromKnowledgeClaim(claim);
assert.equal(isMemoryRecordVisibleToRelation(canonical, scope), true);
assert.equal(isMemoryRecordVisibleToRelation(canonical, { ...scope, relationId: "relation-b" }), false);
assert.equal(isMemoryRecordVisibleToRelation(canonical, { ...scope, userIdentityId: "identity-b" }), false);

// Truth is authoritative and a summary is only a rebuildable projection. Once
// its source claim is selected, the duplicate summary is suppressed.
const truth = retrieveTruthForPrivatePrompt({
  scope,
  claims: [claim],
  summaries: [summary],
  corrections: [],
  queryText: "周末",
  limit: 5,
});
assert.equal(truth.projection.confirmedFacts.length, 1);
assert.equal(truth.summaries.length, 0);
assert.match(formatTruthRetrievalForPrompt(truth), /用户已经确认周末见面/);
assert.doesNotMatch(formatTruthRetrievalForPrompt(truth), /派生摘要/);

const character: Character = {
  id: scope.characterId,
  name: "角色 A",
  avatar: "",
  personality: "克制",
  backstory: "关系角色",
};
const relation = createRelationship({ id: scope.relationId, characterId: scope.characterId, userIdentityId: scope.userIdentityId, now: 1 });
const event: CharacterEvent = {
  id: "event-a",
  ...scope,
  kind: "relationship_created",
  summary: "关系已建立",
  source: "relationship",
  occurredAt: 1,
  recordedAt: 1,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
};
const cognitive = buildCharacterCognitiveContext({
  character,
  relation,
  memories: [{ id: "private-memory", characterId: scope.characterId, relationId: scope.relationId, content: "绝不应进入 Diary 的私有 Memory", timestamp: 2 } as MemoryItem],
  events: [{ event, promptVisibility: "safe" }],
  timeContext: { now: 2 },
  knowledgeBoundary: { known: [], unknown: [] },
  relationshipTimeline: buildRelationshipTimeline({ ...scope, events: [event], generatedAt: 2 }),
});
const diaryContext = buildDiaryPromptContext(cognitive);
assert.equal("relevantMemories" in diaryContext, false, "Diary projection must not expose private Memory");
assert.doesNotMatch(formatDiaryPromptContext(diaryContext), /绝不应进入/);

const message = (id: string, sender: Message["sender"], content: string, timestamp: number): Message => ({
  id,
  characterId: scope.characterId,
  sender,
  content,
  timestamp,
});
const story = {
  id: "story-a",
  title: "线下片段",
  characterId: scope.characterId,
  relationId: scope.relationId,
  conversationId: scope.conversationId,
  mode: "continue" as const,
  createdAt: 10,
  updatedAt: 20,
  messages: [
    { ...message("imported", "user", "导入上下文", 10), isImportedContext: true },
    { ...message("narration", "character", "旁白", 11), isNarration: true },
    message("user-source", "user", "我们真的吃了饭", 12),
    message("character-source", "character", "我记得", 13),
  ],
};
const sourceMessages = getOfflineMemorySourceMessages(story);
assert.deepEqual(sourceMessages.map((item) => item.id), ["user-source", "character-source"]);
const pending = createPendingOfflineHandoff({ story, sourceMessages, now: 30 });
assert.equal(pending.onlineHandoff?.status, "pending");
const pendingPrompt = buildPendingOfflineHandoffPromptBlock({
  story: pending,
  characterName: character.name,
  userName: "用户",
  currentOnlineAt: 31,
});
assert.match(pendingPrompt, /线下亲历记录/);
assert.match(pendingPrompt, /我们真的吃了饭/);
const stillPending = recordOfflineHandoffDelivery(pending, 32, 1, false);
assert.equal(stillPending.onlineHandoff?.status, "pending", "raw handoff survives before durable summary");
const acknowledged = recordOfflineHandoffDelivery(stillPending, 33, 1, true);
assert.equal(acknowledged.onlineHandoff?.status, "acknowledged");
assert.equal(acknowledgeOfflineHandoff(acknowledged), acknowledged, "acknowledgement remains idempotent");

const sanitized = sanitizeOfflineMemoryForOnlineUse("【线下剧本《线下片段》线上交接】\n[offline-story:story-a:summary]\n- 用户与角色曾吃饭\n- 角色: 私密演出对白");
assert.match(sanitized, /用户与角色曾吃饭/);
assert.doesNotMatch(sanitized, /私密演出对白/);
assert.match(sanitized, /\[offline-story:story-a:summary\]/, "the marker is retained for deterministic replacement, not treated as a fact");

console.log("PASS Memory System V2 characterization: canonical scope, Truth/Summary authority, Diary isolation, and offline handoff continuity");
