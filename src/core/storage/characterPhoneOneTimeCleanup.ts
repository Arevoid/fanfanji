import {
  clearCharacterPhoneRecordsForOneTimeCleanup,
  flushCharacterPhoneRepository,
  isCharacterPhoneOneTimeCleanupComplete,
  listCharacterPhonesForOneTimeCleanup,
  markCharacterPhoneOneTimeCleanupComplete,
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
