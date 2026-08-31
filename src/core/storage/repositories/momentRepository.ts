import type { Moment } from "../../../types";
import { storageKeys } from "../storageKeys";
import { writeArray, readArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readingAssetDb } from "../readingAssetDb";
import { remove, readString } from "../storageAdapter";
import { createLatestSnapshotWriter } from "../latestSnapshotWriter";

const MOMENT_METADATA_KEY = "moments-v4";
const MOMENT_PENDING_SNAPSHOT_KEY = "moments-v4-pending";
let cachedMoments: Moment[] | null = null;
let metadataReady = false;
let initializationPromise: Promise<StorageResult<Moment[]>> | null = null;
let mutationVersion = 0;
let latestMomentPersistenceError: unknown = null;

const cloneMoments = (moments: Moment[]): Moment[] => typeof structuredClone === "function"
  ? structuredClone(moments)
  : JSON.parse(JSON.stringify(moments)) as Moment[];

const loadLegacyMoments = (fallback: Moment[]): StorageResult<Moment[]> => readArray(storageKeys.moments, fallback);

const momentWriter = createLatestSnapshotWriter(
  cloneMoments,
  (snapshot) => readingAssetDb.saveMetadataValue(MOMENT_METADATA_KEY, snapshot),
);

export const loadMoments = (fallback: Moment[]): StorageResult<Moment[]> => {
  if (metadataReady && cachedMoments) return { value: cloneMoments(cachedMoments), found: true, valid: true };
  return loadLegacyMoments(fallback);
};

export const saveMoments = (moments: Moment[]): StorageWriteResult => {
  if (typeof indexedDB === "undefined") return writeArray(storageKeys.moments, moments);
  mutationVersion += 1;
  cachedMoments = cloneMoments(moments);
  metadataReady = true;
  const snapshot = cachedMoments;
  // Keep a synchronous recovery snapshot until the IndexedDB write for this
  // exact version succeeds. This covers refreshes while the async writer is
  // still in flight and browsers that suspend IndexedDB in the background.
  const fallback = writeArray(storageKeys.moments, snapshot);
  if (fallback.success) writeArray(MOMENT_PENDING_SNAPSHOT_KEY, [snapshot.length]);
  void momentWriter.enqueue(snapshot)
    .then(() => {
      if (cachedMoments === snapshot) {
        latestMomentPersistenceError = null;
      }
    })
    .catch((error) => {
      latestMomentPersistenceError = error;
      if (!fallback.success) console.warn("[storage] Failed to persist Moments in IndexedDB and localStorage.", error);
      else console.warn("[storage] IndexedDB persistence failed; retained a localStorage Moment snapshot.", error);
    });
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
      const legacy = loadLegacyMoments(fallback);
      const pendingSnapshot = readString(MOMENT_PENDING_SNAPSHOT_KEY).found;
      if (pendingSnapshot && legacy.found && legacy.valid) {
        cachedMoments = cloneMoments(legacy.value);
        metadataReady = true;
        await momentWriter.enqueue(cachedMoments);
        return legacy;
      }
      if (Array.isArray(stored) && (stored.length > 0 || !legacy.found || legacy.value.length === 0)) {
        cachedMoments = cloneMoments(stored);
        metadataReady = true;
        return { value: cloneMoments(stored), found: true, valid: true };
      }
      cachedMoments = cloneMoments(legacy.value);
      metadataReady = true;
      await momentWriter.enqueue(cachedMoments);
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
    await momentWriter.flush();
    if (latestMomentPersistenceError && cachedMoments) {
      const fallback = writeArray(storageKeys.moments, cachedMoments);
      if (!fallback.success) return fallback;
      return { success: true };
    }
    // Keep the local snapshot as a durable recovery source. It is small for
    // normal text Moments, and is essential on browsers that suspend or clear
    // IndexedDB metadata while a PWA is being refreshed.
    return { success: true };
  } catch (error) {
    const name = error && typeof error === "object" ? String((error as { name?: unknown }).name || "") : "";
    return { success: false, error: name === "QuotaExceededError" ? "quota" : "write" };
  }
}
