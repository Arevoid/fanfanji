import { normalizeMomentTopic } from "../../../domain/moments/momentGeneration/momentTopicHistory";
import { MOMENT_TOPIC_SCOPE, type MomentTopicRecord } from "../../../domain/moments/momentGeneration/momentTopicTypes";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const categories = new Set(["daily_life", "hobby", "work", "emotion", "social", "reflection", "other"]);

export function normalizeMomentTopicRecord(value: unknown): MomentTopicRecord | undefined {
  if (!isRecord(value)
    || !isText(value.topic)
    || !categories.has(value.category as string)
    || typeof value.generatedAt !== "number"
    || !Number.isFinite(value.generatedAt)
    || !isText(value.momentId)
    || !isText(value.characterId)
    || (value.scope !== undefined && value.scope !== MOMENT_TOPIC_SCOPE)) return undefined;
  return {
    topic: value.topic.trim(),
    category: value.category as MomentTopicRecord["category"],
    generatedAt: value.generatedAt,
    momentId: value.momentId.trim(),
    characterId: value.characterId.trim(),
    scope: MOMENT_TOPIC_SCOPE,
  };
}

export const normalizeMomentTopicRecords = (values: readonly unknown[]): MomentTopicRecord[] => {
  const keys = new Set<string>();
  return values.map(normalizeMomentTopicRecord).filter((record): record is MomentTopicRecord => {
    if (!record) return false;
    const key = `${record.characterId}\u0000${record.momentId}\u0000${normalizeMomentTopic(record.topic)}\u0000${record.generatedAt}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
};

export const loadMomentTopicRecords = (): StorageResult<MomentTopicRecord[]> => {
  const result = readArray<unknown>(storageKeys.momentTopicHistory, []);
  return { ...result, value: normalizeMomentTopicRecords(result.value) };
};
export const saveMomentTopicRecords = (records: readonly MomentTopicRecord[]): StorageWriteResult =>
  writeArray(storageKeys.momentTopicHistory, normalizeMomentTopicRecords(records));
export const appendMomentTopicRecord = (record: MomentTopicRecord): StorageWriteResult =>
  saveMomentTopicRecords([...loadMomentTopicRecords().value, record]);
export const removeMomentTopicsForCharacters = (characterIds: readonly string[]): StorageWriteResult =>
  saveMomentTopicRecords(loadMomentTopicRecords().value.filter((record) => !characterIds.includes(record.characterId)));
export const removeMomentTopicsForMoments = (momentIds: readonly string[]): StorageWriteResult =>
  saveMomentTopicRecords(loadMomentTopicRecords().value.filter((record) => !momentIds.includes(record.momentId)));

export const momentTopicRepository = {
  load: loadMomentTopicRecords,
  save: saveMomentTopicRecords,
  append: appendMomentTopicRecord,
  removeForCharacters: removeMomentTopicsForCharacters,
  removeForMoments: removeMomentTopicsForMoments,
};
