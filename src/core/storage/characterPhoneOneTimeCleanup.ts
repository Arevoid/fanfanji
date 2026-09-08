import {
  clearCharacterPhoneRecordsForOneTimeCleanup,
  clearCharacterPhoneData,
  flushCharacterPhoneRepository,
  isCharacterPhoneIsolationRepairComplete,
  isCharacterPhoneOneTimeCleanupComplete,
  listCharacterPhonesForOneTimeCleanup,
  markCharacterPhoneIsolationRepairComplete,
  markCharacterPhoneOneTimeCleanupComplete,
  saveCharacterPhone,
} from "./repositories/characterPhoneRepository";
import { clearRebuildableCache } from "./rebuildableCache";
import { imageAssetDb } from "../../utils/imageAssetDb";
import type { StorageWriteResult } from "./storageTypes";

export interface CharacterPhoneOneTimeCleanupResult {
  ran: boolean;
  removedPhoneCount: number;
  result: StorageWriteResult;
}

let cleanupPromise: Promise<CharacterPhoneOneTimeCleanupResult> | null = null;
let isolationRepairPromise: Promise<CharacterPhoneOneTimeCleanupResult> | null = null;

/**
 * Reset only role-phone data that already exists on this browser profile.
 * Other app repositories and their caches are intentionally never enumerated
 * or cleared here. The completion marker is written last, so a failed cleanup
 * can safely retry on the next startup.
 */
export function runCharacterPhoneOneTimeCleanup(): Promise<CharacterPhoneOneTimeCleanupResult> {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    if (isCharacterPhoneOneTimeCleanupComplete()) {
      return { ran: false, removedPhoneCount: 0, result: { success: true } };
    }

    const phones = listCharacterPhonesForOneTimeCleanup();
    const characterIds = [...new Set(phones.map((phone) => phone.characterId).filter(Boolean))];
    for (const characterId of characterIds) {
      const cacheResult = await clearRebuildableCache({
        scope: "characterPhone",
        scopeId: characterId,
        target: "all",
        cleanupOrphanedResources: false,
        clearOriginCaches: false,
      });
      if (cacheResult.failedLocalStorageKeys.length > 0) {
        return {
          ran: true,
          removedPhoneCount: phones.length,
          result: { success: false, error: "remove" as const },
        };
      }
    }

    const imageAssetIds = [...new Set(phones.flatMap((phone) => phone.galleryItems ?? [])
      .map((item) => item.imageAssetId)
      .filter((id): id is string => Boolean(id)))];
    if (typeof indexedDB !== "undefined") {
      for (const imageAssetId of imageAssetIds) {
        try {
          await imageAssetDb.deleteImage(imageAssetId);
        } catch {
          return {
            ran: true,
            removedPhoneCount: phones.length,
            result: { success: false, error: "remove" as const },
          };
        }
      }
    }

    const cleared = await clearCharacterPhoneRecordsForOneTimeCleanup();
    if (!cleared.success) {
      return { ran: true, removedPhoneCount: phones.length, result: cleared };
    }
    // A mounted deep-link phone screen may recreate its fresh record in
    // response to the reset event. Include that queued write before marking
    // the one-time migration complete.
    const recreatedPhone = await flushCharacterPhoneRepository();
    if (!recreatedPhone.success) {
      return { ran: true, removedPhoneCount: phones.length, result: recreatedPhone };
    }
    const marked = markCharacterPhoneOneTimeCleanupComplete();
    return { ran: true, removedPhoneCount: phones.length, result: marked };
  })().finally(() => {
    cleanupPromise = null;
  });
  return cleanupPromise;
}

/**
 * Repair records created by the first source-hydration fix. Those records can
 * already contain a mirror of the main phone while still being marked as a
 * pending first initialization. Clear only the dedicated role-phone records,
 * keep their identity/settings, and leave the isolation marker in place until
 * a later successful first-life generation explicitly releases it.
 */
export function runCharacterPhoneIsolationRepair(): Promise<CharacterPhoneOneTimeCleanupResult> {
  if (isolationRepairPromise) return isolationRepairPromise;
  isolationRepairPromise = (async () => {
    if (isCharacterPhoneIsolationRepairComplete()) {
      return { ran: false, removedPhoneCount: 0, result: { success: true } };
    }

    // The caller normally hydrates the repository first, but flushing here
    // also makes the repair safe when it is invoked directly by a test or a
    // deep-link route while a previous write is still queued.
    const beforeFlush = await flushCharacterPhoneRepository();
    if (!beforeFlush.success) {
      return { ran: true, removedPhoneCount: 0, result: beforeFlush };
    }

    const phones = listCharacterPhonesForOneTimeCleanup();
    const characterIds = [...new Set(phones.map((phone) => phone.characterId).filter(Boolean))];
    for (const characterId of characterIds) {
      const cacheResult = await clearRebuildableCache({
        scope: "characterPhone",
        scopeId: characterId,
        target: "all",
        cleanupOrphanedResources: false,
        clearOriginCaches: false,
      });
      if (cacheResult.failedLocalStorageKeys.length > 0) {
        return {
          ran: true,
          removedPhoneCount: phones.length,
          result: { success: false, error: "remove" as const },
        };
      }
    }
    for (const phone of phones) {
      const cleared = clearCharacterPhoneData(phone);
      const saved = saveCharacterPhone(cleared);
      if (!saved.success) {
        return { ran: true, removedPhoneCount: phones.length, result: saved };
      }
    }
    const flushed = await flushCharacterPhoneRepository();
    if (!flushed.success) {
      return { ran: true, removedPhoneCount: phones.length, result: flushed };
    }
    // The formal records are already empty at this point. Delete their binary
    // gallery assets afterwards so a failed media cleanup cannot leave an old
    // record pointing at an asset that was removed prematurely.
    const imageAssetIds = [...new Set(phones.flatMap((phone) => phone.galleryItems ?? [])
      .map((item) => item.imageAssetId)
      .filter((id): id is string => Boolean(id)))];
    if (typeof indexedDB !== "undefined") {
      for (const imageAssetId of imageAssetIds) {
        try {
          await imageAssetDb.deleteImage(imageAssetId);
        } catch {
          return {
            ran: true,
            removedPhoneCount: phones.length,
            result: { success: false, error: "remove" as const },
          };
        }
      }
    }
    const marked = markCharacterPhoneIsolationRepairComplete();
    return { ran: true, removedPhoneCount: phones.length, result: marked };
  })().finally(() => {
    isolationRepairPromise = null;
  });
  return isolationRepairPromise;
}
