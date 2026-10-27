import type { KnowledgeClaim } from "./characterKnowledgeTypes";
/** Read-time boundary: later changes are history; withdrawn/corrected sources are never resurrected. */
export function projectKnowledgeReadFrame(claims: readonly KnowledgeClaim[], knownAt?: number): KnowledgeClaim[] {
  if (knownAt === undefined) return [...claims];
  return claims.flatMap((claim) => {
    if ((claim.source.statementAt ?? claim.recordedAt) > knownAt || claim.status === "retracted" || claim.retractionReason === "corrected"
      || claim.validFrom !== undefined && claim.validFrom > knownAt) return [];
    const successor = claims.find((record) => record.id === claim.supersededById && record.characterId === claim.characterId
      && record.relationId === claim.relationId && record.userIdentityId === claim.userIdentityId && record.conversationId === claim.conversationId);
    const later = claim.validTo !== undefined ? claim.validTo > knownAt : successor && (successor.source.statementAt ?? successor.recordedAt) > knownAt;
    return [{ ...claim, ...(later && ["fact_changed", "plan_progressed"].includes(claim.retractionReason || "")
      ? { validTo: undefined, supersededById: undefined, retractionReason: undefined } : {}) }];
  });
}
