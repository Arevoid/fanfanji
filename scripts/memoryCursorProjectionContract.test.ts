import assert from "node:assert/strict";
import {
  createMemoryProcessingScope,
  createMemorySourceProcessingCursor,
  getMemoryProcessingScopeKey,
} from "../src/domain/memory/memorySourceProcessingCursor";
import {
  canAcquireMemoryProjectionLease,
  createMemoryProjectionJob,
  getMemoryProjectionJobIdentity,
  normalizeMemoryProjectionErrorCode,
  transitionMemoryProjectionJob,
} from "../src/domain/memory/memoryProjectionJob";

const scope = createMemoryProcessingScope({
  characterId: "character-1",
  relationId: "relation-1",
  userIdentityId: "identity-1",
  conversationId: "direct:relation-1",
});

assert.equal(getMemoryProcessingScopeKey(scope), "character-1|relation-1|identity-1|direct%3Arelation-1");
assert.throws(() => createMemoryProcessingScope({ ...scope, relationId: "" }), /memory_scope_invalid/);

const outcomes = [
  "skipped_low_value",
  "extracted_zero_candidates",
  "canonical_committed",
  "canonical_and_projection_committed",
] as const;
for (const processingOutcome of outcomes) {
  const cursor = createMemorySourceProcessingCursor({
    sourceType: "direct_chat",
    scope,
    processedThroughMessageId: `message-${processingOutcome}`,
    processedAt: 100,
    processingOutcome,
  });
  assert.equal(cursor.scope.relationId, "relation-1");
  assert.equal(cursor.processingOutcome, processingOutcome);
}
assert.throws(() => createMemorySourceProcessingCursor({
  sourceType: "direct_chat",
  scope,
  processedThroughMessageId: "message-1",
  processedAt: 100,
  processingOutcome: "unsupported_outcome",
} as never));

const firstJob = createMemoryProjectionJob({
  projectionKind: "conversation_summary",
  scope,
  canonicalRefs: ["claim-b", "claim-a", "claim-a"],
  canonicalRevision: "claims:r1",
  createdAt: 100,
});
const duplicateIdentity = getMemoryProjectionJobIdentity({
  projectionKind: "conversation_summary",
  scope,
  canonicalRefs: ["claim-a", "claim-b"],
  canonicalRevision: "claims:r1",
});
assert.equal(firstJob.jobId, duplicateIdentity, "same scope/kind/revision/refs has one logical identity");
assert.deepEqual(firstJob.canonicalRefs, ["claim-a", "claim-b"]);
assert.notEqual(firstJob.jobId, createMemoryProjectionJob({
  projectionKind: "conversation_summary",
  scope,
  canonicalRefs: ["claim-a", "claim-b", "claim-c"],
  canonicalRevision: "claims:r1",
  createdAt: 100,
}).jobId, "new canonical refs create new work");
assert.throws(() => createMemoryProjectionJob({
  projectionKind: "conversation_summary",
  scope,
  canonicalRefs: [],
  canonicalRevision: "claims:r1",
  createdAt: 100,
}), /memory_projection_canonical_refs_missing/);

const started = transitionMemoryProjectionJob(firstJob, { type: "start", ownerId: "tab-a", leaseUntil: 200 }, 110);
assert.equal(started.status, "running");
assert.equal(started.attemptCount, 1);
assert.equal(canAcquireMemoryProjectionLease(started, "tab-a", 120), true);
assert.equal(canAcquireMemoryProjectionLease(started, "tab-b", 120), false);
assert.equal(canAcquireMemoryProjectionLease(started, "tab-b", 200), true, "expired lease is reclaimable");
assert.throws(() => transitionMemoryProjectionJob(started, { type: "start", ownerId: "tab-b", leaseUntil: 300 }, 120), /memory_projection_transition_invalid/);

const failed = transitionMemoryProjectionJob(started, { type: "fail", errorCode: "SUMMARY_WRITE_FAILED" }, 130);
assert.equal(failed.status, "failed");
assert.equal(failed.lastErrorCode, "SUMMARY_WRITE_FAILED");
const retried = transitionMemoryProjectionJob(failed, { type: "retry" }, 140);
assert.equal(retried.status, "pending");
const secondAttempt = transitionMemoryProjectionJob(retried, { type: "start", ownerId: "tab-b", leaseUntil: 240 }, 150);
assert.equal(secondAttempt.attemptCount, 2);
const completed = transitionMemoryProjectionJob(secondAttempt, { type: "complete" }, 160);
assert.equal(completed.status, "completed");
assert.equal(completed.completedAt, 160);
assert.throws(() => transitionMemoryProjectionJob(completed, { type: "retry" }, 170), /memory_projection_transition_invalid/);
assert.equal(normalizeMemoryProjectionErrorCode("raw exception text"), "UNKNOWN");

const serialized = JSON.stringify(firstJob);
for (const forbidden of ["Prompt", "Authorization", "apiKey", "response body", "evidenceQuote"]) {
  assert.equal(serialized.includes(forbidden), false, `projection job does not persist ${forbidden}`);
}

console.log("Memory cursor/projection contract: 20 characterization checks passed");
