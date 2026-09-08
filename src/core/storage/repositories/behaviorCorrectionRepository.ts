import {
  BEHAVIOR_CORRECTION_SCHEMA_VERSION,
  type BehaviorCorrectionRecord,
  type CharacterTruthScope,
} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { isSameTruthScope } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isNonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function normalizeBehaviorCorrection(value: unknown): BehaviorCorrectionRecord | undefined {
  if (!isRecord(value)
    || !isNonEmpty(value.id)
    || !isNonEmpty(value.relationId)
    || !isNonEmpty(value.characterId)
    || !isNonEmpty(value.userIdentityId)
    || !isNonEmpty(value.instruction)
    || !Array.isArray(value.sourceMessageIds)
    || value.sourceMessageIds.some((item) => !isNonEmpty(item))
    || !isFiniteNumber(value.createdAt)
    || !isFiniteNumber(value.updatedAt)
    || (value.schemaVersion !== undefined && (!isFiniteNumber(value.schemaVersion) || !Number.isInteger(value.schemaVersion) || value.schemaVersion < 1))
    || !["active", "superseded", "retracted"].includes(value.status as string)) return undefined;
  return {
    id: value.id.trim(),
    relationId: value.relationId.trim(),
    characterId: value.characterId.trim(),
    userIdentityId: value.userIdentityId.trim(),
    ...(isNonEmpty(value.conversationId) ? { conversationId: value.conversationId.trim() } : {}),
    ...(isNonEmpty(value.sourceRecordId) ? { sourceRecordId: value.sourceRecordId.trim() } : {}),
    instruction: value.instruction.trim(),
    ...(isNonEmpty(value.originalResponse) ? { originalResponse: value.originalResponse.trim() } : {}),
    sourceMessageIds: Array.from(new Set((value.sourceMessageIds as string[]).map((item) => item.trim()))),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    status: value.status as BehaviorCorrectionRecord["status"],
    ...(isNonEmpty(value.supersedesId) ? { supersedesId: value.supersedesId.trim() } : {}),
    schemaVersion: isFiniteNumber(value.schemaVersion) ? value.schemaVersion : BEHAVIOR_CORRECTION_SCHEMA_VERSION,
  };
}

export const normalizeBehaviorCorrections = (values: readonly unknown[]): BehaviorCorrectionRecord[] => {
  const ids = new Set<string>();
  return values.map(normalizeBehaviorCorrection).filter((item): item is BehaviorCorrectionRecord => {
    if (!item || ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  });
};

export const loadBehaviorCorrections = (): StorageResult<BehaviorCorrectionRecord[]> => {
  const result = readArray<unknown>(storageKeys.behaviorCorrections, []);
  return { ...result, value: normalizeBehaviorCorrections(result.value) };
};
export const saveBehaviorCorrections = (records: readonly BehaviorCorrectionRecord[]): StorageWriteResult =>
  writeArray(storageKeys.behaviorCorrections, normalizeBehaviorCorrections(records));
export const listBehaviorCorrectionsByRelation = (
  scope: CharacterTruthScope,
  records: readonly BehaviorCorrectionRecord[] = loadBehaviorCorrections().value,
): BehaviorCorrectionRecord[] => records.filter((record) => isSameTruthScope(record, scope));
export const appendBehaviorCorrections = (
  current: readonly BehaviorCorrectionRecord[], incoming: readonly BehaviorCorrectionRecord[],
): BehaviorCorrectionRecord[] => normalizeBehaviorCorrections([...current, ...incoming]);
export const removeBehaviorCorrectionsByRelations = (
  records: readonly BehaviorCorrectionRecord[], relationIds: readonly string[],
): BehaviorCorrectionRecord[] => {
  const removed = new Set(relationIds);
  return records.filter((record) => !removed.has(record.relationId));
};
export const removeBehaviorCorrectionsForRelations = (relationIds: readonly string[]): StorageWriteResult =>
  saveBehaviorCorrections(removeBehaviorCorrectionsByRelations(loadBehaviorCorrections().value, relationIds));
export const retractBehaviorCorrectionsBySourceMessageIds = (messageIds: readonly string[], scope?: CharacterTruthScope): StorageWriteResult => {
  const removed = new Set(messageIds.filter(Boolean));
  if (removed.size === 0) return { success: true };
  return saveBehaviorCorrections(loadBehaviorCorrections().value.map((record) =>
    record.sourceMessageIds.some((sourceMessageId) => removed.has(sourceMessageId))
      && (!scope || isSameTruthScope(record, scope))
      ? { ...record, status: "retracted" as const, updatedAt: Date.now() }
      : record));
};

export const behaviorCorrectionRepository = {
  load: loadBehaviorCorrections,
  save: saveBehaviorCorrections,
  listByRelation: listBehaviorCorrectionsByRelation,
  append: (record: BehaviorCorrectionRecord) => saveBehaviorCorrections(appendBehaviorCorrections(loadBehaviorCorrections().value, [record])),
  appendMany: (records: readonly BehaviorCorrectionRecord[]) => saveBehaviorCorrections(appendBehaviorCorrections(loadBehaviorCorrections().value, records)),
  removeByRelations: removeBehaviorCorrectionsForRelations,
  retractBySourceMessageIds: retractBehaviorCorrectionsBySourceMessageIds,
};
