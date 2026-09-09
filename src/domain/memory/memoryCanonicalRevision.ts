import type { KnowledgeClaim } from "../characterKnowledge/characterKnowledgeTypes";
import { isExactTruthScope } from "../characterKnowledge/knowledgeConflictPolicy";
import type { MemoryProcessingScope } from "./memorySourceProcessingCursor";

/** Metadata used to derive a compact, deterministic revision without storing claim bodies. */
const claimRevisionMaterial = (claim: KnowledgeClaim): string => JSON.stringify({
  id: claim.id,
  status: claim.status,
  truthStatus: claim.truthStatus,
  temporalStatus: claim.temporalStatus,
  recordedAt: claim.recordedAt,
  occurredAt: claim.occurredAt ?? null,
  validFrom: claim.validFrom ?? null,
  validTo: claim.validTo ?? null,
  supersedesId: claim.supersedesId ?? null,
  supersededById: claim.supersededById ?? null,
  source: {
    kind: claim.source.kind,
    evidenceKey: claim.source.evidenceKey,
    producer: claim.source.producer,
    eventId: claim.source.eventId ?? null,
    storyId: claim.source.storyId ?? null,
    sourceRecordId: claim.source.sourceRecordId ?? null,
    messageIds: [...(claim.source.messageIds || [])].sort(),
  },
  // The text is fingerprinted, never included in the returned revision.
  statement: claim.statement,
});

/** Small deterministic non-cryptographic fingerprint; this is not a security primitive. */
const fingerprint = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export interface CanonicalClaimSetSnapshot {
  scope: MemoryProcessingScope;
  claims: readonly KnowledgeClaim[];
}

export interface CanonicalClaimSetRevision {
  revision: string;
  activeClaimIds: readonly string[];
  claimCount: number;
}

/**
 * Derives revision from the repository's real claim fields. IDs alone are not
 * enough because retraction, supersession, source changes and in-place claim
 * edits must invalidate a projection. The result contains only a bounded
 * fingerprint and IDs; it never contains statement/evidence text.
 */
export function deriveCanonicalClaimSetRevision(input: CanonicalClaimSetSnapshot): CanonicalClaimSetRevision {
  const scopedClaims = input.claims.filter((claim) => isExactTruthScope(claim, input.scope));
  const descriptors = Array.from(new Set(scopedClaims.map((claim) => `${claim.id}:${fingerprint(claimRevisionMaterial(claim))}`))).sort();
  const activeClaimIds = scopedClaims
    .filter((claim) => claim.status === "active")
    .map((claim) => claim.id)
    .sort();
  return {
    revision: `claims:${fingerprint(descriptors.join("|"))}:${descriptors.length}`,
    activeClaimIds,
    claimCount: scopedClaims.length,
  };
}
