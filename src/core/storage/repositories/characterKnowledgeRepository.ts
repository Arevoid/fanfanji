import type { CharacterTruthScope, KnowledgeClaim, KnowledgeSourceRef } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {
  appendKnowledgeClaims,
  deduplicateKnowledgeClaims,
  deduplicateKnowledgeClaimsByMeaning,
  isExactTruthScope,
  removeKnowledgeClaimsByRelations,
  retractKnowledgeClaimsBySourceMessageIds,
  retractKnowledgeClaimsBySourceStoryIds,
  retractKnowledgeClaim,
  supersedeKnowledgeClaim,
} from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { normalizeKnowledgeClaim } from "../../../domain/characterKnowledge/knowledgeWritePolicy";
import { markConversationSummariesStaleBySourceClaimIds } from "./conversationSummaryRepository";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

const loadRawClaims = (): StorageResult<unknown[]> => readArray<unknown>(storageKeys.characterKnowledgeClaims, []);

export function normalizeKnowledgeClaims(values: readonly unknown[]): KnowledgeClaim[] {
  return deduplicateKnowledgeClaimsByMeaning(deduplicateKnowledgeClaims(values
    .map(normalizeKnowledgeClaim)
    .filter((claim): claim is KnowledgeClaim => claim !== undefined)));
}

export const loadKnowledgeClaims = (): StorageResult<KnowledgeClaim[]> => {
  const result = loadRawClaims();
  return { ...result, value: normalizeKnowledgeClaims(result.value) };
};

export const saveKnowledgeClaims = (claims: readonly KnowledgeClaim[]): StorageWriteResult =>
  writeArray(storageKeys.characterKnowledgeClaims, normalizeKnowledgeClaims(claims));

const saveKnowledgeClaimsAfterMutation = (
  previous: readonly KnowledgeClaim[],
  next: readonly KnowledgeClaim[],
): StorageWriteResult => {
  const write = saveKnowledgeClaims(next);
  if (!write.success) return write;
  const nextById = new Map(next.map((claim) => [claim.id, claim]));
  const invalidatedSummaryClaimIds = previous
    .filter((claim) => claim.status === "active" && (!nextById.has(claim.id) || nextById.get(claim.id)?.status === "retracted"))
    .map((claim) => claim.id);
  if (invalidatedSummaryClaimIds.length > 0) {
    const summaryWrite = markConversationSummariesStaleBySourceClaimIds(invalidatedSummaryClaimIds);
    if (!summaryWrite.success) {
      // Retrieval also validates source claims, so a cache write failure never
      // turns a retracted claim back into usable truth.
      console.warn("[character truth] Failed to mark derived summaries stale:", summaryWrite.error);
    }
  }
  return write;
};

export const listByRelation = (
  scope: CharacterTruthScope,
  claims: readonly KnowledgeClaim[] = loadKnowledgeClaims().value,
): KnowledgeClaim[] => claims.filter((claim) => isExactTruthScope(claim, scope));

export const findBySource = (
  scope: CharacterTruthScope,
  source: Partial<Pick<KnowledgeSourceRef, "kind" | "evidenceKey" | "eventId" | "storyId" | "sourceRecordId">>,
  claims: readonly KnowledgeClaim[] = loadKnowledgeClaims().value,
): KnowledgeClaim[] => listByRelation(scope, claims).filter((claim) =>
  (source.kind === undefined || claim.source.kind === source.kind)
  && (source.evidenceKey === undefined || claim.source.evidenceKey === source.evidenceKey)
  && (source.eventId === undefined || claim.source.eventId === source.eventId)
  && (source.storyId === undefined || claim.source.storyId === source.storyId)
  && (source.sourceRecordId === undefined || claim.source.sourceRecordId === source.sourceRecordId));

export const appendToKnowledgeClaims = (
  existing: readonly KnowledgeClaim[],
  incoming: readonly KnowledgeClaim[],
): KnowledgeClaim[] => appendKnowledgeClaims(normalizeKnowledgeClaims(existing), normalizeKnowledgeClaims(incoming));

export const append = (claim: KnowledgeClaim): StorageWriteResult =>
  saveKnowledgeClaims(appendToKnowledgeClaims(loadKnowledgeClaims().value, [claim]));

export const appendMany = (claims: readonly KnowledgeClaim[]): StorageWriteResult =>
  saveKnowledgeClaims(appendToKnowledgeClaims(loadKnowledgeClaims().value, claims));

export const supersede = (
  scope: CharacterTruthScope,
  previousClaimId: string,
  replacement: KnowledgeClaim,
): StorageWriteResult => {
  const previous = loadKnowledgeClaims().value;
  return saveKnowledgeClaimsAfterMutation(previous, supersedeKnowledgeClaim(
    previous,
    scope,
    previousClaimId,
    replacement,
  ));
};

export const retract = (
  scope: CharacterTruthScope,
  claimId: string,
  reason: string,
): StorageWriteResult => {
  const previous = loadKnowledgeClaims().value;
  return saveKnowledgeClaimsAfterMutation(previous, retractKnowledgeClaim(previous, scope, claimId, reason));
};

export const remove = (
  scope: CharacterTruthScope,
  claimId: string,
): StorageWriteResult => {
  const previous = loadKnowledgeClaims().value;
  const target = previous.find((claim) => claim.id === claimId && isExactTruthScope(claim, scope));
  if (!target) return { success: false, error: "missing" };
  return saveKnowledgeClaimsAfterMutation(previous, previous.filter((claim) => claim.id !== claimId));
};

export const removeByRelations = (relationIds: readonly string[]): StorageWriteResult =>
  saveKnowledgeClaims(removeKnowledgeClaimsByRelations(loadKnowledgeClaims().value, relationIds));
export const retractBySourceMessageIds = (messageIds: readonly string[], scope?: CharacterTruthScope): StorageWriteResult =>
  (() => {
    const previous = loadKnowledgeClaims().value;
    return saveKnowledgeClaimsAfterMutation(previous, retractKnowledgeClaimsBySourceMessageIds(previous, messageIds, scope));
  })();
export const retractBySourceStoryIds = (storyIds: readonly string[]): StorageWriteResult => {
  const previous = loadKnowledgeClaims().value;
  return saveKnowledgeClaimsAfterMutation(previous, retractKnowledgeClaimsBySourceStoryIds(previous, storyIds));
};

export const characterKnowledgeRepository = {
  load: loadKnowledgeClaims,
  save: saveKnowledgeClaims,
  listByRelation,
  findBySource,
  append,
  appendMany,
  supersede,
  retract,
  remove,
  removeByRelations,
  retractBySourceMessageIds,
  retractBySourceStoryIds,
};
