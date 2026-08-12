import { audioDb } from "../../utils/audioDb";
import { imageAssetDb } from "../../utils/imageAssetDb";
import { stickerDb } from "../../utils/stickerDb";
import { offlineStoryDb } from "../../core/storage/offlineStoryDb";
import { fontAssetDb } from "../../utils/fontAssetDb";

type ClearableStorage = Pick<Storage, "clear">;
type ClearableCacheStorage = Pick<CacheStorage, "keys" | "delete">;

interface ClearApplicationDataDependencies {
  persistentStorage: ClearableStorage;
  sessionStorage?: ClearableStorage;
  cacheStorage?: ClearableCacheStorage;
  binaryStoreClearers: Array<() => Promise<void>>;
}

function getDefaultDependencies(): ClearApplicationDataDependencies {
  return {
    persistentStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    cacheStorage: typeof caches === "undefined" ? undefined : caches,
    binaryStoreClearers: [
      () => audioDb.clearAll(),
      () => imageAssetDb.clearAll(),
      () => stickerDb.clearAll(),
      () => offlineStoryDb.clearAll(),
      () => fontAssetDb.clearAll(),
    ],
  };
}

/** Clears every browser persistence layer used by the app. localStorage is cleared last. */
export async function clearApplicationData(
  dependencies: ClearApplicationDataDependencies = getDefaultDependencies(),
): Promise<void> {
  await Promise.all(dependencies.binaryStoreClearers.map((clearStore) => clearStore()));

  if (dependencies.cacheStorage) {
    const cacheNames = await dependencies.cacheStorage.keys();
    await Promise.all(cacheNames.map((cacheName) => dependencies.cacheStorage!.delete(cacheName)));
  }

  dependencies.sessionStorage?.clear();
  dependencies.persistentStorage.clear();
}

export type { ClearApplicationDataDependencies };
