import assert from "node:assert/strict";
import { getConversationSummaryLayer } from "../src/domain/characterKnowledge/conversationSummaryProjection";
import type { ConversationSummaryRecord } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { formatTruthRetrievalForPrompt, retrieveTruthForPrivatePrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";

const scope = { relationId: "relation-episode", characterId: "char-episode", userIdentityId: "identity-episode", conversationId: "direct:episode" };
const episode: ConversationSummaryRecord = {
  id: "episode-1",
  ...scope,
  layer: "episode",
  summary: "用户和角色在昨晚约定今天继续完成任务",
  sourceMessageIds: ["episode-message-1"],
  sourceClaimIds: [],
  generatedAt: 100,
  generator: "character-truth-extraction.v1",
  projectionVersion: 2,
  status: "active",
  schemaVersion: 1,
};

assert.equal(getConversationSummaryLayer(episode), "episode");
assert.equal(getConversationSummaryLayer({ ...episode, layer: undefined, generator: "memory-projection.conversation-summary.v1" }), "projection");
assert.equal(getConversationSummaryLayer({ ...episode, layer: undefined, generator: "legacy-memory.v1", sourceRecordId: "legacy-1" }), "legacy");

const result = retrieveTruthForPrivatePrompt({ scope, claims: [], summaries: [episode], corrections: [] });
const prompt = formatTruthRetrievalForPrompt(result);
assert.match(prompt, /Episode memory \/ 场景经历/);
assert.match(prompt, /昨晚约定今天继续完成任务/);
assert.doesNotMatch(prompt, /Conversation summary \/ 对话摘要/);

console.log("PASS episode summaries remain bounded scene memory and have a distinct prompt section");
