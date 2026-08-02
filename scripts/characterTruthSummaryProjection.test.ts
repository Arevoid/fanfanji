import assert from "node:assert/strict";
import { createConversationSummaryRecord } from "../src/features/characterKnowledge/services/conversationSummaryService";
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
assert.equal(summary.projectionVersion, 1);
assert.equal(summary.status, "active");

const crossIdentity = createConversationSummaryRecord({
  scope,
  claims: [{ ...claim, userIdentityId: "identity-b", relationId: "relation-b" }],
  sourceMessageIds: ["message-b"],
  generatedAt: 20,
});
assert.equal(crossIdentity, undefined, "summary source claims must stay in one relation");

console.log("PASS Truth Layer summary projection retains source IDs, time range, and relation scope");
