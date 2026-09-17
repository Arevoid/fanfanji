import type { InnerVoiceRecord } from "../../../types";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";
import { readingAssetDb } from "../readingAssetDb";

/**
 * Inner voices used to live only in one large LocalStorage array. Keep that
 * path for synchronous callers, but mirror it into the existing metadata
 * database so a full LocalStorage quota cannot make a generated voice vanish
 * after the next reload.
 */
export const INNER_VOICE_DURABLE_KEY = "inner-voice-records-v1" as const;

let cachedRecords: InnerVoiceRecord[] | null = null;
let hydrationPromise: Promise<void> | null = null;
let durableWriteChain: Promise<void> = Promise.resolve();
let cacheRevision = 0;

const cloneRecords = (records: readonly InnerVoiceRecord[]): InnerVoiceRecord[] => records.map((record) => ({ ...record }));

function enqueueDurableSave(records: readonly InnerVoiceRecord[]): void {
  const snapshot = cloneRecords(records);
  durableWriteChain = durableWriteChain
    .catch(() => undefined)
    .then(() => readingAssetDb.saveMetadataValue(INNER_VOICE_DURABLE_KEY, snapshot))
    .catch((error) => {
      // The synchronous result remains authoritative for the current page;
      // a later startup can retry the durable mirror.
      console.warn("[inner-voice] Failed to persist the durable mirror.", error);
    });
}

/** Hydrates the durable mirror and migrates an existing LocalStorage array once. */
export async function initializeInnerVoiceRepository(): Promise<void> {
  if (cachedRecords || hydrationPromise) {
    if (hydrationPromise) await hydrationPromise;
    return;
  }
  hydrationPromise = (async () => {
    const hydrationRevision = cacheRevision;
    try {
      const durable = await readingAssetDb.loadMetadataValue<unknown>(INNER_VOICE_DURABLE_KEY);
      if (cacheRevision === hydrationRevision && Array.isArray(durable)) {
        cachedRecords = cloneRecords(durable as InnerVoiceRecord[]);
        return;
      }
    } catch (error) {
      console.warn("[inner-voice] Failed to hydrate the durable mirror.", error);
    }
    if (cacheRevision === hydrationRevision) {
      const legacy = readArray(storageKeys.innerVoiceRecords, []).value;
      cachedRecords = cloneRecords(legacy);
      if (legacy.length > 0) enqueueDurableSave(legacy);
    }
  })().finally(() => {
    hydrationPromise = null;
  });
  await hydrationPromise;
}

/** Waits for any queued IndexedDB mirror writes before backup/export. */
export async function flushInnerVoiceRepository(): Promise<void> {
  await initializeInnerVoiceRepository();
  await durableWriteChain;
}

/** Backup adapter for the durable inner-voice module. */
export async function loadDurableInnerVoiceRecords(): Promise<InnerVoiceRecord[] | null> {
  await initializeInnerVoiceRepository();
  return cachedRecords ? cloneRecords(cachedRecords) : null;
}

export async function saveDurableInnerVoiceRecords(value: unknown): Promise<void> {
  if (!Array.isArray(value)) throw new Error("Invalid inner-voice backup data");
  const records = cloneRecords(value as InnerVoiceRecord[]);
  cacheRevision += 1;
  cachedRecords = records;
  await durableWriteChain;
  await readingAssetDb.saveMetadataValue(INNER_VOICE_DURABLE_KEY, records);
}

export async function deleteDurableInnerVoiceRecords(): Promise<void> {
  cacheRevision += 1;
  cachedRecords = [];
  await durableWriteChain;
  await readingAssetDb.deleteMetadataValue(INNER_VOICE_DURABLE_KEY);
}

export const loadInnerVoiceRecords = (fallback: InnerVoiceRecord[] = []): StorageResult<InnerVoiceRecord[]> =>
  cachedRecords
    ? { value: cloneRecords(cachedRecords), found: true, valid: true }
    : readArray(storageKeys.innerVoiceRecords, fallback);

export const saveInnerVoiceRecords = (records: InnerVoiceRecord[]): StorageWriteResult => {
  cacheRevision += 1;
  cachedRecords = cloneRecords(records);
  const result = writeArray(storageKeys.innerVoiceRecords, records);
  // Mirror successful writes as well as quota failures. This makes the
  // IndexedDB copy current before a Service Worker-driven page reload.
  enqueueDurableSave(records);
  return result;
};

export type InnerVoiceScope =
  | { kind: "direct"; relationId: string; messageId: string }
  | { kind: "group"; groupId: string; conversationId: string; characterId: string; messageId: string };

/** Finds one record within its direct relationship or group conversation boundary. */
export const findInnerVoiceByMessage = (
  records: readonly InnerVoiceRecord[],
  scope: InnerVoiceScope,
): InnerVoiceRecord | undefined => records
  .filter((record) => scope.kind === "direct"
    ? record.relationId === scope.relationId && record.messageId === scope.messageId
    : record.groupId === scope.groupId
      && record.conversationId === scope.conversationId
      && record.characterId === scope.characterId
      && record.messageId === scope.messageId)
  .sort((left, right) => right.createdAt - left.createdAt)[0];

/** Returns only the newest records needed by the history UI. */
export const listInnerVoicesByCharacter = (
  records: readonly InnerVoiceRecord[],
  characterId: string,
  limit = 10,
): InnerVoiceRecord[] => records
  .filter((record) => record.characterId === characterId)
  .sort((left, right) => right.createdAt - left.createdAt)
  .slice(0, limit);

export const listInnerVoicesByRelation = (
  records: readonly InnerVoiceRecord[],
  relationId: string,
  limit = 10,
): InnerVoiceRecord[] => records
  .filter((record) => record.relationId === relationId)
  .sort((left, right) => right.createdAt - left.createdAt)
  .slice(0, limit);

export const listInnerVoicesByGroup = (
  records: readonly InnerVoiceRecord[],
  groupId: string,
  conversationId: string,
  characterId: string,
  limit = 10,
): InnerVoiceRecord[] => records
  .filter((record) => record.groupId === groupId
    && record.conversationId === conversationId
    && record.characterId === characterId)
  .sort((left, right) => right.createdAt - left.createdAt)
  .slice(0, limit);

export const removeInnerVoicesByRelation = (
  records: readonly InnerVoiceRecord[],
  relationId: string,
): InnerVoiceRecord[] => records.filter((record) => record.relationId !== relationId);

export const removeInnerVoicesByCharacter = (
  records: readonly InnerVoiceRecord[],
  characterId: string,
): InnerVoiceRecord[] => records.filter((record) => record.characterId !== characterId);
