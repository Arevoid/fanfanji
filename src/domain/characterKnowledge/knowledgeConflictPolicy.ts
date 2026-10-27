import type { CharacterTruthScope, KnowledgeClaim } from "./characterKnowledgeTypes";
import { isCompleteTruthScope, normalizeKnowledgeClaim } from "./knowledgeWritePolicy";
import { evolveKnowledgeClaims } from "./knowledgeEvolution";

const normalizeStatement = (value: string): string => value.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
const normalizeMeaning = (value: string): string => normalizeStatement(value)
  .replace(/[\s\u200b，。！？、,.!?~～…；;：“”‘’"'（）()【】\[\]{}]/gu, "");

const truthRank = (claim: KnowledgeClaim): number => {
  if (claim.status === "active" && claim.truthStatus === "confirmed") return 0;
  if (claim.status === "active" && claim.truthStatus === "asserted") return 1;
  if (claim.status === "active" && claim.truthStatus === "inferred") return 2;
  if (claim.status === "active") return 3;
  return 4;
};

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
    claim.conversationId || "",
    claim.source.evidenceKey,
    claim.kind,
    claim.admissionStatus || "legacy",
    claim.source.app === "diary" ? "private_diary" : "shared_source",
    claim.status,
    claim.temporalStatus,
    claim.supersededById || "",
    claim.validTo ?? "",
    normalizeStatement(claim.statement),
  ].join("\u0000");
}

export function deduplicateKnowledgeClaims(claims: readonly KnowledgeClaim[]): KnowledgeClaim[] {
  const ids = new Set<string>();
  const records = new Map<string, KnowledgeClaim>();
  for (const claim of claims) {
    const key = getKnowledgeClaimIdempotencyKey(claim);
    if (ids.has(claim.id)) continue;
    ids.add(claim.id);
    const previous = records.get(key);
    if (!previous) { records.set(key, claim); continue; }
    const winner = truthRank(claim) < truthRank(previous) ? claim : previous;
    const other = winner === claim ? previous : claim;
    records.set(key, { ...winner,
      ...(winner.recallDisabled || other.recallDisabled ? {recallDisabled:true}:{}),
      ...(winner.coreMemory || other.coreMemory ? {coreMemory:true}:{}),
      mergedClaimIds: [...new Set([...(winner.mergedClaimIds || []), ...(other.mergedClaimIds || []), other.id])].filter((id) => id !== winner.id),
      source: { ...winner.source, messageIds: [...new Set([...(winner.source.messageIds || []), ...(other.source.messageIds || [])])],
        evidenceGroups: [...(winner.source.evidenceGroups || [winner.source.messageIds || []]), ...(other.source.evidenceGroups || [other.source.messageIds || []])].filter((group) => group.length > 0),
        messageRevisions: { ...other.source.messageRevisions, ...winner.source.messageRevisions } },
    });
  }
  return [...records.values()];
}

/**
 * Collapses historical copies that describe the same scoped proposition but
 * were produced with different evidence keys or generated IDs. Provenance is
 * merged into the surviving claim, so cleanup removes visual/prompt repeats
 * without discarding which source messages supported the fact.
 */
export function deduplicateKnowledgeClaimsByMeaning(claims: readonly KnowledgeClaim[]): KnowledgeClaim[] {
  const records = new Map<string, KnowledgeClaim>();
  for (const claim of claims) {
    const key = [
      claim.relationId,
      claim.characterId,
      claim.userIdentityId,
      claim.conversationId || "",
      claim.kind,
      claim.admissionStatus || "legacy",
      claim.source.app === "diary" ? "private_diary" : "shared_source",
      claim.subject,
      claim.status,
      claim.supersededById || "",
      claim.validTo ?? "",
      claim.temporalStatus === "past" ? (claim.source.eventId || claim.occurredAt || claim.source.evidenceKey) : "",
      normalizeMeaning(claim.statement),
    ].join("\u0000");
    const previous = records.get(key);
    if (!previous) {
      records.set(key, claim);
      continue;
    }
    const winner = truthRank(claim) < truthRank(previous)
      || (truthRank(claim) === truthRank(previous) && claim.recordedAt >= previous.recordedAt)
      ? claim
      : previous;
    const other = winner === claim ? previous : claim;
    const mergedMessageIds = Array.from(new Set([...(winner.source.messageIds || []), ...(other.source.messageIds || [])]));
    records.set(key, {
      ...winner,
      ...(winner.recallDisabled || other.recallDisabled ? {recallDisabled:true}:{}),
      ...(winner.coreMemory || other.coreMemory ? {coreMemory:true}:{}),
      mergedClaimIds: [...new Set([...(winner.mergedClaimIds || []), ...(other.mergedClaimIds || []), other.id])]
        .filter((id) => id !== winner.id),
      source: {
        ...winner.source,
          messageRevisions: { ...other.source.messageRevisions, ...winner.source.messageRevisions },
        ...(mergedMessageIds.length > 0 ? { messageIds: mergedMessageIds } : {}),
        evidenceGroups: [...(winner.source.evidenceGroups || [winner.source.messageIds || []]),
          ...(other.source.evidenceGroups || [other.source.messageIds || []])].filter((group) => group.length > 0),
      },
      userConfirmed: winner.userConfirmed || other.userConfirmed,
      recordedAt: Math.max(winner.recordedAt, other.recordedAt),
      ...(winner.occurredAt === undefined && other.occurredAt !== undefined ? { occurredAt: other.occurredAt } : {}),
    });
  }
  return Array.from(records.values());
}

export function appendKnowledgeClaims(existing: readonly KnowledgeClaim[], incoming: readonly KnowledgeClaim[]): KnowledgeClaim[] {
  return deduplicateKnowledgeClaims(evolveKnowledgeClaims(existing, incoming));
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
  mode: "correction" | "change" = "correction",
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
      truthStatus: mode === "change" ? claim.truthStatus : "retracted" as const,
      status: mode === "change" ? claim.status : "retracted" as const,
      supersededById: normalizedReplacement.id,
      ...(mode === "change" ? { validTo: normalizedReplacement.recordedAt } : {}),
      retractionReason: mode === "change" ? "fact_changed" : "superseded",
    }
    : claim);
  return appendKnowledgeClaims(retired, [{ ...normalizedReplacement, supersedesId: previous.id,
    ...(previous.coreMemory ? { coreMemory: true } : {}),
    ...(previous.factIdentity && previous.subject === normalizedReplacement.subject ? { factIdentity: previous.factIdentity } : {}) }]);
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
  return claims.map((claim) => {
    if (!claim.source.messageIds?.some((id) => removed.has(id)) || (scope && !isExactTruthScope(claim, scope))) return claim;
    const groups = (claim.source.evidenceGroups || [claim.source.messageIds])
      .filter((group) => group.length > 0 && !group.some((id) => removed.has(id)));
    if (groups.length > 0) return { ...claim, source: { ...claim.source, evidenceGroups: groups,
      messageIds: [...new Set(groups.flat())] } };
    return { ...claim, truthStatus: "retracted" as const, status: "retracted" as const, retractionReason: reason };
  });
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
