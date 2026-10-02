import type { CustomWidgetDefinition } from "../../domain/home/customWidgetTypes";

const DB_NAME = "FanfanjiCustomWidgetsDB";
const DB_VERSION = 1;
const STORE_NAME = "widgets";

class CustomWidgetDB {
  private database: IDBDatabase | null = null;

  private async init(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable");
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => {
        this.database = request.result;
        this.database.onversionchange = () => { this.database?.close(); this.database = null; };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error("Custom widget database failed to open"));
      request.onblocked = () => reject(new Error("Custom widget database is blocked"));
    });
  }

  async loadAll(): Promise<CustomWidgetDefinition[]> {
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as CustomWidgetDefinition[] : []);
      request.onerror = () => reject(request.error);
    });
  }

  async put(widget: CustomWidgetDefinition): Promise<void> {
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(widget);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async replaceAll(widgets: readonly CustomWidgetDefinition[]): Promise<void> {
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      widgets.forEach((widget) => store.put(widget));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async remove(id: string): Promise<void> {
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async clearAll(): Promise<void> {
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

export const customWidgetDb = new CustomWidgetDB();
export { DB_NAME as CUSTOM_WIDGET_DB_NAME, STORE_NAME as CUSTOM_WIDGET_DB_STORE_NAME };
