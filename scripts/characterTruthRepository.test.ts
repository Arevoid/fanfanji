import assert from "node:assert/strict";
import type {
  BehaviorCorrectionRecord,
  ConversationSummaryRecord,
  KnowledgeClaim,
} from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import {
  removeKnowledgeClaimsByRelations,
  retractKnowledgeClaimsBySourceMessageIds,
  retractKnowledgeClaim,
  supersedeKnowledgeClaim,
} from "../src/domain/characterKnowledge/knowledgeConflictPolicy";
import {
  appendToKnowledgeClaims,
  findBySource,
  listByRelation,
  normalizeKnowledgeClaims,
} from "../src/core/storage/repositories/characterKnowledgeRepository";
import {
  appendConversationSummaries,
  listConversationSummariesByRelation,
  removeConversationSummariesByRelations,
} from "../src/core/storage/repositories/conversationSummaryRepository";
import {
  appendBehaviorCorrections,
  listBehaviorCorrectionsByRelation,
  removeBehaviorCorrectionsByRelations,
} from "../src/core/storage/repositories/behaviorCorrectionRepository";

const scopeA = { relationId: "relation-a", characterId: "character-shared", userIdentityId: "identity-a", conversationId: "direct:relation-a" };
const scopeB = { relationId: "relation-b", characterId: "character-shared", userIdentityId: "identity-b", conversationId: "direct:relation-b" };
const claim = (id: string, scope = scopeA, evidenceKey = id): KnowledgeClaim => ({
  id,
  ...scope,
  kind: "fact",
  subject: "user",
  statement: `${id} statement`,
  truthStatus: "asserted",
  temporalStatus: "present",
  source: { kind: "user_message", authorship: "user", messageIds: [`message-${id}`], producer: "test", evidenceKey },
  confidence: 0.8,
  userConfirmed: false,
  recordedAt: 100,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
});

const relationA = claim("claim-a");
const relationB = claim("claim-b", scopeB);
const isolated = appendToKnowledgeClaims([], [relationA, relationB]);
assert.deepEqual(listByRelation(scopeA, isolated).map((item) => item.id), ["claim-a"]);
assert.deepEqual(listByRelation(scopeB, isolated).map((item) => item.id), ["claim-b"]);
assert.deepEqual(listByRelation({ ...scopeA, userIdentityId: "identity-b" }, isolated), []);
assert.deepEqual(findBySource(scopeA, { evidenceKey: "claim-a" }, isolated).map((item) => item.id), ["claim-a"]);

const duplicate = { ...relationA, id: "claim-a-retry" };
assert.equal(appendToKnowledgeClaims(isolated, [duplicate]).length, 2, "same evidence and statement is idempotent");
const meaningDuplicate = {
  ...relationA,
  id: "claim-a-different-run",
  source: { ...relationA.source, evidenceKey: "another-evidence", messageIds: ["message-another"] },
  recordedAt: 200,
};
const normalizedMeaningDuplicates = normalizeKnowledgeClaims([relationA, meaningDuplicate]);
assert.equal(normalizedMeaningDuplicates.length, 1, "historical copies with different ids/evidence collapse by scoped meaning");
assert.deepEqual(normalizedMeaningDuplicates[0]?.source.messageIds, ["message-another", "message-claim-a"], "meaning cleanup retains source provenance");
assert.equal(normalizeKnowledgeClaims([{ ...relationA, relationId: "" }]).length, 0, "unscoped persisted claims are rejected");

const wrongScopeRetraction = retractKnowledgeClaim(isolated, scopeB, "claim-a", "wrong relation");
assert.equal(wrongScopeRetraction.find((item) => item.id === "claim-a")?.status, "active");
const retracted = retractKnowledgeClaim(isolated, scopeA, "claim-a", "source removed");
assert.equal(retracted.find((item) => item.id === "claim-a")?.status, "retracted");
assert.equal(retracted.find((item) => item.id === "claim-a")?.retractionReason, "source removed");
const sourceDeleted = retractKnowledgeClaimsBySourceMessageIds(isolated, ["message-claim-a"]);
assert.equal(sourceDeleted.find((item) => item.id === "claim-a")?.truthStatus, "retracted");
assert.equal(sourceDeleted.find((item) => item.id === "claim-b")?.status, "active");

const replacement = { ...claim("claim-a-new"), statement: "corrected statement", truthStatus: "confirmed" as const, userConfirmed: true };
const superseded = supersedeKnowledgeClaim(isolated, scopeA, "claim-a", replacement);
assert.equal(superseded.find((item) => item.id === "claim-a")?.supersededById, "claim-a-new");
assert.equal(superseded.find((item) => item.id === "claim-a")?.status, "retracted");
assert.equal(superseded.find((item) => item.id === "claim-a-new")?.supersedesId, "claim-a");
assert.equal(supersedeKnowledgeClaim(isolated, scopeA, "claim-a", claim("cross", scopeB)).length, isolated.length, "cross-scope supersession is rejected");
assert.deepEqual(removeKnowledgeClaimsByRelations(isolated, [scopeA.relationId]).map((item) => item.id), ["claim-b"]);

const summary = (id: string, scope = scopeA): ConversationSummaryRecord => ({
  id, ...scope, summary: `${id} summary`, sourceMessageIds: [`message-${id}`], sourceClaimIds: [], generatedAt: 100,
  generator: "test", projectionVersion: 1, status: "active", schemaVersion: 1,
});
const summaries = appendConversationSummaries([], [summary("summary-a"), summary("summary-b", scopeB), summary("summary-a")]);
assert.equal(summaries.length, 2);
assert.equal(appendConversationSummaries([], [
  { ...summary("summary-meaning-a"), summary: "相同摘要内容" },
  { ...summary("summary-meaning-b"), summary: "相同摘要内容", generatedAt: 200 },
]).length, 1, "historical summary copies collapse by exact relationship and meaning");
assert.deepEqual(listConversationSummariesByRelation(scopeA, summaries).map((item) => item.id), ["summary-a"]);
assert.deepEqual(removeConversationSummariesByRelations(summaries, [scopeA.relationId]).map((item) => item.id), ["summary-b"]);
const summaryNew = { ...summary("summary-versioned"), generatedAt: 200, summary: "new summary" };
const summaryOld = { ...summaryNew, generatedAt: 100, summary: "old summary" };
assert.equal(appendConversationSummaries([], [summaryNew, summaryOld]).find((item) => item.id === summaryNew.id)?.summary, "new summary");
assert.deepEqual(
  listConversationSummariesByRelation(scopeA, [summary("summary-a"), { ...summary("summary-other-conversation"), conversationId: "direct:other" }]),
  [summary("summary-a")],
  "summary listing must not treat conversationId as a wildcard",
);

const correction = (id: string, scope = scopeA): BehaviorCorrectionRecord => ({
  id, ...scope, instruction: "Stay in character.", sourceMessageIds: [`message-${id}`], createdAt: 100, updatedAt: 100,
  status: "active", schemaVersion: 1,
});
const corrections = appendBehaviorCorrections([], [correction("correction-a"), correction("correction-b", scopeB), correction("correction-a")]);
assert.equal(corrections.length, 2);
assert.deepEqual(listBehaviorCorrectionsByRelation(scopeB, corrections).map((item) => item.id), ["correction-b"]);
assert.deepEqual(removeBehaviorCorrectionsByRelations(corrections, [scopeB.relationId]).map((item) => item.id), ["correction-a"]);

console.log("PASS Character Truth repositories, identity isolation, idempotency, audit chains, and cleanup");
