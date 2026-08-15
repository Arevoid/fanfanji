import type { Moment } from "../../../types";
import { storageKeys } from "../storageKeys";
import { writeArray, readArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readingAssetDb } from "../readingAssetDb";
import { remove } from "../storageAdapter";

const MOMENT_METADATA_KEY = "moments-v4";
let cachedMoments: Moment[] | null = null;
let metadataReady = false;
let initializationPromise: Promise<StorageResult<Moment[]>> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let mutationVersion = 0;

const cloneMoments = (moments: Moment[]): Moment[] => typeof structuredClone === "function"
  ? structuredClone(moments)
  : JSON.parse(JSON.stringify(moments)) as Moment[];

const loadLegacyMoments = (fallback: Moment[]): StorageResult<Moment[]> => readArray(storageKeys.moments, fallback);

const enqueueWrite = (moments: Moment[]): Promise<void> => {
  const snapshot = cloneMoments(moments);
  writeQueue = writeQueue.catch(() => undefined).then(() => readingAssetDb.saveMetadataValue(MOMENT_METADATA_KEY, snapshot));
  return writeQueue;
};

export const loadMoments = (fallback: Moment[]): StorageResult<Moment[]> => {
  if (metadataReady && cachedMoments) return { value: cloneMoments(cachedMoments), found: true, valid: true };
  return loadLegacyMoments(fallback);
};

export const saveMoments = (moments: Moment[]): StorageWriteResult => {
  if (typeof indexedDB === "undefined") return writeArray(storageKeys.moments, moments);
  mutationVersion += 1;
  cachedMoments = cloneMoments(moments);
  metadataReady = true;
  enqueueWrite(cachedMoments).catch((error) => console.warn("[storage] Failed to persist Moments in IndexedDB.", error));
  return { success: true };
};

export async function initializeMomentRepository(fallback: Moment[]): Promise<StorageResult<Moment[]>> {
  if (typeof indexedDB === "undefined") return loadLegacyMoments(fallback);
  if (metadataReady && cachedMoments) return { value: cloneMoments(cachedMoments), found: true, valid: true };
  if (initializationPromise) return initializationPromise;
  const initializationMutationVersion = mutationVersion;
  initializationPromise = (async () => {
    try {
      const stored = await readingAssetDb.loadMetadataValue<Moment[]>(MOMENT_METADATA_KEY);
      if (mutationVersion !== initializationMutationVersion && cachedMoments) {
        return { value: cloneMoments(cachedMoments), found: true, valid: true };
      }
      if (Array.isArray(stored)) {
        cachedMoments = cloneMoments(stored);
        metadataReady = true;
        return { value: cloneMoments(stored), found: true, valid: true };
      }
      const legacy = loadLegacyMoments(fallback);
      cachedMoments = cloneMoments(legacy.value);
      metadataReady = true;
      await enqueueWrite(cachedMoments);
      if (legacy.found && legacy.valid) remove(storageKeys.moments);
      return legacy;
    } catch (error) {
      console.warn("[storage] Moment IndexedDB initialization failed; using localStorage for this session.", error);
      metadataReady = false;
      return loadLegacyMoments(fallback);
    }
  })();
  return initializationPromise;
}

export async function flushMoments(): Promise<StorageWriteResult> {
  if (typeof indexedDB === "undefined") return { success: true };
  try {
    await writeQueue;
    remove(storageKeys.moments);
    return { success: true };
  } catch (error) {
    const name = error && typeof error === "object" ? String((error as { name?: unknown }).name || "") : "";
    return { success: false, error: name === "QuotaExceededError" ? "quota" : "write" };
  }
}
