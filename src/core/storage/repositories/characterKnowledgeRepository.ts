import type { CharacterTruthScope, KnowledgeClaim, KnowledgeSourceRef } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {
  appendKnowledgeClaims,
  deduplicateKnowledgeClaims,
  isSameTruthScope,
  removeKnowledgeClaimsByRelations,
  retractKnowledgeClaimsBySourceMessageIds,
  retractKnowledgeClaimsBySourceStoryIds,
  retractKnowledgeClaim,
  supersedeKnowledgeClaim,
} from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { normalizeKnowledgeClaim } from "../../../domain/characterKnowledge/knowledgeWritePolicy";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

const loadRawClaims = (): StorageResult<unknown[]> => readArray<unknown>(storageKeys.characterKnowledgeClaims, []);

export function normalizeKnowledgeClaims(values: readonly unknown[]): KnowledgeClaim[] {
  return deduplicateKnowledgeClaims(values
    .map(normalizeKnowledgeClaim)
    .filter((claim): claim is KnowledgeClaim => claim !== undefined));
}

export const loadKnowledgeClaims = (): StorageResult<KnowledgeClaim[]> => {
  const result = loadRawClaims();
  return { ...result, value: normalizeKnowledgeClaims(result.value) };
};

export const saveKnowledgeClaims = (claims: readonly KnowledgeClaim[]): StorageWriteResult =>
  writeArray(storageKeys.characterKnowledgeClaims, normalizeKnowledgeClaims(claims));

export const listByRelation = (
  scope: CharacterTruthScope,
  claims: readonly KnowledgeClaim[] = loadKnowledgeClaims().value,
): KnowledgeClaim[] => claims.filter((claim) => isSameTruthScope(claim, scope));

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
): StorageWriteResult => saveKnowledgeClaims(supersedeKnowledgeClaim(
  loadKnowledgeClaims().value,
  scope,
  previousClaimId,
  replacement,
));

export const retract = (
  scope: CharacterTruthScope,
  claimId: string,
  reason: string,
): StorageWriteResult => saveKnowledgeClaims(retractKnowledgeClaim(loadKnowledgeClaims().value, scope, claimId, reason));

export const removeByRelations = (relationIds: readonly string[]): StorageWriteResult =>
  saveKnowledgeClaims(removeKnowledgeClaimsByRelations(loadKnowledgeClaims().value, relationIds));
export const retractBySourceMessageIds = (messageIds: readonly string[], scope?: CharacterTruthScope): StorageWriteResult =>
  saveKnowledgeClaims(retractKnowledgeClaimsBySourceMessageIds(loadKnowledgeClaims().value, messageIds, scope));
export const retractBySourceStoryIds = (storyIds: readonly string[]): StorageWriteResult =>
  saveKnowledgeClaims(retractKnowledgeClaimsBySourceStoryIds(loadKnowledgeClaims().value, storyIds));

export const characterKnowledgeRepository = {
  load: loadKnowledgeClaims,
  save: saveKnowledgeClaims,
  listByRelation,
  findBySource,
  append,
  appendMany,
  supersede,
  retract,
  removeByRelations,
  retractBySourceMessageIds,
  retractBySourceStoryIds,
};
