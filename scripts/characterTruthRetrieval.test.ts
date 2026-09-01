import assert from "node:assert/strict";
import { explainTruthProjection, formatTruthRetrievalForPrompt, retrieveTruthForPrivatePrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";
import type { BehaviorCorrectionRecord, ConversationSummaryRecord, KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";

const scope = { relationId: "relation-a", characterId: "char-a", userIdentityId: "identity-a", conversationId: "direct:relation-a" };
const claim = (id: string, statement: string, truthStatus: KnowledgeClaim["truthStatus"], kind: KnowledgeClaim["kind"] = "fact", relation = scope): KnowledgeClaim => ({
  ...relation,
  id,
  kind,
  subject: "other",
  statement,
  truthStatus,
  temporalStatus: kind === "plan" ? "future" : "unknown",
  source: truthStatus === "legacy_unverified"
    ? { kind: "legacy_memory", authorship: "unknown", sourceRecordId: id, producer: "test", evidenceKey: id }
    : { kind: "user_message", authorship: "user", messageIds: [`message:${id}`], producer: "test", evidenceKey: id },
  confidence: truthStatus === "confirmed" ? 1 : 0.6,
  userConfirmed: truthStatus === "confirmed",
  recordedAt: Number(id.replace(/\D/g, "")) || 1,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
});
const summary: ConversationSummaryRecord = {
  id: "summary-a",
  ...scope,
  summary: "只属于 A 的派生摘要",
  sourceMessageIds: [],
  sourceClaimIds: [],
  generatedAt: 10,
  generator: "test",
  projectionVersion: 1,
  status: "active",
  schemaVersion: 1,
};
const sourceBackedSummary: ConversationSummaryRecord = {
  ...summary,
  id: "summary-source-backed",
  summary: "有来源的摘要",
  sourceClaimIds: ["claim-confirmed"],
};
const correction: BehaviorCorrectionRecord = {
  id: "correction-a",
  ...scope,
  instruction: "保持克制，不替用户做决定",
  sourceMessageIds: [],
  createdAt: 10,
  updatedAt: 10,
  status: "active",
  schemaVersion: 1,
};

const result = retrieveTruthForPrivatePrompt({
  scope,
  queryText: "电影",
  limit: 8,
  now: 100,
  claims: [
    claim("claim-confirmed", "用户确认喜欢电影", "confirmed"),
    claim("claim-plan", "以后计划一起看电影", "asserted", "plan"),
    claim("claim-hypothesis", "也许用户喜欢科幻", "inferred", "hypothesis"),
    claim("claim-disputed", "用户是否喜欢恐怖片存在争议", "disputed"),
    claim("claim-legacy", "旧 Memory 待核验", "legacy_unverified"),
    claim("claim-other", "identity B 的电影事实", "confirmed", "fact", { ...scope, relationId: "relation-b", userIdentityId: "identity-b", conversationId: "direct:relation-b" }),
  ],
  summaries: [summary, sourceBackedSummary, { ...summary, id: "summary-b", relationId: "relation-b", userIdentityId: "identity-b", conversationId: "direct:relation-b", summary: "B 的摘要" }],
  corrections: [correction, { ...correction, id: "correction-b", relationId: "relation-b", userIdentityId: "identity-b", conversationId: "direct:relation-b", instruction: "B 的修正" }],
});

assert.equal(result.projection.confirmedFacts.length, 1);
assert.equal(result.projection.confirmedFacts[0].statement, "用户确认喜欢电影");
assert.equal(result.projection.futurePlans.length, 1);
assert.equal(result.projection.openBeliefsAndHypotheses.length, 1);
assert.equal(result.projection.disputed.length, 1);
assert.equal(result.projection.legacyUnverified.length, 1);
assert.equal(result.summaries.length, 2);
assert.equal(result.summaries[0].summary, "只属于 A 的派生摘要");
assert.equal(result.summaries[1].summary, "有来源的摘要");
assert.equal(result.corrections.length, 1);
assert.ok(result.shadowedLegacyMemoryIds.includes("claim-legacy"));

const prompt = formatTruthRetrievalForPrompt(result);
assert.match(prompt, /Confirmed facts/);
assert.match(prompt, /尚未发生的计划/);
assert.match(prompt, /不得改写成已经发生的事实/);
assert.match(prompt, /旧数据待核验/);
assert.match(prompt, /对话摘要（非权威补充）/);
assert.match(prompt, /只属于 A 的派生摘要/);
assert.match(prompt, /如果与上面的具体事实/);
assert.match(prompt, /保持克制/);
assert.doesNotMatch(prompt, /identity B/);

const staleResult = retrieveTruthForPrivatePrompt({
  scope,
  claims: [{ ...claim("claim-retracted-source", "已被撤回的来源", "retracted"), status: "retracted" }],
  summaries: [{ ...sourceBackedSummary, sourceClaimIds: ["claim-retracted-source"] }],
  corrections: [],
});
assert.equal(staleResult.summaries.length, 0, "a summary with retracted or missing source claims is not usable");
const boundedPrompt = formatTruthRetrievalForPrompt({ ...result, promptCharacterLimit: 120 });
assert.ok(boundedPrompt.length <= 120, "Truth prompt projection must respect its character budget");

const diagnostics = explainTruthProjection({
  scope,
  limit: 8,
  now: 100,
  claims: [
    claim("diag-included", "included", "confirmed"),
    claim("diag-other", "other relation", "confirmed", "fact", { ...scope, relationId: "relation-b", userIdentityId: "identity-b", conversationId: "direct:relation-b" }),
    { ...claim("diag-retracted", "retracted", "confirmed"), status: "retracted", truthStatus: "retracted" },
  ],
  summaries: [],
  corrections: [],
});
assert.equal(diagnostics.find((item) => item.claimId === "diag-included")?.reason, "included");
assert.equal(diagnostics.find((item) => item.claimId === "diag-other")?.reason, "scope_mismatch");
assert.equal(diagnostics.find((item) => item.claimId === "diag-retracted")?.reason, "inactive");

console.log("PASS Truth Layer retrieval ranking, temporal labels, prompt visibility, and identity isolation");
