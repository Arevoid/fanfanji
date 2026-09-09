import { isExactTruthScope } from "../../domain/characterKnowledge/knowledgeConflictPolicy";
import type { ConversationSummaryRecord, KnowledgeClaim } from "../../domain/characterKnowledge/characterKnowledgeTypes";
import { createConversationSummaryRecord } from "../../domain/characterKnowledge/conversationSummaryProjection";
import type { MemoryProjectionErrorCode, MemoryProjectionJob } from "../../domain/memory/memoryProjectionJob";
import { buildCanonicalMemoryCommitSnapshot } from "../../domain/memory/canonicalMemoryCommitSnapshot";

type WriteResult = { success: boolean } | boolean | void;

export type ConversationSummaryProjectionResult =
  | { kind: "current"; summary: ConversationSummaryRecord }
  | { kind: "written"; summary: ConversationSummaryRecord }
  | { kind: "failed"; errorCode: MemoryProjectionErrorCode };

export interface ConversationSummaryProjectionInput {
  job: MemoryProjectionJob;
  claims: readonly KnowledgeClaim[];
  summaries: readonly ConversationSummaryRecord[];
  now: number;
  writeSummary: (summary: ConversationSummaryRecord) => WriteResult | Promise<WriteResult>;
}

const sameRefs = (left: readonly string[], right: readonly string[]): boolean => {
  const normalizedLeft = [...new Set(left)].sort();
  const normalizedRight = [...new Set(right)].sort();
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((ref, index) => ref === normalizedRight[index]);
};

const didWrite = (result: WriteResult): boolean => result !== false
  && (typeof result !== "object" || result === null || result.success === true);

const findCurrentSummary = (
  summaries: readonly ConversationSummaryRecord[],
  job: MemoryProjectionJob,
  activeClaimIds: readonly string[],
): ConversationSummaryRecord | undefined => summaries.find((summary) =>
  summary.status === "active"
  && isExactTruthScope(summary, job.scope)
  && summary.canonicalRevision === job.canonicalRevision
  && sameRefs(summary.sourceClaimIds, activeClaimIds));

function validateCanonicalSnapshot(job: MemoryProjectionJob, claims: readonly KnowledgeClaim[]):
  | { kind: "failed"; errorCode: MemoryProjectionErrorCode }
  | { kind: "valid"; activeClaims: KnowledgeClaim[]; activeClaimIds: string[]; sourceMessageIds: readonly string[] } {
  const jobRefs = new Set(job.canonicalRefs);
  const referencedClaims = claims.filter((claim) => jobRefs.has(claim.id));
  if (referencedClaims.some((claim) => !isExactTruthScope(claim, job.scope))) {
    return { kind: "failed", errorCode: "SCOPE_MISMATCH" };
  }
  if (referencedClaims.length !== jobRefs.size) {
    return { kind: "failed", errorCode: "CANONICAL_MISSING" };
  }
  const snapshot = buildCanonicalMemoryCommitSnapshot({ scope: job.scope, claims });
  if (snapshot.activeClaimIds.length === 0) {
    return { kind: "failed", errorCode: "CANONICAL_REVISION_CHANGED" };
  }
  if (snapshot.canonicalRevision !== job.canonicalRevision || !sameRefs(snapshot.activeClaimIds, job.canonicalRefs)) {
    return { kind: "failed", errorCode: "CANONICAL_REVISION_CHANGED" };
  }
  const activeClaims = snapshot.activeClaims.filter((claim) => jobRefs.has(claim.id));
  if (activeClaims.length !== jobRefs.size || activeClaims.length !== snapshot.activeClaimIds.length) {
    return { kind: "failed", errorCode: "CANONICAL_MISSING" };
  }
  return { kind: "valid", activeClaims, activeClaimIds: [...snapshot.activeClaimIds], sourceMessageIds: snapshot.sourceMessageIds };
}

/** Executes one local, provider-free ConversationSummary projection after lease acquisition. */
export async function executeConversationSummaryProjection(
  input: ConversationSummaryProjectionInput,
): Promise<ConversationSummaryProjectionResult> {
  if (input.job.projectionKind !== "conversation_summary") return { kind: "failed", errorCode: "SCOPE_MISMATCH" };
  const validation = validateCanonicalSnapshot(input.job, input.claims);
  if (validation.kind === "failed") return validation;
  const existing = findCurrentSummary(input.summaries, input.job, validation.activeClaimIds);
  if (existing) return { kind: "current", summary: existing };
  const sourceMessageIds = validation.sourceMessageIds;
  if (sourceMessageIds.length === 0) return { kind: "failed", errorCode: "CANONICAL_MISSING" };
  const summary = createConversationSummaryRecord({
    id: `conversation-summary:${input.job.jobId}`,
    scope: input.job.scope,
    claims: validation.activeClaims,
    sourceMessageIds,
    canonicalRevision: input.job.canonicalRevision,
    generatedAt: input.now,
    generator: "memory-projection.conversation-summary.v1",
  });
  if (!summary) return { kind: "failed", errorCode: "CANONICAL_MISSING" };
  try {
    const write = await input.writeSummary(summary);
    return didWrite(write) ? { kind: "written", summary } : { kind: "failed", errorCode: "SUMMARY_WRITE_FAILED" };
  } catch {
    return { kind: "failed", errorCode: "SUMMARY_WRITE_FAILED" };
  }
}
