import type { KnowledgeClaim } from "./characterKnowledgeTypes";
export const MEMORY_ARCHIVE_AFTER_MS = 90 * 86_400_000;
export const isProtectedKnowledge = (claim: KnowledgeClaim) => claim.coreMemory === true || (claim.importance ?? 4) >= 8
  || claim.kind === "preference" || claim.kind === "plan" || ["present", "timeless"].includes(claim.temporalStatus);
/** Archiving changes ranking, never original text, evidence or physical retention. */
export function maintainKnowledgeRetention(claims: readonly KnowledgeClaim[], now: number): KnowledgeClaim[] {
  return claims.map((claim) => {
    if (isProtectedKnowledge(claim)) { const { archivedAt: _archivedAt, ...record } = claim; return record; }
    return claim.status === "active" && claim.temporalStatus === "past" && now - (claim.occurredAt ?? claim.source.statementAt ?? claim.recordedAt) >= MEMORY_ARCHIVE_AFTER_MS
      ? { ...claim, archivedAt: claim.archivedAt ?? now } : claim;
  });
}
