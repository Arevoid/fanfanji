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
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveTrackFile(id: string, file: Blob): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.put(file, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getTrackFile(id: string): Promise<Blob | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteTrackFile(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveTrackCover(id: string, file: Blob): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const request = db.transaction(this.coverStoreName, "readwrite").objectStore(this.coverStoreName).put(file, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getTrackCover(id: string): Promise<Blob | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const request = db.transaction(this.coverStoreName, "readonly").objectStore(this.coverStoreName).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteTrackCover(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const request = db.transaction(this.coverStoreName, "readwrite").objectStore(this.coverStoreName).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const getTrackAudioAssetId = (track: { id: string; audioAssetId?: string }) =>
  track.audioAssetId || track.id;

export const audioDb = new AudioDB();
