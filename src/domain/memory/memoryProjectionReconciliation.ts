import { createMemoryProjectionJob, type MemoryProjectionJob, type MemoryProjectionKind } from "./memoryProjectionJob";
import type { CanonicalClaimSetRevision } from "./memoryCanonicalRevision";
import type { MemoryProcessingScope } from "./memorySourceProcessingCursor";

export interface CanonicalProjectionSnapshot extends CanonicalClaimSetRevision {
  scope: MemoryProcessingScope;
}

export interface SummaryProjectionMetadata {
  scope: MemoryProcessingScope;
  status: "active" | "stale" | "retracted";
  sourceClaimIds: readonly string[];
  /** Future metadata; existing summaries do not persist this field yet. */
  canonicalRevision?: string;
}

export interface MemoryProjectionReconciliationInput {
  canonical: CanonicalProjectionSnapshot;
  summary?: SummaryProjectionMetadata;
  existingJobs: readonly MemoryProjectionJob[];
  now: number;
  projectionKind?: MemoryProjectionKind;
}

export type MemoryProjectionReconciliationResult =
  | { kind: "no_active_claims" }
  | { kind: "current"; revision: string }
  | { kind: "already_scheduled"; job: MemoryProjectionJob }
  | { kind: "missing"; job: MemoryProjectionJob };

const sameRefs = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && [...left].sort().every((ref, index) => ref === [...right].sort()[index]);

const sameScope = (left: MemoryProcessingScope, right: MemoryProcessingScope): boolean =>
  left.characterId === right.characterId
  && left.relationId === right.relationId
  && left.userIdentityId === right.userIdentityId
  && left.conversationId === right.conversationId;

/**
 * Pure startup plan for one active scope. It creates at most one logical job,
 * never scans chat transcript, and never performs storage or Provider work.
 */
export function reconcileConversationSummaryProjection(input: MemoryProjectionReconciliationInput): MemoryProjectionReconciliationResult {
  const projectionKind = input.projectionKind || "conversation_summary";
  if (input.canonical.activeClaimIds.length === 0) return { kind: "no_active_claims" };
  const summaryCurrent = input.summary
    && sameScope(input.summary.scope, input.canonical.scope)
    && input.summary.status === "active"
    && input.summary.canonicalRevision === input.canonical.revision
    && sameRefs(input.summary.sourceClaimIds, input.canonical.activeClaimIds);
  if (summaryCurrent) return { kind: "current", revision: input.canonical.revision };
  const candidate = createMemoryProjectionJob({
    projectionKind,
    scope: input.canonical.scope,
    canonicalRefs: input.canonical.activeClaimIds,
    canonicalRevision: input.canonical.revision,
    createdAt: input.now,
  });
  const existing = input.existingJobs.find((job) => job.jobId === candidate.jobId);
  return existing ? { kind: "already_scheduled", job: existing } : { kind: "missing", job: candidate };
}
