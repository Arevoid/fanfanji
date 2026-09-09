import assert from "node:assert/strict";
import { createMemoryProjectionJob, transitionMemoryProjectionJob, type MemoryProjectionJob } from "../src/domain/memory/memoryProjectionJob";
import { deriveCanonicalClaimSetRevision } from "../src/domain/memory/memoryCanonicalRevision";
import type { MemoryProcessingScope } from "../src/domain/memory/memorySourceProcessingCursor";
import type { KnowledgeClaim, ConversationSummaryRecord } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { runPendingConversationSummaryProjections } from "../src/core/memory/memoryProjectionRunner";

const scope: MemoryProcessingScope = {
  characterId: "character-runner",
  relationId: "relation-runner",
  userIdentityId: "identity-runner",
  conversationId: "direct:relation-runner",
};
const claim = (id: string, targetScope = scope): KnowledgeClaim => ({
  ...targetScope,
  id,
  kind: "fact",
  subject: "user",
  statement: `statement-${id}`,
  truthStatus: "asserted",
  temporalStatus: "present",
  source: { kind: "user_message", authorship: "user", messageIds: [`message-${id}`], producer: "test", evidenceKey: id },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 10,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
});
const claims = [claim("claim-runner")];
const revision = deriveCanonicalClaimSetRevision({ scope, claims });
const makeJob = (targetScope = scope, createdAt = 100): MemoryProjectionJob => createMemoryProjectionJob({
  projectionKind: "conversation_summary",
  scope: targetScope,
  canonicalRefs: revision.activeClaimIds,
  canonicalRevision: revision.revision,
  createdAt,
});

class FakeRepository {
  readonly jobs = new Map<string, MemoryProjectionJob>();
  conflictOnAcquire = false;
  conflictOnComplete = false;
  unavailable = false;

  async listPending(filter: { projectionKind?: MemoryProjectionJob["projectionKind"] }): Promise<MemoryProjectionJob[]> {
    if (this.unavailable) throw new Error("db unavailable");
    return [...this.jobs.values()].filter((job) => (job.status === "pending" || job.status === "failed")
      && (!filter.projectionKind || job.projectionKind === filter.projectionKind));
  }

  async reclaimExpired(now: number, ownerId: string, leaseUntil: number, kind?: MemoryProjectionJob["projectionKind"], limit = 5): Promise<MemoryProjectionJob[]> {
    if (this.unavailable) throw new Error("db unavailable");
    const reclaimed: MemoryProjectionJob[] = [];
    for (const job of this.jobs.values()) {
      if (reclaimed.length >= limit || job.status !== "running" || job.projectionKind !== kind || !job.lease || job.lease.leaseUntil > now) continue;
      const next = transitionMemoryProjectionJob(job, { type: "reclaim", ownerId, leaseUntil }, now);
      this.jobs.set(job.jobId, next);
      reclaimed.push(next);
    }
    return reclaimed;
  }

  async markRunning(jobId: string, expectedVersion: number, ownerId: string, now: number, leaseUntil: number) {
    if (this.unavailable) throw new Error("db unavailable");
    const job = this.jobs.get(jobId);
    if (!job || job.version !== expectedVersion || this.conflictOnAcquire) return { kind: "conflict" as const, job };
    const next = transitionMemoryProjectionJob(job, { type: "start", ownerId, leaseUntil }, now);
    this.jobs.set(jobId, next);
    return { kind: "updated" as const, job: next };
  }

  async markCompleted(jobId: string, expectedVersion: number, now: number) {
    if (this.unavailable) throw new Error("db unavailable");
    const job = this.jobs.get(jobId);
    if (!job || job.version !== expectedVersion || this.conflictOnComplete) {
      this.conflictOnComplete = false;
      return { kind: "conflict" as const, job };
    }
    const next = transitionMemoryProjectionJob(job, { type: "complete" }, now);
    this.jobs.set(jobId, next);
    return { kind: "updated" as const, job: next };
  }

  async markFailed(jobId: string, expectedVersion: number, errorCode: "CANONICAL_MISSING" | "CANONICAL_REVISION_CHANGED" | "SUMMARY_WRITE_FAILED" | "SCOPE_MISMATCH", now: number) {
    if (this.unavailable) throw new Error("db unavailable");
    const job = this.jobs.get(jobId);
    if (!job || job.version !== expectedVersion) return { kind: "conflict" as const, job };
    const next = transitionMemoryProjectionJob(job, { type: "fail", errorCode }, now);
    this.jobs.set(jobId, next);
    return { kind: "updated" as const, job: next };
  }
}

const createWriter = (summaries: ConversationSummaryRecord[]) => ({
  async appendMany(records: readonly ConversationSummaryRecord[]) {
    summaries.push(...records);
    return { success: true };
  },
});

let repository = new FakeRepository();
let summaries: ConversationSummaryRecord[] = [];
const job = makeJob();
repository.jobs.set(job.jobId, job);
let diagnostics = await runPendingConversationSummaryProjections({
  repository,
  summaryWriter: createWriter(summaries),
  claims,
  summaries,
  ownerId: "runner-a",
  now: () => 100,
});
assert.equal(diagnostics.jobsAttempted, 1);
assert.equal(diagnostics.summaryWrites, 1);
assert.equal(diagnostics.completed, 1);
assert.equal(repository.jobs.get(job.jobId)?.status, "completed");

repository = new FakeRepository();
summaries = [];
const currentJob = makeJob();
repository.jobs.set(currentJob.jobId, currentJob);
createWriter(summaries).appendMany([{
  id: "current-summary",
  ...scope,
  summary: "- [用户陈述] statement-claim-runner",
  canonicalRevision: revision.revision,
  sourceMessageIds: ["message-claim-runner"],
  sourceClaimIds: [...revision.activeClaimIds],
  generatedAt: 99,
  generator: "test",
  projectionVersion: 2,
  status: "active",
  schemaVersion: 1,
}]);
diagnostics = await runPendingConversationSummaryProjections({
  repository,
  summaryWriter: createWriter(summaries),
  claims,
  summaries,
  ownerId: "runner-a",
  now: () => 100,
});
assert.equal(diagnostics.skippedCurrent, 1);
assert.equal(diagnostics.summaryWrites, 0);
assert.equal(repository.jobs.get(currentJob.jobId)?.status, "completed");

repository = new FakeRepository();
summaries = [];
const crashJob = makeJob();
repository.jobs.set(crashJob.jobId, crashJob);
repository.conflictOnComplete = true;
let clock = 100;
diagnostics = await runPendingConversationSummaryProjections({
  repository,
  summaryWriter: createWriter(summaries),
  claims,
  summaries,
  ownerId: "runner-a",
  now: () => clock,
  leaseDurationMs: 1_000,
});
assert.equal(diagnostics.summaryWrites, 1);
assert.equal(diagnostics.conflicts, 1);
assert.equal(summaries.length, 1);
clock = 2_000;
diagnostics = await runPendingConversationSummaryProjections({
  repository,
  summaryWriter: createWriter(summaries),
  claims,
  summaries,
  ownerId: "runner-b",
  now: () => clock,
  leaseDurationMs: 1_000,
});
assert.equal(diagnostics.skippedCurrent, 1, "write-success/status-crash is recovered by metadata");
assert.equal(diagnostics.summaryWrites, 0);
assert.equal(repository.jobs.get(crashJob.jobId)?.status, "completed");

repository = new FakeRepository();
repository.conflictOnAcquire = true;
const conflictJob = makeJob();
repository.jobs.set(conflictJob.jobId, conflictJob);
diagnostics = await runPendingConversationSummaryProjections({ repository, claims, summaries: [], ownerId: "runner-b", now: () => 100 });
assert.equal(diagnostics.conflicts, 1);
assert.equal(diagnostics.jobsAttempted, 0);

repository = new FakeRepository();
const staleJob = makeJob();
repository.jobs.set(staleJob.jobId, staleJob);
diagnostics = await runPendingConversationSummaryProjections({
  repository, claims: [{ ...claim("claim-runner"), statement: "changed" }], summaries: [], ownerId: "runner-a", now: () => 100,
});
assert.equal(diagnostics.staleRevisions, 1);
assert.equal(repository.jobs.get(staleJob.jobId)?.status, "failed");

repository = new FakeRepository();
const missingJob = makeJob();
repository.jobs.set(missingJob.jobId, missingJob);
diagnostics = await runPendingConversationSummaryProjections({ repository, claims: [], summaries: [], ownerId: "runner-a", now: () => 100 });
assert.equal(diagnostics.canonicalMissing, 1);
assert.equal(repository.jobs.get(missingJob.jobId)?.status, "failed");

repository = new FakeRepository();
const failedJob = { ...makeJob(), status: "failed" as const, lastErrorCode: "SUMMARY_WRITE_FAILED" as const, version: 2, updatedAt: 101 };
repository.jobs.set(failedJob.jobId, failedJob);
diagnostics = await runPendingConversationSummaryProjections({ repository, claims, summaries: [], ownerId: "runner-a", now: () => 100 });
assert.equal(diagnostics.jobsQueried, 0, "runner does not infinitely retry failed jobs");

repository = new FakeRepository();
const cappedJobs = Array.from({ length: 10 }, (_, index) => makeJob({ ...scope, relationId: `relation-${index}`, conversationId: `direct:relation-${index}` }, index));
cappedJobs.forEach((candidate) => repository.jobs.set(candidate.jobId, candidate));
diagnostics = await runPendingConversationSummaryProjections({ repository, claims, summaries: [], ownerId: "runner-a", maxJobs: 3, now: () => 100 });
assert.equal(diagnostics.jobsQueried, 3);
assert.equal(diagnostics.jobsAttempted, 3);
assert.equal(diagnostics.claimsLoadCount, 1);
assert.equal(diagnostics.summariesLoadCount, 1);

repository = new FakeRepository();
repository.unavailable = true;
diagnostics = await runPendingConversationSummaryProjections({ repository, claims, summaries: [], ownerId: "runner-a", now: () => 100 });
assert.equal(diagnostics.databaseAvailable, false);

console.log("memory projection runner tests passed");
