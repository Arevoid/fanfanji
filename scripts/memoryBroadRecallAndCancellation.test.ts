import assert from "node:assert/strict";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { retrieveTruthForPrivatePrompt, formatTruthRetrievalForPrompt, getLastTruthRetrievalDiagnostics } from "../src/features/characterKnowledge/services/truthRetrievalService";
import { reconcileExplicitPlanCancellations } from "../src/domain/characterKnowledge/explicitPlanCancellation";
import { appendKnowledgeClaims } from "../src/domain/characterKnowledge/knowledgeConflictPolicy";
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const claim = (id: string, statement: string, at: number, patch: Partial<KnowledgeClaim> = {}): KnowledgeClaim => ({
  ...scope, id, statement, kind: "fact", subject: "user", temporalStatus: "present", truthStatus: "asserted",
  source: { kind: "user_message", authorship: "user", messageIds: [id], evidenceQuote: statement, evidenceKey: id, producer: "test", statementAt: at },
  status: "active", confidence: .85, userConfirmed: false, recordedAt: at, visibility: "relation_private", schemaVersion: 1, ...patch,
});
// No embedding scores, no entity word in the query, no recent source text.
const scarf = claim("scarf", "我一直珍藏一条蓝色围巾，是外婆亲手织给我的，对我特别重要。", 1);
const watch = claim("watch", "这枚旧怀表对我特别重要，是父亲亲手修好的。", 2);
const lunch = claim("lunch", "今天午饭吃了青菜面。", 3);
const request = { scope, claims: [scarf, lunch], summaries: [], corrections: [], queryText: "我之前最珍惜的那件东西是什么，为什么珍惜？", now: 100, limit: 4 };
const prompt = formatTruthRetrievalForPrompt(retrieveTruthForPrivatePrompt(request));
assert.ok(prompt.includes("外婆") && prompt.includes("蓝色围巾"));
assert.ok(!prompt.includes("青菜面"));
assert.ok(getLastTruthRetrievalDiagnostics(scope)?.injectedClaimIds.includes("scarf"));
assert.ok(getLastTruthRetrievalDiagnostics(scope)?.candidateDecisions?.some(row => row.claimId === "scarf" && row.reason === "selected"));
assert.ok(formatTruthRetrievalForPrompt(retrieveTruthForPrivatePrompt({ ...request,
  queryText: "我之前说过最珍惜的那件东西是什么，为什么珍惜它？还有我现在喝什么，11月3日我们还约着见面吗？" })).includes("外婆"));
assert.ok(formatTruthRetrievalForPrompt(retrieveTruthForPrivatePrompt({ ...request, claims: [watch] })).includes("怀表"));
assert.ok(!formatTruthRetrievalForPrompt(retrieveTruthForPrivatePrompt({ ...request, queryText: "讲个冷笑话" })).includes("围巾"));
assert.ok(!formatTruthRetrievalForPrompt(retrieveTruthForPrivatePrompt({ ...request, scope: { ...scope, relationId: "other" } })).includes("围巾"));

const plan = claim("plan", "我们约好11月3日下午三点去青禾书店见面，好吗？", 10, { kind: "plan", temporalStatus: "future", subject: "relationship" });
const cancelled = claim("cancel", "11月3日下午青禾书店的约定取消了，那天我另有安排，我们先不定新的时间。", 20);
const fixed = appendKnowledgeClaims([plan], [cancelled]);
assert.equal(fixed[0].supersededById, "cancel");
assert.equal(fixed[0].validTo, 20);
assert.equal(fixed[1].planStatus, "cancelled");
assert.equal(fixed[1].temporalStatus, "past");
// Read repair is pure and also handles pre-fix persisted records.
assert.equal(reconcileExplicitPlanCancellations([plan, cancelled])[0].supersededById, "cancel");
assert.equal(plan.supersededById, undefined);
const sharedProposal: KnowledgeClaim = { ...plan, truthStatus: "inferred", source: { ...plan.source, authorship: "unknown",
  quotedMessageId: "proposal", messageAuthors: { proposal: "user", confirmation: "character" } } };
assert.equal(reconcileExplicitPlanCancellations([sharedProposal, cancelled])[0].supersededById, "cancel",
  "a user's quoted proposal with mixed supporting speakers can be retired, without upgrading its truth");
assert.equal(reconcileExplicitPlanCancellations([sharedProposal, cancelled])[0].truthStatus, "inferred");
assert.equal(reconcileExplicitPlanCancellations([{ ...sharedProposal, truthStatus: "disputed" }, cancelled])[0].supersededById, "cancel");
assert.equal(reconcileExplicitPlanCancellations([{ ...sharedProposal, source: { ...sharedProposal.source, quotedMessageId: "confirmation" } }, cancelled])[0].supersededById, undefined);
for (const other of [
  { ...cancelled, relationId: "elsewhere" },
  claim("conditional", "如果11月3日下午青禾书店的约定取消了，我再说。", 20),
  claim("negative", "11月3日下午青禾书店的约定没有取消了。", 20),
  claim("other-date", "11月4日下午青禾书店的约定取消了。", 20),
  claim("other-place", "11月3日下午山川书店的约定取消了。", 20),
]) assert.equal(reconcileExplicitPlanCancellations([plan, other])[0].supersededById, undefined);
assert.equal(reconcileExplicitPlanCancellations([plan, { ...plan, id: "ambiguous" }, cancelled])[0].supersededById, undefined);
console.log("Broad non-vector recall and evidence-bound cancellation passed");
