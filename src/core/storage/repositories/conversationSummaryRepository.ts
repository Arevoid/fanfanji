import {
  CONVERSATION_SUMMARY_SCHEMA_VERSION,
  type CharacterTruthScope,
  type ConversationSummaryRecord,
} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { isSameTruthScope } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isNonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const stringArray = (value: unknown): string[] | undefined => Array.isArray(value) && value.every(isNonEmpty)
  ? Array.from(new Set(value.map((item) => item.trim())))
  : undefined;

export function normalizeConversationSummary(value: unknown): ConversationSummaryRecord | undefined {
  if (!isRecord(value)) return undefined;
  const sourceMessageIds = stringArray(value.sourceMessageIds);
  const sourceClaimIds = stringArray(value.sourceClaimIds);
  if (!isNonEmpty(value.id)
    || !isNonEmpty(value.relationId)
    || !isNonEmpty(value.characterId)
    || !isNonEmpty(value.userIdentityId)
    || !isNonEmpty(value.summary)
    || !sourceMessageIds
    || !sourceClaimIds
    || !isFiniteNumber(value.generatedAt)
    || !isNonEmpty(value.generator)
    || !isFiniteNumber(value.projectionVersion)
    || !Number.isInteger(value.projectionVersion)
    || value.projectionVersion < 1
    || (value.schemaVersion !== undefined && (!isFiniteNumber(value.schemaVersion) || !Number.isInteger(value.schemaVersion) || value.schemaVersion < 1))
    || (value.rangeStartAt !== undefined && !isFiniteNumber(value.rangeStartAt))
    || (value.rangeEndAt !== undefined && !isFiniteNumber(value.rangeEndAt))
    || !["active", "stale", "retracted"].includes(value.status as string)) return undefined;
  return {
    id: value.id.trim(),
    relationId: value.relationId.trim(),
    characterId: value.characterId.trim(),
    userIdentityId: value.userIdentityId.trim(),
    ...(isNonEmpty(value.conversationId) ? { conversationId: value.conversationId.trim() } : {}),
    ...(isNonEmpty(value.sourceRecordId) ? { sourceRecordId: value.sourceRecordId.trim() } : {}),
    summary: value.summary.trim(),
    sourceMessageIds,
    sourceClaimIds,
    ...(isFiniteNumber(value.rangeStartAt) ? { rangeStartAt: value.rangeStartAt } : {}),
    ...(isFiniteNumber(value.rangeEndAt) ? { rangeEndAt: value.rangeEndAt } : {}),
    generatedAt: value.generatedAt,
    generator: value.generator.trim(),
    projectionVersion: value.projectionVersion,
    status: value.status as ConversationSummaryRecord["status"],
    schemaVersion: isFiniteNumber(value.schemaVersion) ? value.schemaVersion : CONVERSATION_SUMMARY_SCHEMA_VERSION,
  };
}

export const normalizeConversationSummaries = (values: readonly unknown[]): ConversationSummaryRecord[] => {
  const records = new Map<string, ConversationSummaryRecord>();
  values.map(normalizeConversationSummary).forEach((item) => {
    if (item) records.set(item.id, item);
  });
  return Array.from(records.values());
};

export const loadConversationSummaries = (): StorageResult<ConversationSummaryRecord[]> => {
  const result = readArray<unknown>(storageKeys.conversationSummaries, []);
  return { ...result, value: normalizeConversationSummaries(result.value) };
};
export const saveConversationSummaries = (records: readonly ConversationSummaryRecord[]): StorageWriteResult =>
  writeArray(storageKeys.conversationSummaries, normalizeConversationSummaries(records));
export const listConversationSummariesByRelation = (
  scope: CharacterTruthScope,
  records: readonly ConversationSummaryRecord[] = loadConversationSummaries().value,
): ConversationSummaryRecord[] => records.filter((record) => isSameTruthScope(record, scope));
export const appendConversationSummaries = (
  current: readonly ConversationSummaryRecord[],
  incoming: readonly ConversationSummaryRecord[],
): ConversationSummaryRecord[] => {
  const records = new Map(normalizeConversationSummaries(current).map((record) => [record.id, record]));
  normalizeConversationSummaries(incoming).forEach((record) => records.set(record.id, record));
  return Array.from(records.values());
};
export const removeConversationSummariesByRelations = (
  records: readonly ConversationSummaryRecord[], relationIds: readonly string[],
): ConversationSummaryRecord[] => {
  const removed = new Set(relationIds);
  return records.filter((record) => !removed.has(record.relationId));
};
export const removeConversationSummariesForRelations = (relationIds: readonly string[]): StorageWriteResult =>
  saveConversationSummaries(removeConversationSummariesByRelations(loadConversationSummaries().value, relationIds));
export const retractConversationSummariesBySourceMessageIds = (messageIds: readonly string[], scope?: CharacterTruthScope): StorageWriteResult => {
  const removed = new Set(messageIds.filter(Boolean));
  if (removed.size === 0) return { success: true };
  return saveConversationSummaries(loadConversationSummaries().value.map((record) =>
    record.sourceMessageIds.some((sourceMessageId) => removed.has(sourceMessageId))
      && (!scope || isSameTruthScope(record, scope))
      ? { ...record, status: "retracted" as const }
      : record));
};

export const conversationSummaryRepository = {
  load: loadConversationSummaries,
  save: saveConversationSummaries,
  listByRelation: listConversationSummariesByRelation,
  append: (record: ConversationSummaryRecord) => saveConversationSummaries(appendConversationSummaries(loadConversationSummaries().value, [record])),
  appendMany: (records: readonly ConversationSummaryRecord[]) => saveConversationSummaries(appendConversationSummaries(loadConversationSummaries().value, records)),
  removeByRelations: removeConversationSummariesForRelations,
  retractBySourceMessageIds: retractConversationSummariesBySourceMessageIds,
};
