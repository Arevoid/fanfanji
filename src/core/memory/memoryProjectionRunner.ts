import { createId } from "../id/createId";
import { loadKnowledgeClaims } from "../storage/repositories/characterKnowledgeRepository";
import { conversationSummaryRepository, loadConversationSummaries } from "../storage/repositories/conversationSummaryRepository";
import {
  memoryProjectionJobRepository,
  type MemoryProjectionJobIndexedDbRepository,
} from "../storage/repositories/memoryProjectionJobRepository";
import type { MemoryProjectionJob } from "../../domain/memory/memoryProjectionJob";
import type { ConversationSummaryRecord, KnowledgeClaim } from "../../domain/characterKnowledge/characterKnowledgeTypes";
import { executeConversationSummaryProjection } from "./memoryConversationSummaryProjectionExecutor";

export const MEMORY_PROJECTION_RUNNER_CAP = 5;
export const MEMORY_PROJECTION_LEASE_DURATION_MS = 45_000;
const runtimeOwnerId = createId("memory-projection-runner");

type RunnerRepository = Pick<MemoryProjectionJobIndexedDbRepository, "listPending" | "reclaimExpired" | "markRunning" | "markCompleted" | "markFailed">;
type SummaryWriter = {
  appendMany: (records: readonly ConversationSummaryRecord[]) => { success: boolean } | Promise<{ success: boolean }>;
};

export interface MemoryProjectionRunnerOptions {
  repository?: RunnerRepository;
  summaryWriter?: SummaryWriter;
  ownerId?: string;
  now?: () => number;
  maxJobs?: number;
  leaseDurationMs?: number;
  claims?: readonly KnowledgeClaim[];
  summaries?: readonly ConversationSummaryRecord[];
}

export interface MemoryProjectionRunnerDiagnostics {
  databaseAvailable: boolean;
  jobsQueried: number;
  jobsAttempted: number;
  completed: number;
  failed: number;
  conflicts: number;
  staleRevisions: number;
  canonicalMissing: number;
  skippedCurrent: number;
  summaryWrites: number;
  claimsLoadCount: number;
  summariesLoadCount: number;
  databaseErrors: number;
}

const emptyDiagnostics = (): MemoryProjectionRunnerDiagnostics => ({
  databaseAvailable: true,
  jobsQueried: 0,
  jobsAttempted: 0,
  completed: 0,
  failed: 0,
  conflicts: 0,
  staleRevisions: 0,
  canonicalMissing: 0,
  skippedCurrent: 0,
  summaryWrites: 0,
  claimsLoadCount: 0,
  summariesLoadCount: 0,
  databaseErrors: 0,
});

const byOldest = (left: MemoryProjectionJob, right: MemoryProjectionJob): number =>
  (left.createdAt - right.createdAt) || (left.updatedAt - right.updatedAt) || left.jobId.localeCompare(right.jobId);

const recordFailure = (diagnostics: MemoryProjectionRunnerDiagnostics, errorCode: string): void => {
  diagnostics.failed += 1;
  if (errorCode === "CANONICAL_REVISION_CHANGED") diagnostics.staleRevisions += 1;
  if (errorCode === "CANONICAL_MISSING") diagnostics.canonicalMissing += 1;
};

/** Performs one bounded, provider-free durable projection drain. */
export async function runPendingConversationSummaryProjections(
  options: MemoryProjectionRunnerOptions = {},
): Promise<MemoryProjectionRunnerDiagnostics> {
  const diagnostics = emptyDiagnostics();
  const repository = options.repository || memoryProjectionJobRepository;
  const summaryWriter = options.summaryWriter || conversationSummaryRepository;
  const now = options.now || (() => Date.now());
  const ownerId = options.ownerId || runtimeOwnerId;
  const maxJobs = Math.max(1, Math.floor(options.maxJobs ?? MEMORY_PROJECTION_RUNNER_CAP));
  const leaseDurationMs = Math.max(1_000, Math.floor(options.leaseDurationMs ?? MEMORY_PROJECTION_LEASE_DURATION_MS));
  const startedAt = now();
  let candidates: MemoryProjectionJob[];
  try {
    const reclaimed = await repository.reclaimExpired(
      startedAt,
      ownerId,
      startedAt + leaseDurationMs,
      "conversation_summary",
      maxJobs,
    );
    const pending = await repository.listPending({ projectionKind: "conversation_summary" });
    // The shared repository query also exposes historical failed records for
    // diagnostics/retry tooling. This first runner intentionally processes
    // only fresh pending jobs; failed records require an explicit future retry
    // policy and must not be retried on every startup.
    candidates = [...reclaimed, ...pending.filter((job) => job.status === "pending")].sort(byOldest).slice(0, maxJobs);
    diagnostics.jobsQueried = candidates.length;
  } catch {
    diagnostics.databaseAvailable = false;
    diagnostics.databaseErrors += 1;
    return diagnostics;
  }
  if (candidates.length === 0) return diagnostics;

  const claims = options.claims || loadKnowledgeClaims().value;
  diagnostics.claimsLoadCount = 1;
  const summaries = options.summaries || loadConversationSummaries().value;
  diagnostics.summariesLoadCount = 1;

  for (const candidate of candidates) {
    let running = candidate;
    if (candidate.status === "pending") {
      let acquired;
      try {
        acquired = await repository.markRunning(candidate.jobId, candidate.version, ownerId, now(), now() + leaseDurationMs);
      } catch {
        diagnostics.databaseAvailable = false;
        diagnostics.databaseErrors += 1;
        continue;
      }
      if (acquired.kind !== "updated") {
        diagnostics.conflicts += 1;
        continue;
      }
      running = acquired.job;
    }
    diagnostics.jobsAttempted += 1;
    const result = await executeConversationSummaryProjection({
      job: running,
      claims,
      summaries,
      now: now(),
      writeSummary: async (summary) => summaryWriter.appendMany([summary]),
    });
    if (result.kind === "written") diagnostics.summaryWrites += 1;
    if (result.kind === "current") diagnostics.skippedCurrent += 1;
    if (result.kind === "failed") {
      recordFailure(diagnostics, result.errorCode);
      try {
        const failed = await repository.markFailed(running.jobId, running.version, result.errorCode, now());
        if (failed.kind === "conflict") diagnostics.conflicts += 1;
      } catch {
        diagnostics.databaseAvailable = false;
        diagnostics.databaseErrors += 1;
      }
      continue;
    }
    try {
      const completed = await repository.markCompleted(running.jobId, running.version, now());
      if (completed.kind === "updated") diagnostics.completed += 1;
      else diagnostics.conflicts += 1;
    } catch {
      diagnostics.databaseAvailable = false;
      diagnostics.databaseErrors += 1;
    }
  }
  return diagnostics;
}
