import assert from "node:assert/strict";
import { deriveCanonicalClaimSetRevision } from "../src/domain/memory/memoryCanonicalRevision";
import { createMemoryProjectionJob } from "../src/domain/memory/memoryProjectionJob";
import { InMemoryMemoryProjectionJobRepository } from "../src/domain/memory/memoryProjectionJobRepository";
import { reconcileConversationSummaryProjection } from "../src/domain/memory/memoryProjectionReconciliation";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { MemoryProcessingScope } from "../src/domain/memory/memorySourceProcessingCursor";

const scope: MemoryProcessingScope = {
  characterId: "character-1",
  relationId: "relation-1",
  userIdentityId: "identity-1",
  conversationId: "direct:relation-1",
};
const claim = (id: string, statement = "用户喜欢雨天", patch: Partial<KnowledgeClaim> = {}): KnowledgeClaim => ({
  id,
  ...scope,
  kind: "preference",
  subject: "user",
  statement,
  truthStatus: "asserted",
  temporalStatus: "timeless",
  source: { kind: "user_message", authorship: "user", messageIds: [`message-${id}`], producer: "test", evidenceKey: `evidence-${id}` },
  confidence: 0.8,
  userConfirmed: false,
  recordedAt: 100,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
  ...patch,
});

const first = claim("claim-a");
const second = claim("claim-b", "用户喜欢春天");
const revisionA = deriveCanonicalClaimSetRevision({ scope, claims: [first, second] });
assert.equal(revisionA.activeClaimIds.length, 2);
assert.equal(revisionA.revision, deriveCanonicalClaimSetRevision({ scope, claims: [second, first] }).revision, "ordering does not change revision");
assert.equal(revisionA.revision, deriveCanonicalClaimSetRevision({ scope, claims: [first, second, first] }).revision, "duplicate append does not change revision");
assert.notEqual(revisionA.revision, deriveCanonicalClaimSetRevision({ scope, claims: [first, { ...second, status: "retracted", truthStatus: "retracted" } as KnowledgeClaim] }).revision, "retraction changes revision");
assert.notEqual(revisionA.revision, deriveCanonicalClaimSetRevision({ scope, claims: [first, claim("claim-b", "用户喜欢夏天")] }).revision, "in-place statement mutation changes fingerprint");
assert.equal(deriveCanonicalClaimSetRevision({ scope, claims: [{ ...first, relationId: "other-relation" }] }).activeClaimIds.length, 0, "scope mismatch is excluded");

const repository = new InMemoryMemoryProjectionJobRepository();
const job = createMemoryProjectionJob({ projectionKind: "conversation_summary", scope, canonicalRefs: revisionA.activeClaimIds, canonicalRevision: revisionA.revision, createdAt: 100 });
assert.equal(repository.insertIfAbsent(job).kind, "inserted");
assert.equal(repository.insertIfAbsent(job).kind, "exists", "duplicate identity inserts one logical job");
assert.equal(repository.listPending({ scope }).length, 1);
assert.equal(repository.compareAndSet(job.jobId, 99, job).kind, "conflict");
const running = repository.markRunning(job.jobId, job.version, "tab-a", 110, 200);
assert.equal(running.kind, "updated");
if (running.kind !== "updated") throw new Error("expected running job");
assert.equal(repository.markCompleted(job.jobId, running.job.version, 120).kind, "updated");
assert.equal(repository.markCompleted(job.jobId, running.job.version, 121).kind, "conflict", "stale owner cannot complete");

const retryJob = createMemoryProjectionJob({ projectionKind: "conversation_summary", scope, canonicalRefs: revisionA.activeClaimIds, canonicalRevision: `${revisionA.revision}:retry`, createdAt: 100 });
repository.insertIfAbsent(retryJob);
const retryRunning = repository.markRunning(retryJob.jobId, retryJob.version, "tab-a", 110, 120);
assert.equal(retryRunning.kind, "updated");
if (retryRunning.kind !== "updated") throw new Error("expected retry running job");
assert.equal(repository.markRunning(retryJob.jobId, retryRunning.job.version, "tab-b", 115, 215).kind, "conflict", "competing owner cannot acquire a running lease");
const reclaimed = repository.reclaimExpired(121, "tab-b", 221);
assert.equal(reclaimed.length, 1);
assert.equal(reclaimed[0]?.lease?.ownerId, "tab-b");
assert.equal(repository.markCompleted(retryJob.jobId, retryRunning.job.version, 130).kind, "conflict", "old running version is fenced");

const failedJob = createMemoryProjectionJob({ projectionKind: "legacy_memory_mirror", scope, canonicalRefs: revisionA.activeClaimIds, canonicalRevision: "legacy:r1", createdAt: 100 });
repository.insertIfAbsent(failedJob);
const failedRunning = repository.markRunning(failedJob.jobId, failedJob.version, "tab-a", 110, 200);
assert.equal(failedRunning.kind, "updated");
if (failedRunning.kind !== "updated") throw new Error("expected failed running job");
const failed = repository.markFailed(failedJob.jobId, failedRunning.job.version, "LEGACY_MIRROR_FAILED", 120);
assert.equal(failed.kind, "updated");
assert.equal(repository.listPending({ projectionKind: "legacy_memory_mirror" }).length, 1);

const summaryCurrent = { scope, status: "active" as const, sourceClaimIds: revisionA.activeClaimIds, canonicalRevision: revisionA.revision };
assert.equal(reconcileConversationSummaryProjection({ canonical: { scope, ...revisionA }, summary: summaryCurrent, existingJobs: [], now: 200 }).kind, "current");
const completedOldJob = createMemoryProjectionJob({ projectionKind: "conversation_summary", scope, canonicalRefs: revisionA.activeClaimIds, canonicalRevision: "claims:old", createdAt: 100 });
assert.equal(reconcileConversationSummaryProjection({ canonical: { scope, ...revisionA }, existingJobs: [completedOldJob], now: 200 }).kind, "missing", "new revision is not satisfied by an old completed job");
const missing = reconcileConversationSummaryProjection({ canonical: { scope, ...revisionA }, existingJobs: [], now: 200 });
assert.equal(missing.kind, "missing", "canonical commit without job is recoverable by reconciliation");
if (missing.kind !== "missing") throw new Error("expected missing projection job");
assert.equal(reconcileConversationSummaryProjection({ canonical: { scope, ...revisionA }, existingJobs: [missing.job], now: 201 }).kind, "already_scheduled");
const revisionB = deriveCanonicalClaimSetRevision({ scope, claims: [first, second, claim("claim-c")] });
assert.equal(reconcileConversationSummaryProjection({ canonical: { scope, ...revisionB }, summary: summaryCurrent, existingJobs: [missing.job], now: 202 }).kind, "missing", "new canonical revision creates new work");
assert.equal(reconcileConversationSummaryProjection({ canonical: { scope, ...revisionA, activeClaimIds: [] }, existingJobs: [], now: 203 }).kind, "no_active_claims");
assert.equal(reconcileConversationSummaryProjection({ canonical: { scope, ...revisionA }, summary: { ...summaryCurrent, scope: { ...scope, relationId: "other" } }, existingJobs: [], now: 204 }).kind, "missing", "scope mismatch never wildcard-matches");

const serialized = JSON.stringify(job);
for (const forbidden of ["用户喜欢", "Prompt", "apiKey", "Authorization", "transcript", "evidenceQuote"]) {
  assert.equal(serialized.includes(forbidden), false, `job metadata excludes ${forbidden}`);
}

console.log("Memory projection storage/recovery characterization: 20 checks passed");
