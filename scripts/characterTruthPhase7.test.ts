import assert from "node:assert/strict";
import { countTruthRetrievalRecords, explainTruthProjection, formatTruthRetrievalForPrompt, retrieveTruthForPrivatePrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";
import type { BehaviorCorrectionRecord, ConversationSummaryRecord, KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";

const scope = { relationId: "relation-phase7", characterId: "character-phase7", userIdentityId: "identity-phase7", conversationId: "direct:phase7" };

const claim = (overrides: Partial<KnowledgeClaim>): KnowledgeClaim => ({
  ...scope,
  id: "claim-default",
  kind: "fact",
  subject: "user",
  statement: "用户明确说过这件事",
  truthStatus: "asserted",
  temporalStatus: "present",
  source: {
    kind: "user_message",
    authorship: "user",
    messageIds: ["message-default"],
    producer: "phase7-test",
    evidenceKey: "claim-default",
  },
  confidence: 0.85,
  userConfirmed: false,
  recordedAt: 100,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
  ...overrides,
});

const futureFact = claim({
  id: "future-fact",
  statement: "用户计划下周去看展",
  truthStatus: "confirmed",
  userConfirmed: true,
  temporalStatus: "future",
  source: { kind: "manual", authorship: "user", producer: "phase7-test", evidenceKey: "future-fact" },
  recordedAt: 120,
});
const inferredFact = claim({
  id: "inferred-fact",
  statement: "角色猜测用户喜欢科幻",
  truthStatus: "inferred",
  source: { kind: "user_message", authorship: "character", messageIds: ["message-inferred"], producer: "phase7-test", evidenceKey: "inferred-fact" },
});
const superseded = claim({
  id: "superseded-fact",
  statement: "旧的关系判断",
  truthStatus: "confirmed",
  userConfirmed: true,
  supersededById: "replacement-fact",
});

const sourceBackedSummary: ConversationSummaryRecord = {
  ...scope,
  id: "summary-phase7",
  summary: "来源明确的摘要",
  sourceMessageIds: ["message-default"],
  sourceClaimIds: ["claim-default"],
  rangeStartAt: 100,
  rangeEndAt: 100,
  generatedAt: 130,
  generator: "phase7-test",
  projectionVersion: 2,
  status: "active",
  schemaVersion: 1,
};

const correction: BehaviorCorrectionRecord = {
  ...scope,
  id: "correction-phase7",
  instruction: "保持角色边界，不替用户做决定",
  sourceMessageIds: ["message-default"],
  createdAt: 100,
  updatedAt: 130,
  status: "active",
  schemaVersion: 1,
};

const result = retrieveTruthForPrivatePrompt({
  scope,
  queryText: "看展",
  limit: 8,
  now: 200,
  claims: [futureFact, inferredFact, superseded, claim({ id: "claim-default" })],
  summaries: [sourceBackedSummary],
  corrections: [],
});

assert.deepEqual(result.projection.futurePlans.map((item) => item.id), ["future-fact"], "future temporal status wins over fact kind");
assert.deepEqual(result.projection.openBeliefsAndHypotheses.map((item) => item.id), ["inferred-fact"], "inferred facts stay cautious");
assert.equal(result.projection.confirmedFacts.some((item) => item.id === "superseded-fact"), false, "superseded claims do not re-enter prompt truth");
assert.equal(result.summaries.length, 0, "the source-backed summary yields to its selected Truth claim");
assert.doesNotMatch(formatTruthRetrievalForPrompt(result), /对话摘要（非权威补充）/);

const diagnostics = explainTruthProjection({
  scope,
  claims: [superseded],
  summaries: [],
  corrections: [],
});
assert.equal(diagnostics[0]?.reason, "superseded");

const publicResult = retrieveTruthForPrivatePrompt({
  scope,
  scenario: "public",
  claims: [futureFact, claim({ id: "claim-default" })],
  summaries: [sourceBackedSummary],
  corrections: [],
});
assert.equal(Object.values(publicResult.projection).every((items) => items.length === 0), true, "relation-private Truth is denied in public scenario");
assert.equal(publicResult.summaries.length, 0);

const boundedResult = retrieveTruthForPrivatePrompt({
  scope,
  queryText: "看展",
  limit: 3,
  claims: [futureFact, claim({ id: "claim-bounded" })],
  summaries: [sourceBackedSummary, { ...sourceBackedSummary, id: "summary-bounded" }],
  corrections: [correction, { ...correction, id: "correction-bounded" }],
});
assert.equal(countTruthRetrievalRecords(boundedResult), 3, "Truth, correction, and summary records share one total retrieval budget");
assert.equal(boundedResult.summaries.length, 0, "non-authoritative summaries yield to claims and corrections when the budget is full");
assert.equal(boundedResult.corrections.length, 1);

console.log("PASS Phase 7 semantic projection, supersession, source-aware summary, and scenario visibility checks");
