import type { InnerVoiceRecord } from "../../../types";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { remove } from "../storageAdapter";
import { readArray, writeArray } from "./repositoryUtils";
import { getInnerVoiceStorageScopeKey, innerVoiceDb } from "../innerVoiceDb";

export type InnerVoiceScope =
  | { kind: "direct"; relationId: string; messageId: string; conversationId?: string; characterId?: string; userIdentityId?: string }
  | { kind: "group"; groupId: string; conversationId: string; characterId: string; messageId: string; userIdentityId?: string };

let recordsCache: InnerVoiceRecord[] | null = null;
const pendingRecords = new Map<string, InnerVoiceRecord>();
let initialized = false;
let initialization: Promise<StorageResult<InnerVoiceRecord[]>> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(operation);
  writeQueue = next.then(() => undefined, () => undefined);
  return next;
}

const cloneRecords = (records: readonly InnerVoiceRecord[]): InnerVoiceRecord[] => typeof structuredClone === "function"
  ? [...structuredClone(records)]
  : JSON.parse(JSON.stringify(records)) as InnerVoiceRecord[];

const normalizeRecord = (record: InnerVoiceRecord): InnerVoiceRecord => ({
  ...record,
  storageScopeKey: getInnerVoiceStorageScopeKey(record),
});

function mergeByScope(...collections: readonly (readonly InnerVoiceRecord[])[]): InnerVoiceRecord[] {
  const records = new Map<string, InnerVoiceRecord>();
  for (const collection of collections) {
    for (const raw of collection) {
      if (!raw || typeof raw.id !== "string" || typeof raw.messageId !== "string") continue;
      const record = normalizeRecord(raw);
      const key = record.storageScopeKey!;
      const current = records.get(key);
      if (!current || record.createdAt >= current.createdAt) records.set(key, record);
    }
  }
  return [...records.values()].sort((left, right) => left.createdAt - right.createdAt);
}

function getLegacyRecords(fallback: InnerVoiceRecord[] = []): StorageResult<InnerVoiceRecord[]> {
  return readArray<InnerVoiceRecord>(storageKeys.innerVoiceRecords, fallback);
}

function errorResult(error: unknown): StorageWriteResult {
  const candidate = error && typeof error === "object" ? error as { name?: unknown } : undefined;
  return {
    success: false,
    error: candidate?.name === "QuotaExceededError" ? "quota" : "write",
  };
}

/**
 * Hydrates the dedicated IndexedDB repository and migrates legacy records.
 * The old localStorage value is removed only after the IndexedDB copy has
 * been read back and verified by its complete set of record IDs.
 */
export function initializeInnerVoiceRepository(fallback: InnerVoiceRecord[] = []): Promise<StorageResult<InnerVoiceRecord[]>> {
  if (initialized && recordsCache) return Promise.resolve({ value: cloneRecords(recordsCache), found: true, valid: true });
  if (initialization) return initialization;

  initialization = (async () => {
    const legacy = getLegacyRecords(fallback);
    try {
      const existing = await innerVoiceDb.loadAll();
      const merged = mergeByScope(existing, legacy.value, [...pendingRecords.values()]);
      const hasLegacy = legacy.found && legacy.value.length > 0;
      const existingByScope = new Map(existing.map((record) => {
        const normalized = normalizeRecord(record);
        return [normalized.storageScopeKey!, normalized] as const;
      }));
      const requiresMigration = [...pendingRecords.keys()].length > 0
        || merged.length !== existingByScope.size
        || merged.some((record) => JSON.stringify(record) !== JSON.stringify(existingByScope.get(record.storageScopeKey!)));
      if (requiresMigration) {
        await innerVoiceDb.replaceAll(merged);
        const verified = mergeByScope(await innerVoiceDb.loadAll());
        const verifiedKeys = new Set(verified.map((record) => record.storageScopeKey));
        if (merged.some((record) => !verifiedKeys.has(record.storageScopeKey))) {
          throw new Error("Inner voice migration verification failed");
        }
        recordsCache = verified;
        pendingRecords.clear();
        const removed = remove(storageKeys.innerVoiceRecords);
        if (!removed.success) console.warn("[inner-voice] IndexedDB migration succeeded, but the legacy localStorage key could not be removed.");
      } else {
        recordsCache = mergeByScope(existing);
        if (hasLegacy) {
          // Existing IndexedDB rows are authoritative. Only remove the legacy
          // duplicate after confirming every legacy scope exists durably.
          const scopes = new Set(recordsCache.map((record) => record.storageScopeKey));
          if (legacy.value.every((record) => scopes.has(getInnerVoiceStorageScopeKey(record)))) {
            const removed = remove(storageKeys.innerVoiceRecords);
            if (!removed.success) console.warn("[inner-voice] The legacy localStorage copy remains after hydration.");
          }
        }
      }
      initialized = true;
      return { value: cloneRecords(recordsCache), found: existing.length > 0 || legacy.found, valid: true };
    } catch (error) {
      // Keep the old data readable if IndexedDB is blocked or unavailable;
      // chat delivery is independent from this storage fallback.
      recordsCache = mergeByScope(recordsCache || [], legacy.value);
      console.warn("[inner-voice] IndexedDB hydration failed; the legacy snapshot remains available.", error);
      return { value: cloneRecords(recordsCache), found: legacy.found, valid: false, error: "unavailable" };
    } finally {
      initialization = null;
    }
  })();
  return initialization;
}

/** Synchronous cache read for existing UI selectors; startup/open hydrates it asynchronously. */
export const loadInnerVoiceRecords = (fallback: InnerVoiceRecord[] = []): StorageResult<InnerVoiceRecord[]> => {
  if (recordsCache) return { value: cloneRecords(recordsCache), found: true, valid: true };
  const legacy = getLegacyRecords(fallback);
  recordsCache = mergeByScope(legacy.value);
  return { ...legacy, value: cloneRecords(recordsCache) };
};

export async function loadInnerVoiceRecordsAsync(fallback: InnerVoiceRecord[] = []): Promise<StorageResult<InnerVoiceRecord[]>> {
  return initializeInnerVoiceRepository(fallback);
}

/** Writes one message-bound record without rewriting the full history array. */
export async function saveInnerVoiceRecord(record: InnerVoiceRecord): Promise<StorageWriteResult> {
  await initializeInnerVoiceRepository([]);
  const normalized = normalizeRecord(record);
  const previousCache = recordsCache || [];
  recordsCache = mergeByScope(previousCache.filter((item) => item.storageScopeKey !== normalized.storageScopeKey), [normalized]);
  pendingRecords.set(normalized.storageScopeKey!, normalized);
  return enqueueWrite(async () => {
    try {
      await innerVoiceDb.upsert(normalized);
      pendingRecords.delete(normalized.storageScopeKey!);
      return { success: true };
    } catch (error) {
      if (typeof indexedDB === "undefined") {
        const fallback = writeArray(storageKeys.innerVoiceRecords, recordsCache || []);
        if (fallback.success) {
          pendingRecords.delete(normalized.storageScopeKey!);
          return fallback;
        }
      }
      console.warn("[inner-voice] Failed to persist a record in IndexedDB.", error);
      return errorResult(error);
    }
  });
}

/** Replaces the complete collection for restore/cleanup operations only. */
export async function saveInnerVoiceRecords(records: InnerVoiceRecord[]): Promise<StorageWriteResult> {
  await initializeInnerVoiceRepository([]);
  const normalized = mergeByScope(records);
  return enqueueWrite(async () => {
    try {
      await innerVoiceDb.replaceAll(normalized);
      recordsCache = normalized;
      pendingRecords.clear();
      remove(storageKeys.innerVoiceRecords);
      return { success: true };
    } catch (error) {
      if (typeof indexedDB === "undefined") {
        const fallback = writeArray(storageKeys.innerVoiceRecords, normalized);
        if (fallback.success) {
          recordsCache = normalized;
          pendingRecords.clear();
          return fallback;
        }
      }
      console.warn("[inner-voice] Failed to replace the IndexedDB record collection.", error);
      return errorResult(error);
    }
  });
}

export async function flushInnerVoiceRepository(): Promise<StorageWriteResult> {
  const initializedResult = await initializeInnerVoiceRepository([]);
  await writeQueue;
  if (typeof indexedDB === "undefined") return { success: true };
  if (pendingRecords.size > 0) {
    try {
      await innerVoiceDb.replaceAll(recordsCache || []);
      pendingRecords.clear();
      return { success: true };
    } catch (error) {
      console.warn("[inner-voice] Pending IndexedDB records could not be flushed.", error);
      return errorResult(error);
    }
  }
  return initializedResult.valid ? { success: true } : { success: false, error: initializedResult.error || "unavailable" };
}

/** Finds one record inside its full direct-relationship or group boundary. */
export const findInnerVoiceByMessage = (
  records: readonly InnerVoiceRecord[],
  scope: InnerVoiceScope,
): InnerVoiceRecord | undefined => records
  .filter((record) => scope.kind === "direct"
    ? record.relationId === scope.relationId
      && record.messageId === scope.messageId
      && (!scope.conversationId || record.conversationId === scope.conversationId)
      && (!scope.characterId || record.characterId === scope.characterId)
      && (!scope.userIdentityId || record.userIdentityId === scope.userIdentityId)
    : record.groupId === scope.groupId
      && record.conversationId === scope.conversationId
      && record.characterId === scope.characterId
      && record.messageId === scope.messageId
      && (!scope.userIdentityId || record.userIdentityId === scope.userIdentityId))
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
  conversationId?: string,
  characterId?: string,
  userIdentityId?: string,
  limit = 10,
): InnerVoiceRecord[] => records
  .filter((record) => record.relationId === relationId
    && (!conversationId || record.conversationId === conversationId)
    && (!characterId || record.characterId === characterId)
    && (!userIdentityId || record.userIdentityId === userIdentityId))
  .sort((left, right) => right.createdAt - left.createdAt)
  .slice(0, limit);

export const listInnerVoicesByGroup = (
  records: readonly InnerVoiceRecord[],
  groupId: string,
  conversationId: string,
  characterId: string,
  limit = 10,
  userIdentityId?: string,
): InnerVoiceRecord[] => records
  .filter((record) => record.groupId === groupId
    && record.conversationId === conversationId
    && record.characterId === characterId
    && (!userIdentityId || record.userIdentityId === userIdentityId))
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
