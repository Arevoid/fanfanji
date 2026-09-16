import { attachIndexedDbLifecycle } from "../core/storage/idbLifecycle";

/** IndexedDB-backed binary image assets. Metadata stays in localStorage records. */
class ImageAssetDB {
  private readonly dbName = "FanfanImageAssets";
  private readonly storeName = "images";
  private db: IDBDatabase | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName);
      };
      request.onsuccess = () => {
        this.db = request.result;
        attachIndexedDbLifecycle(request.result, () => { this.db = null; });
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, mode);
      let settled = false;
      let result: T;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error || transaction.error || new Error("Image asset transaction failed"));
      };
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error);
      try {
        const request = operation(transaction.objectStore(this.storeName));
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => fail(request.error);
      } catch (error) {
        fail(error instanceof DOMException ? error : new Error(String(error)));
      }
    });
  }

  async saveImage(id: string, image: Blob): Promise<void> { await this.run("readwrite", (store) => store.put(image, id)); }
  async getImage(id: string): Promise<Blob | null> { return (await this.run("readonly", (store) => store.get(id))) || null; }
  async deleteImage(id: string): Promise<void> { await this.run("readwrite", (store) => store.delete(id)); }
  async listImages(ids?: readonly string[]): Promise<Array<{ id: string; blob: Blob }>> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readonly");
      const store = transaction.objectStore(this.storeName);
      const requested = ids ? new Set(ids) : null;
      const result: Array<{ id: string; blob: Blob }> = [];
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(result);
          return;
        }
        const id = String(cursor.key);
        if ((!requested || requested.has(id)) && cursor.value instanceof Blob) {
          result.push({ id, blob: cursor.value });
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }
  async clearAll(): Promise<void> { await this.run("readwrite", (store) => store.clear()); }
}

export const imageAssetDb = new ImageAssetDB();
