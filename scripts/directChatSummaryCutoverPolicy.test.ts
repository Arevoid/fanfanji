import assert from "node:assert/strict";
import { commitMemoryWriteBundle } from "../src/domain/memory/memoryWriteCoordinator";
import { resolveDirectChatSummaryCutover } from "../src/domain/memory/directChatSummaryCutoverPolicy";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";

const claim: KnowledgeClaim = {
  characterId: "character-cutover",
  relationId: "relation-cutover",
  userIdentityId: "identity-cutover",
  conversationId: "direct:relation-cutover",
  id: "claim-cutover",
  kind: "fact",
  subject: "user",
  statement: "cutover test claim",
  truthStatus: "asserted",
  temporalStatus: "present",
  source: { kind: "user_message", authorship: "user", messageIds: ["message-cutover"], producer: "test", evidenceKey: "cutover" },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 10,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
};

const summary = {
  id: "summary-cutover",
  characterId: claim.characterId,
  relationId: claim.relationId,
  userIdentityId: claim.userIdentityId,
  conversationId: claim.conversationId,
  summary: "cutover test summary",
  sourceMessageIds: ["message-cutover"],
  sourceClaimIds: [claim.id],
  generatedAt: 10,
  generator: "test",
  projectionVersion: 2,
  status: "active" as const,
  schemaVersion: 1,
};

async function simulate(input: {
  enqueueKind: "inserted" | "exists" | "unavailable";
  fallbackWrite?: boolean;
  snapshotAvailable?: boolean;
}) {
  const initial = resolveDirectChatSummaryCutover({
    automatic: true,
    canonicalSnapshotAvailable: input.snapshotAvailable !== false,
    enqueueKind: input.enqueueKind,
  });
  let summaryWrites = 0;
  let cursorAdvances = 0;
  const write = await commitMemoryWriteBundle({
    claims: [claim],
    afterCanonicalWrite: async () => undefined,
    buildSummary: () => initial.writeSynchronousSummary ? summary : undefined,
    appendClaims: () => ({ success: true }),
    appendSummaries: () => {
      summaryWrites += 1;
      return { success: input.fallbackWrite !== false };
    },
  });
  const final = resolveDirectChatSummaryCutover({
    automatic: true,
    canonicalSnapshotAvailable: input.snapshotAvailable !== false,
    enqueueKind: input.enqueueKind,
    fallbackSummaryWritten: write.summaryWritten,
  });
  if (final.canAdvanceCursor) cursorAdvances += 1;
  return { initial, final, write, summaryWrites, cursorAdvances };
}

for (const enqueueKind of ["inserted", "exists"] as const) {
  const result = await simulate({ enqueueKind });
  assert.equal(result.summaryWrites, 0, `${enqueueKind} must not synchronously write Summary`);
  assert.equal(result.write.summaryWritten, true, `${enqueueKind} is complete without a Summary callback`);
  assert.equal(result.cursorAdvances, 1);
  assert.equal(result.final.canAdvanceCursor, true);
}

const fallbackSuccess = await simulate({ enqueueKind: "unavailable", fallbackWrite: true });
assert.equal(fallbackSuccess.summaryWrites, 1);
assert.equal(fallbackSuccess.final.outcome, "SYNC_FALLBACK_SUCCEEDED");
assert.equal(fallbackSuccess.cursorAdvances, 1);

const fallbackFailure = await simulate({ enqueueKind: "unavailable", fallbackWrite: false });
assert.equal(fallbackFailure.summaryWrites, 1);
assert.equal(fallbackFailure.write.canonicalWritten, true, "fallback failure never rolls back canonical Truth");
assert.equal(fallbackFailure.write.summaryWritten, false);
assert.equal(fallbackFailure.final.outcome, "SYNC_FALLBACK_FAILED");
assert.equal(fallbackFailure.cursorAdvances, 0);

const snapshotUnavailable = resolveDirectChatSummaryCutover({
  automatic: true,
  canonicalSnapshotAvailable: false,
  enqueueKind: "unavailable",
});
assert.equal(snapshotUnavailable.outcome, "CANONICAL_SNAPSHOT_UNAVAILABLE");
assert.equal(snapshotUnavailable.writeSynchronousSummary, false);
assert.equal(snapshotUnavailable.canAdvanceCursor, false);

const zeroCandidates = resolveDirectChatSummaryCutover({
  automatic: true,
  canonicalSnapshotAvailable: true,
  zeroCandidates: true,
});
assert.equal(zeroCandidates.outcome, "ZERO_CANDIDATES");
assert.equal(zeroCandidates.writeSynchronousSummary, false);
assert.equal(zeroCandidates.canAdvanceCursor, true);

const manual = resolveDirectChatSummaryCutover({ automatic: false, canonicalSnapshotAvailable: false });
assert.equal(manual.outcome, "MANUAL_SYNCHRONOUS_SUMMARY");
assert.equal(manual.writeSynchronousSummary, true);
assert.equal(manual.canAdvanceCursor, true);

console.log("direct chat Summary cutover policy tests passed");
