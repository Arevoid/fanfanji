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
      request.onsuccess = () => { this.db = request.result; resolve(request.result); };
      request.onerror = () => reject(request.error);
    });
  }

  private async run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const request = operation(db.transaction(this.storeName, mode).objectStore(this.storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveImage(id: string, image: Blob): Promise<void> { await this.run("readwrite", (store) => store.put(image, id)); }
  async getImage(id: string): Promise<Blob | null> { return (await this.run("readonly", (store) => store.get(id))) || null; }
  async deleteImage(id: string): Promise<void> { await this.run("readwrite", (store) => store.delete(id)); }
}

export const imageAssetDb = new ImageAssetDB();
