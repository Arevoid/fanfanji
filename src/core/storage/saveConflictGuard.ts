/** Compare the loaded snapshot inside the same transaction that writes it.
 * IndexedDB serializes overlapping readwrite transactions across windows.
 * No wall clock, lease, heartbeat or page-wide write ownership is involved. */
export const SAVE_CONFLICT_MESSAGE = "数据已被其他页面更新，本次未覆盖。请保留当前输入，刷新后重试。";
export function reportSaveConflict(key: string): void {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent !== "undefined")
    window.dispatchEvent(new CustomEvent("fanfanji-storage-write-failed", {detail:{key,error:"conflict",source:"save-conflict"}}));
}
export class SnapshotWriteGuard {
  private snapshots = new Map<string, string>();
  // Do not let an incidental background read authorize stale UI state. Only
  // this page's own durable writes advance its original save baseline.
  capture(store: string, rows: unknown[]): void { if (!this.snapshots.has(store)) this.snapshots.set(store, JSON.stringify(rows)); }
  protect(tx: IDBTransaction, stores: string[]): void {
    const before = new Map(this.snapshots);
    for (const name of stores) {
      const read = tx.objectStore(name).getAll();
      read.onsuccess = () => {
        const current = JSON.stringify(read.result);
        if (before.has(name) ? before.get(name) !== current : read.result.length > 0) {
          reportSaveConflict(name); tx.abort(); return;
        }
      };
    }
  }
  /** Call after the final business writes have been queued, including writes
   * queued from request callbacks. Capture only on durable transaction success. */
  captureAfter(tx: IDBTransaction, stores: string[]): void {
    const after = new Map<string, string>();
    for (const name of stores) {
      const read = tx.objectStore(name).getAll();
      read.onsuccess = () => after.set(name, JSON.stringify(read.result));
    }
    tx.addEventListener("complete", () => { for (const [name, raw] of after) this.snapshots.set(name, raw); });
  }
}

/** Out-of-line keyed stores must compare key + value, not just getAll values. */
export class KeyWriteGuard {
  private snapshots = new Map<string,string>();
  capture(key:string,value:unknown): void {
    if (!this.snapshots.has(key)) this.snapshots.set(key,JSON.stringify(value) ?? "undefined");
  }
  protect(tx:IDBTransaction,store:string,key:string): void {
    const expected = this.snapshots.get(key) ?? "undefined";
    const read = tx.objectStore(store).get(key);
    read.onsuccess = () => {
      if ((JSON.stringify(read.result) ?? "undefined") !== expected) { reportSaveConflict(key); tx.abort(); }
    };
  }
  captureAfter(tx:IDBTransaction,store:string,key:string): void {
    let next = "undefined";
    const read = tx.objectStore(store).get(key);
    read.onsuccess = () => {next = JSON.stringify(read.result) ?? "undefined";};
    tx.addEventListener("complete",()=>this.snapshots.set(key,next));
  }
}
