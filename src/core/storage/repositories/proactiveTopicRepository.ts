import { normalizeProactiveTopic } from "../../../domain/characterLife/proactive/proactiveTopicHistory";
import type { ProactiveTopicRecord } from "../../../domain/characterLife/proactive/proactiveTopicTypes";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const categories = new Set(["care", "daily_share", "hobby", "reminder", "emotional", "follow_up"]);

export function normalizeProactiveTopicRecord(value: unknown): ProactiveTopicRecord | undefined {
  if (!isRecord(value)
    || !isText(value.topic)
    || !categories.has(value.category as string)
    || typeof value.createdAt !== "number"
    || !Number.isFinite(value.createdAt)
    || !isText(value.characterId)
    || !isText(value.relationId)) return undefined;
  return {
    topic: value.topic.trim(),
    category: value.category as ProactiveTopicRecord["category"],
    createdAt: value.createdAt,
    characterId: value.characterId.trim(),
    relationId: value.relationId.trim(),
  };
}

export const normalizeProactiveTopicRecords = (values: readonly unknown[]): ProactiveTopicRecord[] => {
  const keys = new Set<string>();
  return values.map(normalizeProactiveTopicRecord).filter((record): record is ProactiveTopicRecord => {
    if (!record) return false;
    const key = `${record.characterId}\u0000${record.relationId}\u0000${normalizeProactiveTopic(record.topic)}\u0000${record.createdAt}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
};

export const loadProactiveTopicRecords = (): StorageResult<ProactiveTopicRecord[]> => {
  const result = readArray<unknown>(storageKeys.proactiveTopicHistory, []);
  return { ...result, value: normalizeProactiveTopicRecords(result.value) };
};
export const saveProactiveTopicRecords = (records: readonly ProactiveTopicRecord[]): StorageWriteResult =>
  writeArray(storageKeys.proactiveTopicHistory, normalizeProactiveTopicRecords(records));
export const appendProactiveTopicRecord = (record: ProactiveTopicRecord): StorageWriteResult =>
  saveProactiveTopicRecords([...loadProactiveTopicRecords().value, record]);
export const removeProactiveTopicsForRelations = (relationIds: readonly string[]): StorageWriteResult =>
  saveProactiveTopicRecords(loadProactiveTopicRecords().value.filter((record) => !relationIds.includes(record.relationId)));
export const removeProactiveTopicsForCharacters = (characterIds: readonly string[]): StorageWriteResult =>
  saveProactiveTopicRecords(loadProactiveTopicRecords().value.filter((record) => !characterIds.includes(record.characterId)));

export const proactiveTopicRepository = {
  load: loadProactiveTopicRecords,
  save: saveProactiveTopicRecords,
  append: appendProactiveTopicRecord,
  removeForRelations: removeProactiveTopicsForRelations,
  removeForCharacters: removeProactiveTopicsForCharacters,
};
