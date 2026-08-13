import type { ReadingBookAsset } from "../../domain/reading/types";

const DB_NAME = "FanfanjiReadingDB";
const DB_VERSION = 2;
const ASSET_STORE = "assets";
const COVER_STORE = "covers";

function isValidAsset(asset: ReadingBookAsset): boolean {
  return typeof asset.assetId === "string" && asset.assetId.length > 0
    && typeof asset.userIdentityId === "string" && asset.userIdentityId.length > 0
    && typeof asset.bookId === "string" && asset.bookId.length > 0
    && typeof asset.contentHash === "string" && asset.contentHash.length > 0
    && typeof asset.mimeType === "string" && asset.mimeType.length > 0
    && Number.isFinite(asset.byteLength) && asset.byteLength >= 0
    && asset.blob instanceof Blob
    && Number.isFinite(asset.createdAt) && asset.createdAt >= 0;
}

class ReadingAssetDB {
  private db: IDBDatabase | null = null;

  private async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable");

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ASSET_STORE)) {
          const store = database.createObjectStore(ASSET_STORE, { keyPath: "assetId" });
          store.createIndex("byIdentityAndBook", ["userIdentityId", "bookId"], { unique: false });
        }
        if (!database.objectStoreNames.contains(COVER_STORE)) {
          database.createObjectStore(COVER_STORE);
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Reading database upgrade is blocked"));
    });
  }

  async save(asset: ReadingBookAsset): Promise<void> {
    if (!isValidAsset(asset)) throw new Error("Invalid reading book asset");
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(ASSET_STORE, "readwrite");
      transaction.objectStore(ASSET_STORE).put(asset);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async load(assetId: string, userIdentityId: string, bookId: string): Promise<ReadingBookAsset | null> {
    if (!assetId || !userIdentityId || !bookId) return null;
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const request = database.transaction(ASSET_STORE, "readonly").objectStore(ASSET_STORE).get(assetId);
      request.onsuccess = () => {
        const asset = request.result as ReadingBookAsset | undefined;
        if (!asset || asset.userIdentityId !== userIdentityId || asset.bookId !== bookId) {
          resolve(null);
          return;
        }
        resolve(asset);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async delete(assetId: string, userIdentityId: string, bookId: string): Promise<boolean> {
    const existing = await this.load(assetId, userIdentityId, bookId);
    if (!existing) return false;
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(ASSET_STORE, "readwrite");
      transaction.objectStore(ASSET_STORE).delete(assetId);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async clearAll(): Promise<void> {
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([ASSET_STORE, COVER_STORE], "readwrite");
      transaction.objectStore(ASSET_STORE).clear();
      transaction.objectStore(COVER_STORE).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async saveCover(bookId: string, blob: Blob): Promise<void> {
    if (!bookId || !(blob instanceof Blob) || !blob.type.startsWith("image/")) throw new Error("Invalid reading cover");
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(COVER_STORE, "readwrite");
      transaction.objectStore(COVER_STORE).put(blob, bookId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async loadCover(bookId: string): Promise<Blob | null> {
    if (!bookId) return null;
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const request = database.transaction(COVER_STORE, "readonly").objectStore(COVER_STORE).get(bookId);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteCover(bookId: string): Promise<void> {
    if (!bookId) return;
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(COVER_STORE, "readwrite");
      transaction.objectStore(COVER_STORE).delete(bookId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}

export const readingAssetDb = new ReadingAssetDB();
export { ASSET_STORE as READING_ASSET_STORE_NAME, DB_NAME as READING_DB_NAME, DB_VERSION as READING_DB_VERSION };
