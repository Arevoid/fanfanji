import { attachIndexedDbLifecycle } from "./idbLifecycle";

export const TRUTH_VECTOR_INDEX_DB_NAME = "FanfanjiTruthVectorIndexDB";
export const TRUTH_VECTOR_INDEX_DB_VERSION = 1;
export const TRUTH_VECTOR_INDEX_STORE_NAME = "truth_vectors";

export interface TruthVectorIndexRecord {
  id: string;
  kind: "claim" | "episode";
  scopeKey: string;
  relationId: string;
  characterId: string;
  userIdentityId: string;
  conversationId?: string;
  text: string;
  vector: number[];
  updatedAt: number;
}

const clone = <T>(value: T): T => typeof structuredClone === "function"
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value)) as T;

let database: IDBDatabase | null = null;

const openDatabase = (): Promise<IDBDatabase> => {
  if (database) return Promise.resolve(database);
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TRUTH_VECTOR_INDEX_DB_NAME, TRUTH_VECTOR_INDEX_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(TRUTH_VECTOR_INDEX_STORE_NAME)
        ? request.transaction?.objectStore(TRUTH_VECTOR_INDEX_STORE_NAME)
        : db.createObjectStore(TRUTH_VECTOR_INDEX_STORE_NAME, { keyPath: "id" });
      if (!store) return;
      if (!store.indexNames.contains("scopeKey")) store.createIndex("scopeKey", "scopeKey", { unique: false });
      if (!store.indexNames.contains("updatedAt")) store.createIndex("updatedAt", "updatedAt", { unique: false });
    };
    request.onsuccess = () => {
      database = request.result;
      attachIndexedDbLifecycle(database, () => { database = null; });
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error("truth vector index open failed"));
    request.onblocked = () => reject(new Error("truth vector index database is blocked"));
  });
};

export async function saveTruthVectorIndexRecords(records: readonly TruthVectorIndexRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(TRUTH_VECTOR_INDEX_STORE_NAME, "readwrite");
    const store = transaction.objectStore(TRUTH_VECTOR_INDEX_STORE_NAME);
    records.forEach((record) => store.put(clone(record)));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("truth vector index write failed"));
    transaction.onabort = () => reject(transaction.error || new Error("truth vector index write aborted"));
  });
}

export async function loadTruthVectorIndexRecords(scopeKey?: string): Promise<TruthVectorIndexRecord[]> {
  const db = await openDatabase();
  return new Promise<TruthVectorIndexRecord[]>((resolve, reject) => {
    const request = scopeKey
      ? db.transaction(TRUTH_VECTOR_INDEX_STORE_NAME, "readonly").objectStore(TRUTH_VECTOR_INDEX_STORE_NAME).index("scopeKey").getAll(scopeKey)
      : db.transaction(TRUTH_VECTOR_INDEX_STORE_NAME, "readonly").objectStore(TRUTH_VECTOR_INDEX_STORE_NAME).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result.map(clone) : []);
    request.onerror = () => reject(request.error || new Error("truth vector index read failed"));
  });
}

export async function removeTruthVectorIndexRecords(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(TRUTH_VECTOR_INDEX_STORE_NAME, "readwrite");
    const store = transaction.objectStore(TRUTH_VECTOR_INDEX_STORE_NAME);
    ids.forEach((id) => store.delete(id));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("truth vector index delete failed"));
    transaction.onabort = () => reject(transaction.error || new Error("truth vector index delete aborted"));
  });
}
