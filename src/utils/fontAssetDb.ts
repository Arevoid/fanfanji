import { attachIndexedDbLifecycle } from "../core/storage/idbLifecycle";

/** IndexedDB-backed custom font files. Settings only retain lightweight metadata. */
class FontAssetDB {
  private readonly dbName = "FanfanFontAssets";
  private readonly storeName = "fonts";
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
        reject(error || transaction.error || new Error("Font asset transaction failed"));
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

  async saveFont(id: string, font: Blob): Promise<void> { await this.run("readwrite", (store) => store.put(font, id)); }
  async getFont(id: string): Promise<Blob | null> { return (await this.run("readonly", (store) => store.get(id))) || null; }
  async deleteFont(id: string): Promise<void> { await this.run("readwrite", (store) => store.delete(id)); }
  async clearAll(): Promise<void> { await this.run("readwrite", (store) => store.clear()); }
}

export const fontAssetDb = new FontAssetDB();
