import { attachIndexedDbLifecycle } from "../core/storage/idbLifecycle";

class AudioDB {
  private dbName = "MusicAppDB";
  private storeName = "localTracks";
  private coverStoreName = "trackCovers";
  private db: IDBDatabase | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
        if (!db.objectStoreNames.contains(this.coverStoreName)) {
          db.createObjectStore(this.coverStoreName);
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        attachIndexedDbLifecycle(request.result, () => { this.db = null; });
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async run<T>(storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      let settled = false;
      let result: T;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error || transaction.error || new Error("Music asset transaction failed"));
      };
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error);
      try {
        const request = operation(transaction.objectStore(storeName));
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => fail(request.error);
      } catch (error) {
        fail(error instanceof DOMException ? error : new Error(String(error)));
      }
    });
  }

  async saveTrackFile(id: string, file: Blob): Promise<void> {
    await this.run(this.storeName, "readwrite", (store) => store.put(file, id));
  }

  async getTrackFile(id: string): Promise<Blob | null> {
    return (await this.run(this.storeName, "readonly", (store) => store.get(id))) || null;
  }

  async deleteTrackFile(id: string): Promise<void> {
    await this.run(this.storeName, "readwrite", (store) => store.delete(id));
  }

  async saveTrackCover(id: string, file: Blob): Promise<void> {
    await this.run(this.coverStoreName, "readwrite", (store) => store.put(file, id));
  }

  async getTrackCover(id: string): Promise<Blob | null> {
    return (await this.run(this.coverStoreName, "readonly", (store) => store.get(id))) || null;
  }

  async deleteTrackCover(id: string): Promise<void> {
    await this.run(this.coverStoreName, "readwrite", (store) => store.delete(id));
  }

  async clearAll(): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName, this.coverStoreName], "readwrite");
      transaction.objectStore(this.storeName).clear();
      transaction.objectStore(this.coverStoreName).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}

export const getTrackAudioAssetId = (track: { id: string; audioAssetId?: string }) =>
  track.audioAssetId || track.id;

export const audioDb = new AudioDB();
