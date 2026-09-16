import type { InnerVoiceRecord } from "../../types";
import { attachIndexedDbLifecycle } from "./idbLifecycle";

export const INNER_VOICE_DB_NAME = "FanfanjiInnerVoiceDB";
export const INNER_VOICE_DB_VERSION = 2;
export const INNER_VOICE_STORE_NAME = "records";

export function getInnerVoiceStorageScopeKey(record: InnerVoiceRecord): string {
  return record.relationId
    ? JSON.stringify(["direct", record.userIdentityId || "legacy", record.relationId, record.characterId, record.conversationId, record.messageId])
    : JSON.stringify(["group", record.userIdentityId || "legacy", record.groupId || "", record.conversationId, record.characterId, record.messageId]);
}

const withScopeKey = (record: InnerVoiceRecord): InnerVoiceRecord => ({
  ...record,
  storageScopeKey: getInnerVoiceStorageScopeKey(record),
});

class InnerVoiceDB {
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
      const timer = globalThis.setTimeout(() => finish(() => reject(new Error("Inner voice database open timed out"))), 8000);
      const request = indexedDB.open(INNER_VOICE_DB_NAME, INNER_VOICE_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        const store = database.objectStoreNames.contains(INNER_VOICE_STORE_NAME)
          ? request.transaction?.objectStore(INNER_VOICE_STORE_NAME)
          : database.createObjectStore(INNER_VOICE_STORE_NAME, { keyPath: "id" });
        if (!store) return;
        if (!store.indexNames.contains("byScopeKey")) store.createIndex("byScopeKey", "storageScopeKey", { unique: false });
        if (!store.indexNames.contains("byCharacterId")) store.createIndex("byCharacterId", "characterId", { unique: false });
        if (!store.indexNames.contains("byRelationId")) store.createIndex("byRelationId", "relationId", { unique: false });
        if (!store.indexNames.contains("byUserIdentityId")) store.createIndex("byUserIdentityId", "userIdentityId", { unique: false });
        if (!store.indexNames.contains("byGroupId")) store.createIndex("byGroupId", "groupId", { unique: false });
        if (!store.indexNames.contains("byConversationId")) store.createIndex("byConversationId", "conversationId", { unique: false });
        if (!store.indexNames.contains("byMessageId")) store.createIndex("byMessageId", "messageId", { unique: false });
      };
      request.onsuccess = () => {
        const database = request.result;
        this.database = database;
        attachIndexedDbLifecycle(database, () => { this.database = null; });
        finish(() => resolve(database));
      };
      request.onerror = () => finish(() => reject(request.error));
      request.onblocked = () => finish(() => reject(new Error("Inner voice database is blocked")));
    });
  }

  async loadAll(): Promise<InnerVoiceRecord[]> {
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const request = database.transaction(INNER_VOICE_STORE_NAME, "readonly")
        .objectStore(INNER_VOICE_STORE_NAME).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as InnerVoiceRecord[] : []);
      request.onerror = () => reject(request.error);
    });
  }

  async upsert(record: InnerVoiceRecord): Promise<void> {
    const database = await this.init();
    const normalized = withScopeKey(record);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(INNER_VOICE_STORE_NAME, "readwrite");
      const store = transaction.objectStore(INNER_VOICE_STORE_NAME);
      const request = store.index("byScopeKey").getAll(normalized.storageScopeKey);
      request.onsuccess = () => {
        for (const previous of request.result as InnerVoiceRecord[]) {
          if (previous.id !== normalized.id) store.delete(previous.id);
        }
        store.put(normalized);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async replaceAll(records: readonly InnerVoiceRecord[]): Promise<void> {
    const database = await this.init();
    const unique = new Map<string, InnerVoiceRecord>();
    for (const record of records) {
      const normalized = withScopeKey(record);
      const current = unique.get(normalized.storageScopeKey!);
      if (!current || normalized.createdAt >= current.createdAt) unique.set(normalized.storageScopeKey!, normalized);
    }
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(INNER_VOICE_STORE_NAME, "readwrite");
      const store = transaction.objectStore(INNER_VOICE_STORE_NAME);
      store.clear();
      for (const record of unique.values()) store.put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async clearAll(): Promise<void> {
    const database = await this.init();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(INNER_VOICE_STORE_NAME, "readwrite");
      transaction.objectStore(INNER_VOICE_STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}

export const innerVoiceDb = new InnerVoiceDB();
