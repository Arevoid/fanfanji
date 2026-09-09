import type { KnowledgeClaim } from "../characterKnowledge/characterKnowledgeTypes";
import { isExactTruthScope } from "../characterKnowledge/knowledgeConflictPolicy";
import { deriveCanonicalClaimSetRevision } from "./memoryCanonicalRevision";
import type { MemoryProcessingScope } from "./memorySourceProcessingCursor";

/**
 * One in-memory view of the final canonical state used by synchronous and
 * durable Summary projections. It contains no prompt or transcript body that
 * is persisted by the projection job.
 */
export interface CanonicalMemoryCommitSnapshot {
  scope: MemoryProcessingScope;
  claims: readonly KnowledgeClaim[];
  activeClaims: readonly KnowledgeClaim[];
  activeClaimIds: readonly string[];
  sourceMessageIds: readonly string[];
  canonicalRevision: string;
}

export function buildCanonicalMemoryCommitSnapshot(input: {
  scope: MemoryProcessingScope;
  claims: readonly KnowledgeClaim[];
}): CanonicalMemoryCommitSnapshot {
  const claims = Array.from(input.claims);
  const canonical = deriveCanonicalClaimSetRevision({ scope: input.scope, claims });
  const activeClaimsById = new Map<string, KnowledgeClaim>();
  claims
    .filter((claim) => claim.status === "active" && isExactTruthScope(claim, input.scope))
    .forEach((claim) => activeClaimsById.set(claim.id, claim));
  const activeClaims = Array.from(activeClaimsById.values()).sort((left, right) => left.id.localeCompare(right.id));
  const sourceMessageIds = Array.from(new Set(activeClaims.flatMap((claim) => claim.source.messageIds || []).filter(Boolean))).sort();
  return {
    scope: input.scope,
    claims,
    activeClaims,
    activeClaimIds: Array.from(new Set(canonical.activeClaimIds)),
    sourceMessageIds,
    canonicalRevision: canonical.revision,
  };
}
