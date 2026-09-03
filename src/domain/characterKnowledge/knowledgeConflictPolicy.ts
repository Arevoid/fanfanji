import type { CharacterTruthScope, KnowledgeClaim } from "./characterKnowledgeTypes";
import { isCompleteTruthScope, normalizeKnowledgeClaim } from "./knowledgeWritePolicy";

const normalizeStatement = (value: string): string => value.trim().replace(/\s+/gu, " ").toLocaleLowerCase();

export function isSameTruthScope(left: CharacterTruthScope, right: CharacterTruthScope): boolean {
  return left.relationId === right.relationId
    && left.characterId === right.characterId
    && left.userIdentityId === right.userIdentityId
    && (!left.conversationId || !right.conversationId || left.conversationId === right.conversationId);
}

/**
 * Strict scope equality for persisted truth and derived caches.
 *
 * `isSameTruthScope` remains available for legacy readers that need to compare
 * records before a conversation id was introduced. New writes, summaries and
 * prompt projections must never treat a missing conversation id as a wildcard.
 */
export function isExactTruthScope(left: CharacterTruthScope, right: CharacterTruthScope): boolean {
  return left.relationId === right.relationId
    && left.characterId === right.characterId
    && left.userIdentityId === right.userIdentityId
    && left.conversationId === right.conversationId;
}

export function getKnowledgeClaimIdempotencyKey(claim: KnowledgeClaim): string {
  return [
    claim.relationId,
    claim.characterId,
    claim.userIdentityId,
    claim.source.evidenceKey,
    claim.kind,
    normalizeStatement(claim.statement),
  ].join("\u0000");
}

export function deduplicateKnowledgeClaims(claims: readonly KnowledgeClaim[]): KnowledgeClaim[] {
  const ids = new Set<string>();
  const keys = new Set<string>();
  return claims.filter((claim) => {
    const key = getKnowledgeClaimIdempotencyKey(claim);
    if (ids.has(claim.id) || keys.has(key)) return false;
    ids.add(claim.id);
    keys.add(key);
    return true;
  });
}

export function appendKnowledgeClaims(existing: readonly KnowledgeClaim[], incoming: readonly KnowledgeClaim[]): KnowledgeClaim[] {
  return deduplicateKnowledgeClaims([...existing, ...incoming]);
}

export function retractKnowledgeClaim(
  claims: readonly KnowledgeClaim[],
  scope: CharacterTruthScope,
  claimId: string,
  reason: string,
): KnowledgeClaim[] {
  if (!isCompleteTruthScope(scope) || !reason.trim()) return [...claims];
  return claims.map((claim) => claim.id === claimId && isExactTruthScope(claim, scope)
    ? { ...claim, truthStatus: "retracted", status: "retracted", retractionReason: reason.trim() }
    : claim);
}

export function supersedeKnowledgeClaim(
  claims: readonly KnowledgeClaim[],
  scope: CharacterTruthScope,
  previousClaimId: string,
  replacement: KnowledgeClaim,
): KnowledgeClaim[] {
  const previous = claims.find((claim) => claim.id === previousClaimId && isExactTruthScope(claim, scope));
  const normalizedReplacement = normalizeKnowledgeClaim(replacement);
  if (!previous
    || previous.status !== "active"
    || !normalizedReplacement
    || !isExactTruthScope(previous, normalizedReplacement)
    || normalizedReplacement.id === previous.id
    || claims.some((claim) => claim.id === normalizedReplacement.id)) return [...claims];
  const retired = claims.map((claim) => claim.id === previous.id
    ? {
      ...claim,
      truthStatus: "retracted" as const,
      status: "retracted" as const,
      supersededById: normalizedReplacement.id,
      retractionReason: "superseded",
    }
    : claim);
  return appendKnowledgeClaims(retired, [{ ...normalizedReplacement, supersedesId: previous.id }]);
}

export const removeKnowledgeClaimsByRelations = (
  claims: readonly KnowledgeClaim[],
  relationIds: readonly string[],
): KnowledgeClaim[] => {
  const removed = new Set(relationIds);
  return claims.filter((claim) => !removed.has(claim.relationId));
};

/** Source deletion keeps the audit record but removes the claim from active truth. */
export const retractKnowledgeClaimsBySourceMessageIds = (
  claims: readonly KnowledgeClaim[],
  messageIds: readonly string[],
  scope?: CharacterTruthScope,
  reason = "source_message_deleted",
): KnowledgeClaim[] => {
  const removed = new Set(messageIds.filter(Boolean));
  if (removed.size === 0) return [...claims];
  return claims.map((claim) => claim.source.messageIds?.some((messageId) => removed.has(messageId))
    && (!scope || isExactTruthScope(claim, scope))
    ? {
      ...claim,
      truthStatus: "retracted" as const,
      status: "retracted" as const,
      retractionReason: reason,
    }
    : claim);
};

export const retractKnowledgeClaimsBySourceStoryIds = (
  claims: readonly KnowledgeClaim[],
  storyIds: readonly string[],
  reason = "source_offline_story_deleted",
): KnowledgeClaim[] => {
  const removed = new Set(storyIds.filter(Boolean));
  if (removed.size === 0) return [...claims];
  return claims.map((claim) => claim.source.storyId && removed.has(claim.source.storyId)
    ? {
      ...claim,
      truthStatus: "retracted" as const,
      status: "retracted" as const,
      retractionReason: reason,
    }
    : claim);
};
