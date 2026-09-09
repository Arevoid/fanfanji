import assert from "node:assert/strict";
import { createConversationSummaryRecord } from "../src/domain/characterKnowledge/conversationSummaryProjection";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { compareConversationSummaryProjectionEquivalence } from "../src/core/memory/conversationSummaryProjectionEquivalence";

const scope = {
  characterId: "character-equivalence",
  relationId: "relation-equivalence",
  userIdentityId: "identity-equivalence",
  conversationId: "direct:relation-equivalence",
};
const claim: KnowledgeClaim = {
  ...scope,
  id: "claim-equivalence",
  kind: "fact",
  subject: "user",
  statement: "一个稳定事实。",
  truthStatus: "confirmed",
  temporalStatus: "present",
  source: { kind: "user_message", authorship: "user", messageIds: ["message-equivalence"], producer: "test", evidenceKey: "equivalence" },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 10,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
};

const synchronous = createConversationSummaryRecord({
  id: "sync-summary",
  scope,
  claims: [claim],
  sourceMessageIds: ["message-equivalence"],
  canonicalRevision: "claims:equivalence:1",
  generatedAt: 100,
});
const background = createConversationSummaryRecord({
  id: "background-summary",
  scope,
  claims: [claim],
  sourceMessageIds: ["message-equivalence"],
  canonicalRevision: "claims:equivalence:1",
  generatedAt: 150,
  generator: "memory-projection.conversation-summary.v1",
});
assert.ok(synchronous && background);
if (!synchronous || !background) throw new Error("summary fixtures missing");
const equivalent = compareConversationSummaryProjectionEquivalence(synchronous, background);
assert.equal(equivalent.equivalent, true);
assert.deepEqual(equivalent.mismatchFields, []);
assert.equal(equivalent.generatedAtDeltaMs, 50);

const mismatch = compareConversationSummaryProjectionEquivalence(synchronous, {
  ...background,
  sourceClaimIds: ["different-claim"],
  summary: "不应持久化到诊断中的正文",
});
assert.equal(mismatch.equivalent, false);
assert.deepEqual(mismatch.mismatchFields, ["summary", "sourceClaimIds"]);
assert.doesNotMatch(JSON.stringify(mismatch), /不应持久化|稳定事实/u, "equivalence diagnostics contain field names only");

const aggregateClaim = { ...claim, id: "claim-aggregate", statement: "canonical scope has another fact", source: { ...claim.source, messageIds: ["message-aggregate"] } };
const aggregateBackground = createConversationSummaryRecord({
  id: "background-aggregate",
  scope,
  claims: [claim, aggregateClaim],
  sourceMessageIds: ["message-equivalence", "message-aggregate"],
  canonicalRevision: "claims:equivalence:2",
  generatedAt: 150,
  generator: "memory-projection.conversation-summary.v1",
});
assert.ok(aggregateBackground);
if (!aggregateBackground) throw new Error("aggregate summary fixture missing");
const aggregateMismatch = compareConversationSummaryProjectionEquivalence(synchronous, aggregateBackground);
assert.equal(aggregateMismatch.equivalent, false, "batch Summary vs full-canonical projection remains visible during shadow phase");
assert.ok(aggregateMismatch.mismatchFields.includes("summary"));
assert.ok(aggregateMismatch.mismatchFields.includes("sourceClaimIds"));
assert.ok(aggregateMismatch.mismatchFields.includes("canonicalRevision"));

console.log("conversation summary semantic equivalence tests passed");
