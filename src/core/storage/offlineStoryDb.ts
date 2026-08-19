import type { OfflineStory } from "../../types";
import { isOfflineStoryEntryStoreEnabled } from "./contentStorageFlags";
import { offlineStoryEntryDb } from "./offlineStoryEntryDb";

class OfflineStoryDB {
  private readonly dbName = "FanfanjiOfflineStoryDB";
  private readonly storeName = "stories";
  private db: IDBDatabase | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  private useEntryStore(): boolean {
    return typeof indexedDB !== "undefined" && isOfflineStoryEntryStoreEnabled();
  }

  private enqueueWrite(operation: (db: IDBDatabase) => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(async () => operation(await this.init()));
    // Keep the queue usable after a failed write while preserving the error for
    // the caller that initiated this operation.
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  private async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable");
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "id" });
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
    });
  }

  async loadAll(): Promise<OfflineStory[]> {
    if (this.useEntryStore()) return offlineStoryEntryDb.loadAll();
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const request = db.transaction(this.storeName, "readonly").objectStore(this.storeName).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as OfflineStory[] : []);
      request.onerror = () => reject(request.error);
    });
  }

  async save(story: OfflineStory): Promise<void> {
    if (this.useEntryStore()) return offlineStoryEntryDb.save(story);
    return this.enqueueWrite((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      transaction.objectStore(this.storeName).put(story);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }

  async replaceAll(stories: readonly OfflineStory[]): Promise<void> {
    if (this.useEntryStore()) return offlineStoryEntryDb.replaceAll(stories);
    return this.enqueueWrite((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      store.clear();
      stories.forEach((story) => store.put(story));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }

  async delete(storyId: string): Promise<void> {
    if (this.useEntryStore()) return offlineStoryEntryDb.delete(storyId);
    return this.enqueueWrite((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      transaction.objectStore(this.storeName).delete(storyId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }

  async clearAll(): Promise<void> {
    if (this.useEntryStore()) return offlineStoryEntryDb.clearAll();
    return this.enqueueWrite((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      transaction.objectStore(this.storeName).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }

  /** Clears only the retained legacy copy; the migrated entry store is never touched. */
  async clearLegacyCopy(): Promise<void> {
    return this.enqueueWrite((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      transaction.objectStore(this.storeName).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }
}

export const offlineStoryDb = new OfflineStoryDB();
