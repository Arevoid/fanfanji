import assert from "node:assert/strict";
import {
  createConversationSummaryRecord,
  rebuildConversationSummaryRecord,
  reconcileConversationSummaryRecords,
} from "../src/features/characterKnowledge/services/conversationSummaryService";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";

const scope = { relationId: "relation-a", characterId: "char-a", userIdentityId: "identity-a", conversationId: "direct:relation-a" };
const claim: KnowledgeClaim = {
  ...scope,
  id: "claim-a",
  kind: "fact",
  subject: "user",
  statement: "用户喜欢电影",
  truthStatus: "confirmed",
  temporalStatus: "present",
  source: { kind: "user_message", authorship: "user", messageIds: ["message-a"], producer: "test", evidenceKey: "claim-a" },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 10,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
};

const summary = createConversationSummaryRecord({
  scope,
  claims: [claim],
  sourceMessageIds: ["message-a", "message-b"],
  generatedAt: 20,
  rangeStartAt: 10,
  rangeEndAt: 15,
});
assert.ok(summary);
assert.deepEqual(summary.sourceClaimIds, [claim.id]);
assert.deepEqual(summary.sourceMessageIds, ["message-a", "message-b"]);
assert.equal(summary.rangeStartAt, 10);
assert.equal(summary.rangeEndAt, 15);
assert.equal(summary.projectionVersion, 2);
assert.equal(summary.status, "active");

const crossIdentity = createConversationSummaryRecord({
  scope,
  claims: [{ ...claim, userIdentityId: "identity-b", relationId: "relation-b" }],
  sourceMessageIds: ["message-b"],
  generatedAt: 20,
});
assert.equal(crossIdentity, undefined, "summary source claims must stay in one relation");

const plan: KnowledgeClaim = {
  ...scope,
  id: "claim-plan",
  kind: "plan",
  subject: "relationship",
  statement: "以后一起去看海",
  truthStatus: "asserted",
  temporalStatus: "future",
  source: { kind: "user_message", authorship: "user", messageIds: ["message-c"], producer: "test", evidenceKey: "claim-plan" },
  confidence: 0.8,
  userConfirmed: false,
  recordedAt: 11,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
};
const summaryWithSemantics = createConversationSummaryRecord({
  scope,
  claims: [
    { ...claim, id: "claim-z", source: { ...claim.source, messageIds: ["message-z"], evidenceKey: "claim-z" } },
    plan,
    { ...claim, id: "claim-wrong-conversation", conversationId: "direct:other", source: { ...claim.source, messageIds: ["message-c"], evidenceKey: "claim-wrong-conversation" } },
    { ...claim, id: "claim-retracted", source: { ...claim.source, messageIds: ["message-c"], evidenceKey: "claim-retracted" }, status: "retracted", truthStatus: "retracted" },
  ],
  sourceMessageIds: ["message-c", "message-z"],
  generatedAt: 30,
});
assert.ok(summaryWithSemantics);
assert.deepEqual(summaryWithSemantics?.sourceMessageIds, ["message-c", "message-z"]);
assert.deepEqual(summaryWithSemantics?.sourceClaimIds, ["claim-plan", "claim-z"]);
assert.equal(summaryWithSemantics?.rangeStartAt, 10);
assert.equal(summaryWithSemantics?.rangeEndAt, 11);
assert.match(summaryWithSemantics?.summary || "", /未来计划，尚未发生/);
assert.doesNotMatch(summaryWithSemantics?.summary || "", /wrong-conversation|retracted/);

const rebuilt = rebuildConversationSummaryRecord({
  summary: summaryWithSemantics!,
  claims: [plan, { ...claim, id: "claim-z", source: { ...claim.source, messageIds: ["message-z"], evidenceKey: "claim-z" } }],
  generatedAt: 40,
});
assert.equal(rebuilt?.id, summaryWithSemantics?.id);
assert.equal(rebuilt?.generatedAt, 40);
assert.equal(rebuilt?.projectionVersion, 2);
assert.equal(rebuilt?.status, "active");
assert.equal(reconcileConversationSummaryRecords([summaryWithSemantics!], [{ ...plan, status: "retracted", truthStatus: "retracted" }])[0]?.status, "stale");

console.log("PASS Truth Layer summary projection retains source IDs, time range, and relation scope");
