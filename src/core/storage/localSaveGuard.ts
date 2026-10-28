import type { StorageWriteResult } from "./storageTypes";
import { reportSaveConflict } from "./saveConflictGuard";

/** A short IndexedDB transaction serializes compare-and-save for synchronous
 * LocalStorage datasets. No user payload is copied into the guard database. */
export class LocalSaveGuard {
  private db?: IDBDatabase;
  private cache = new Map<string, string | null>();
  private queue: Promise<StorageWriteResult> = Promise.resolve({success:true});
  private failed?: StorageWriteResult;
  async initialize(factory: IDBFactory): Promise<void> {
    this.db = await new Promise((resolve, reject) => {
      const opening = factory.open("fanfanji-save-coordination", 1);
      const timer = setTimeout(() => reject(new Error("save_guard_unavailable")), 5000);
      opening.onupgradeneeded = () => opening.result.createObjectStore("saves");
      opening.onsuccess = () => { clearTimeout(timer); resolve(opening.result); };
      opening.onerror = () => { clearTimeout(timer); reject(opening.error); };
      opening.onblocked = () => { clearTimeout(timer); reject(new Error("save_guard_blocked")); };
    });
  }
  read(storage: Storage, key: string): string | null {
    if (!this.cache.has(key)) this.cache.set(key, storage.getItem(key));
    return this.cache.get(key)!;
  }
  stage(storage: Storage, key: string, value: string | null, write: () => StorageWriteResult): StorageWriteResult {
    if (!this.db) return {success:false,error:"unavailable"};
    const before = this.read(storage,key);
    if (before === value) return {success:true,pending:true,durable:this.queue};
    this.cache.set(key,value);
    const task = this.queue.then(() => new Promise<StorageWriteResult>(resolve => {
      let result: StorageWriteResult = {success:false,error:"write"};
      const tx = this.db!.transaction("saves","readwrite");
      const read = tx.objectStore("saves").get(key);
      read.onsuccess = () => {
        try {
        const current = storage.getItem(key);
        if (current === value) { result = {success:true}; return; }
        if (current !== before) {
          result = {success:false,error:"conflict"}; reportSaveConflict(key); tx.abort(); return;
        }
        result = write();
        if (!result.success) tx.abort();
        } catch { result = {success:false,error:"write"}; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => resolve(result);
    })).catch(() => ({success:false,error:"write" as const})).then(result => {
      if (!result.success) {
        this.failed = result;
        if (this.cache.get(key) === value) this.cache.set(key,before);
      }
      return result;
    });
    this.queue = task;
    return {success:true,pending:true,durable:task};
  }
  async flush(): Promise<StorageWriteResult> {
    await this.queue;
    const result = this.failed || {success:true}; this.failed = undefined; return result;
  }
}
export const localSaveGuard = new LocalSaveGuard();
