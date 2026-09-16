import type { Moment, MomentComment } from "../../../types";
import { storageKeys } from "../storageKeys";
import { writeArray, readArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readingAssetDb } from "../readingAssetDb";
import { remove } from "../storageAdapter";
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

function mergeMomentComments(primary: readonly MomentComment[], fallback: readonly MomentComment[]): MomentComment[] {
  const byId = new Map<string, MomentComment>();
  fallback.forEach((comment) => byId.set(comment.id, comment));
  primary.forEach((comment) => {
    const existing = byId.get(comment.id);
    if (!existing || comment.timestamp >= existing.timestamp) byId.set(comment.id, comment);
  });
  return [...byId.values()].sort((left, right) => left.timestamp - right.timestamp);
}

/**
 * Reconciles the canonical IndexedDB feed with its retained LocalStorage copy.
 * IndexedDB wins scalar conflicts, while missing legacy fields, likes, comments,
 * and local-only posts are carried forward before the legacy key is removed.
 */
export function mergeMomentSnapshots(primary: readonly Moment[], fallback: readonly Moment[]): Moment[] {
  const fallbackById = new Map(fallback.map((moment) => [moment.id, moment]));
  const primaryIds = new Set<string>();
  const merged = primary.map((moment) => {
    primaryIds.add(moment.id);
    const legacy = fallbackById.get(moment.id);
    if (!legacy) return moment;
    const primaryLikes = Array.isArray(moment.likes) ? moment.likes : [];
    const fallbackLikes = Array.isArray(legacy.likes) ? legacy.likes : [];
    const primaryComments = Array.isArray(moment.comments) ? moment.comments : [];
    const fallbackComments = Array.isArray(legacy.comments) ? legacy.comments : [];
    const mergedMoment: Moment = {
      ...legacy,
      ...moment,
    };
    if (Array.isArray(moment.likes) || Array.isArray(legacy.likes)) {
      mergedMoment.likes = [...new Set([...primaryLikes, ...fallbackLikes])];
    }
    if (Array.isArray(moment.comments) || Array.isArray(legacy.comments)) {
      mergedMoment.comments = mergeMomentComments(primaryComments, fallbackComments);
    }
    const primaryDeletedCommentIds = Array.isArray(moment.deletedCommentIds) ? moment.deletedCommentIds : [];
    const fallbackDeletedCommentIds = Array.isArray(legacy.deletedCommentIds) ? legacy.deletedCommentIds : [];
    if (Array.isArray(moment.deletedCommentIds) || Array.isArray(legacy.deletedCommentIds)) {
      mergedMoment.deletedCommentIds = [...new Set([...primaryDeletedCommentIds, ...fallbackDeletedCommentIds])];
    }
    return mergedMoment;
  });
  fallback.forEach((moment) => {
    if (!primaryIds.has(moment.id)) merged.push(moment);
  });
  return merged;
}

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
  void momentWriter.enqueue(snapshot)
    .then(async () => {
      if (cachedMoments === snapshot) {
        const persisted = await readingAssetDb.loadMetadataValue<Moment[]>(MOMENT_METADATA_KEY);
        if (!Array.isArray(persisted) || JSON.stringify(persisted) !== JSON.stringify(snapshot)) {
          throw new Error("IndexedDB Moment snapshot verification failed");
        }
        latestMomentPersistenceError = null;
        const legacyRemoval = remove(storageKeys.moments);
        if (!legacyRemoval.success) console.warn("[storage] IndexedDB Moments are durable, but the redundant LocalStorage copy could not be removed.");
        remove(MOMENT_PENDING_SNAPSHOT_KEY);
      }
    })
    .catch((error) => {
      if (cachedMoments !== snapshot) return;
      latestMomentPersistenceError = error;
      const fallback = writeArray(storageKeys.moments, snapshot);
      if (!fallback.success) console.warn("[storage] Failed to persist Moments in IndexedDB and localStorage.", error);
      else console.warn("[storage] IndexedDB persistence failed; retained a LocalStorage Moment snapshot.", error);
    });
  return { success: true };
};

export async function initializeMomentRepository(fallback: Moment[]): Promise<StorageResult<Moment[]>> {
  if (typeof indexedDB === "undefined") return loadLegacyMoments(fallback);
  if (metadataReady && cachedMoments) return { value: cloneMoments(cachedMoments), found: true, valid: true };
  if (initializationPromise) return initializationPromise;
  const initializationMutationVersion = mutationVersion;
  initializationPromise = (async () => {
    let recoverySnapshot: Moment[] | null = null;
    try {
      const stored = await readingAssetDb.loadMetadataValue<Moment[]>(MOMENT_METADATA_KEY);
      if (mutationVersion !== initializationMutationVersion && cachedMoments) {
        return { value: cloneMoments(cachedMoments), found: true, valid: true };
      }
      const legacy = loadLegacyMoments(fallback);
      if (Array.isArray(stored)) {
        const merged = legacy.valid && legacy.found ? mergeMomentSnapshots(stored, legacy.value) : stored;
        recoverySnapshot = merged;
        if (JSON.stringify(merged) !== JSON.stringify(stored)) {
          await momentWriter.enqueue(merged);
          const verified = await readingAssetDb.loadMetadataValue<Moment[]>(MOMENT_METADATA_KEY);
          if (!Array.isArray(verified) || JSON.stringify(verified) !== JSON.stringify(merged)) {
            throw new Error("Merged IndexedDB Moment snapshot verification failed");
          }
        }
        cachedMoments = cloneMoments(merged);
        metadataReady = true;
        if (legacy.valid && legacy.found) {
          const legacyRemoval = remove(storageKeys.moments);
          if (!legacyRemoval.success) console.warn("[storage] The merged IndexedDB Moment snapshot is verified, but the legacy LocalStorage copy could not be removed.");
        }
        remove(MOMENT_PENDING_SNAPSHOT_KEY);
        latestMomentPersistenceError = null;
        return { value: cloneMoments(merged), found: true, valid: true };
      }

      if (!legacy.valid) return legacy;
      cachedMoments = cloneMoments(legacy.value);
      recoverySnapshot = cachedMoments;
      metadataReady = true;
      if (legacy.found) {
        await momentWriter.enqueue(cachedMoments);
        const verified = await readingAssetDb.loadMetadataValue<Moment[]>(MOMENT_METADATA_KEY);
        if (!Array.isArray(verified) || JSON.stringify(verified) !== JSON.stringify(cachedMoments)) {
          throw new Error("Migrated IndexedDB Moment snapshot verification failed");
        }
        const legacyRemoval = remove(storageKeys.moments);
        if (!legacyRemoval.success) console.warn("[storage] The migrated IndexedDB Moment snapshot is verified, but the legacy LocalStorage copy could not be removed.");
      }
      remove(MOMENT_PENDING_SNAPSHOT_KEY);
      latestMomentPersistenceError = null;
      return legacy;
    } catch (error) {
      console.warn("[storage] Moment IndexedDB initialization failed; using localStorage for this session.", error);
      latestMomentPersistenceError = error;
      if (recoverySnapshot) {
        // Surface both intact copies in memory, but keep the LocalStorage
        // recovery source until the merged IndexedDB transaction verifies.
        cachedMoments = cloneMoments(recoverySnapshot);
        metadataReady = true;
        return { value: cloneMoments(recoverySnapshot), found: true, valid: true, error: "write" };
      }
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
  } catch (error) {
    latestMomentPersistenceError = error;
  }

  if (latestMomentPersistenceError) {
    if (!cachedMoments) {
      const name = latestMomentPersistenceError && typeof latestMomentPersistenceError === "object"
        ? String((latestMomentPersistenceError as { name?: unknown }).name || "")
        : "";
      return { success: false, error: name === "QuotaExceededError" ? "quota" : "write" };
    }
    try {
      await momentWriter.enqueue(cachedMoments);
      const verified = await readingAssetDb.loadMetadataValue<Moment[]>(MOMENT_METADATA_KEY);
      if (!Array.isArray(verified) || JSON.stringify(verified) !== JSON.stringify(cachedMoments)) {
        throw new Error("IndexedDB Moment retry verification failed");
      }
      latestMomentPersistenceError = null;
      const legacyRemoval = remove(storageKeys.moments);
      if (!legacyRemoval.success) console.warn("[storage] IndexedDB Moments are durable, but the redundant LocalStorage copy could not be removed.");
      remove(MOMENT_PENDING_SNAPSHOT_KEY);
      return { success: true };
    } catch (error) {
      latestMomentPersistenceError = error;
      const fallback = writeArray(storageKeys.moments, cachedMoments);
      return fallback.success ? { success: true } : fallback;
    }
  }

  if (cachedMoments) {
    const persisted = await readingAssetDb.loadMetadataValue<Moment[]>(MOMENT_METADATA_KEY);
    if (!Array.isArray(persisted) || JSON.stringify(persisted) !== JSON.stringify(cachedMoments)) {
      try {
        await momentWriter.enqueue(cachedMoments);
        const verified = await readingAssetDb.loadMetadataValue<Moment[]>(MOMENT_METADATA_KEY);
        if (!Array.isArray(verified) || JSON.stringify(verified) !== JSON.stringify(cachedMoments)) {
          throw new Error("IndexedDB Moment flush verification failed");
        }
        latestMomentPersistenceError = null;
      } catch (error) {
        latestMomentPersistenceError = error;
        const fallback = writeArray(storageKeys.moments, cachedMoments);
        return fallback.success ? { success: true } : fallback;
      }
    }
    const legacyRemoval = remove(storageKeys.moments);
    if (!legacyRemoval.success) console.warn("[storage] IndexedDB Moments are durable, but the redundant LocalStorage copy could not be removed.");
  }
  remove(MOMENT_PENDING_SNAPSHOT_KEY);
  return { success: true };
}
