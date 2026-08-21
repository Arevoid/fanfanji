import type { CinemaAssetKind } from "../../domain/cinema/types";

const DB_NAME = "FanfanjiCinemaDB";
const DB_VERSION = 1;
const STORE_NAME = "assets";

interface StoredCinemaAsset {
  assetId: string;
  kind: CinemaAssetKind;
  mimeType: string;
  blob: Blob;
  byteLength: number;
  createdAt: number;
}

class CinemaAssetDB {
  private db: IDBDatabase | null = null;

  private async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB 不可用，无法保存影视文件");
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        callback();
      };
      const timer = globalThis.setTimeout(() => finish(() => reject(new Error("影视资源数据库打开超时"))), 8000);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "assetId" });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };
        this.db.onclose = () => { this.db = null; };
        finish(() => resolve(request.result));
      };
      request.onerror = () => finish(() => reject(request.error || new Error("影视资源数据库打开失败")));
      request.onblocked = () => finish(() => reject(new Error("影视资源数据库被其他页面占用")));
    });
  }

  async save(input: { assetId: string; kind: CinemaAssetKind; blob: Blob }): Promise<void> {
    if (!input.assetId || !(input.blob instanceof Blob)) throw new Error("影视资源无效");
    const database = await this.init();
    const record: StoredCinemaAsset = {
      assetId: input.assetId,
      kind: input.kind,
      mimeType: input.blob.type || "application/octet-stream",
      blob: input.blob,
      byteLength: input.blob.size,
      createdAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("影视资源写入失败"));
      transaction.onabort = () => reject(transaction.error || new Error("影视资源写入中断"));
    });
  }

  async load(assetId: string): Promise<StoredCinemaAsset | null> {
    if (!assetId) return null;
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(assetId);
      request.onsuccess = () => resolve(request.result instanceof Object ? request.result as StoredCinemaAsset : null);
      request.onerror = () => reject(request.error || new Error("影视资源读取失败"));
    });
  }

  async delete(assetId: string): Promise<void> {
    if (!assetId) return;
    const database = await this.init();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(assetId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("影视资源删除失败"));
      transaction.onabort = () => reject(transaction.error || new Error("影视资源删除中断"));
    });
  }

  async clearAll(): Promise<void> {
    const database = await this.init();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("影视资源清理失败"));
      transaction.onabort = () => reject(transaction.error || new Error("影视资源清理中断"));
    });
  }
}

export const cinemaAssetDb = new CinemaAssetDB();
export const CINEMA_ASSET_DB_NAME = DB_NAME;
export const CINEMA_ASSET_STORE_NAME = STORE_NAME;
