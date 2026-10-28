/** Metadata only. No messages, credentials or user content enter this database. */
export const MEMORY_WRITER_LEASE_MS = 30_000;
const DB_NAME = "fanfanji-memory-writer-coordination";
const STORE = "leases";
const KEY = "writer";
interface Lease { owner: string; expiresAt: number }

export async function openMemoryWriterLease(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, 1);
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; reject(new Error("Writer coordination unavailable")); }, 5_000);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      clearTimeout(timeout);
      const db = request.result;
      if (timedOut) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => { clearTimeout(timeout); reject(request.error); };
  });
}

/** Read + compare + write share one serialized readwrite transaction.
 * Expired owners may never renew: a resumed page must reload its stale state. */
export function updateMemoryWriterLease(db: IDBDatabase, owner: string, mode: "acquire" | "renew" | "release", now = Date.now()): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const request = store.get(KEY);
    let expiresAt = 0;
    const timeout = setTimeout(() => { try { tx.abort(); } catch { /* Already completed. */ } }, 5_000);
    request.onsuccess = () => {
      const current = request.result as Lease | undefined;
      if (mode === "release") {
        if (current?.owner === owner) store.delete(KEY);
      } else if (mode === "acquire" ? !current || current.expiresAt <= now : current?.owner === owner && current.expiresAt > now) {
        expiresAt = now + MEMORY_WRITER_LEASE_MS;
        store.put({ owner, expiresAt } satisfies Lease, KEY);
      }
    };
    tx.oncomplete = () => { clearTimeout(timeout); resolve(expiresAt); };
    tx.onabort = tx.onerror = () => { clearTimeout(timeout); reject(tx.error || new Error("Writer lease transaction failed")); };
  });
}
