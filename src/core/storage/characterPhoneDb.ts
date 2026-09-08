import type { CharacterPhoneRecord } from "../../domain/characterPhone/types";

const DB_NAME = "FanfanjiCharacterPhoneDB";
const DB_VERSION = 1;
const STORE_NAME = "phones";

/**
 * Character-phone records are formal user data, not a cache. Keep them in a
 * dedicated IndexedDB store so a full localStorage bucket (often occupied by
 * chat history or image metadata) cannot make a phone appear empty.
 */
class CharacterPhoneDB {
  private database: IDBDatabase | null = null;

  private async init(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable");
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        callback();
      };
      const timer = globalThis.setTimeout(() => finish(() => reject(new Error("Character phone database open timed out"))), 8000);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => {
        this.database = request.result;
        this.database.onversionchange = () => {
          this.database?.close();
          this.database = null;
        };
        finish(() => resolve(request.result));
      };
      request.onerror = () => finish(() => reject(request.error));
      request.onblocked = () => finish(() => reject(new Error("Character phone database is blocked")));
    });
  }

  async loadAll(): Promise<CharacterPhoneRecord[]> {
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as CharacterPhoneRecord[] : []);
      request.onerror = () => reject(request.error);
    });
  }

  async replaceAll(phones: readonly CharacterPhoneRecord[]): Promise<void> {
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      phones.forEach((phone) => store.put(phone));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async clearAll(): Promise<void> {
    // Browsers without IndexedDB still use the legacy localStorage backend;
    // clearing all data must not fail merely because this optional store does
    // not exist there.
    if (typeof indexedDB === "undefined") return;
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}

export const characterPhoneDb = new CharacterPhoneDB();
export { DB_NAME as CHARACTER_PHONE_DB_NAME, STORE_NAME as CHARACTER_PHONE_DB_STORE_NAME };
