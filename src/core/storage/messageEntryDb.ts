import type { Message } from "../../types";

export const MESSAGE_ENTRY_DB_NAME = "FanfanjiMessageEntryDB";
export const MESSAGE_ENTRY_DB_VERSION = 2;
export const MESSAGE_ENTRY_STORE_NAME = "messages";

interface MessageEntryRecord {
  recordId: string;
  position: number;
  characterId: string;
  relationId?: string;
  conversationId?: string;
  timestamp: number;
  message: Message;
}

export interface MessageEntryQuery {
  characterId?: string;
  relationId?: string;
  conversationId?: string;
  offset?: number;
  limit: number;
}

const clone = <T>(value: T): T => typeof structuredClone === "function"
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value)) as T;

function toEntries(messages: readonly Message[]): MessageEntryRecord[] {
  return messages.map((message, position) => ({
    recordId: `${message.id}::${position}`,
    position,
    characterId: message.characterId,
    relationId: message.relationId,
    conversationId: message.conversationId,
    timestamp: message.timestamp,
    message: clone(message),
  }));
}

function fromEntries(entries: readonly MessageEntryRecord[]): Message[] {
  return [...entries]
    .sort((left, right) => left.position - right.position)
    .map((entry) => clone(entry.message));
}

class MessageEntryDB {
  private db: IDBDatabase | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private persistedEntries: MessageEntryRecord[] | null = null;

  private async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable");
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(MESSAGE_ENTRY_DB_NAME, MESSAGE_ENTRY_DB_VERSION);
      request.onupgradeneeded = (event) => {
        const database = request.result;
        const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
        const store = database.objectStoreNames.contains(MESSAGE_ENTRY_STORE_NAME)
          ? request.transaction?.objectStore(MESSAGE_ENTRY_STORE_NAME)
          : database.createObjectStore(MESSAGE_ENTRY_STORE_NAME, { keyPath: "recordId" });
        if (!store) return;
        if (!store.indexNames.contains("byCharacterId")) store.createIndex("byCharacterId", "characterId", { unique: false });
        if (!store.indexNames.contains("byRelationId")) store.createIndex("byRelationId", "relationId", { unique: false });
        if (!store.indexNames.contains("byConversationId")) store.createIndex("byConversationId", "conversationId", { unique: false });
        if (!store.indexNames.contains("byTimestamp")) store.createIndex("byTimestamp", "timestamp", { unique: false });
        if (oldVersion < 2 && !store.indexNames.contains("byPosition")) store.createIndex("byPosition", "position", { unique: false });
      };
      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Message entry database is blocked"));
    });
  }

  private enqueue(operation: (database: IDBDatabase) => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(async () => operation(await this.init()));
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  async loadAll(): Promise<Message[]> {
    const database = await this.init();
    const entries = await new Promise<MessageEntryRecord[]>((resolve, reject) => {
      const request = database.transaction(MESSAGE_ENTRY_STORE_NAME, "readonly").objectStore(MESSAGE_ENTRY_STORE_NAME).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as MessageEntryRecord[] : []);
      request.onerror = () => reject(request.error);
    });
    this.persistedEntries = entries.map((entry) => clone(entry));
    return fromEntries(entries);
  }

  async loadWindow(query: MessageEntryQuery): Promise<Message[]> {
    const limit = Math.max(0, Math.floor(query.limit));
    const offset = Math.max(0, Math.floor(query.offset || 0));
    if (!limit) return [];
    const database = await this.init();
    return new Promise<Message[]>((resolve, reject) => {
      const request = database.transaction(MESSAGE_ENTRY_STORE_NAME, "readonly")
        .objectStore(MESSAGE_ENTRY_STORE_NAME).index("byPosition").openCursor();
      const result: MessageEntryRecord[] = [];
      let skipped = 0;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(fromEntries(result));
          return;
        }
        const entry = cursor.value as MessageEntryRecord;
        const matches = (!query.characterId || entry.characterId === query.characterId)
          && (!query.relationId || entry.relationId === query.relationId)
          && (!query.conversationId || entry.conversationId === query.conversationId);
        if (matches) {
          if (skipped < offset) skipped += 1;
          else if (result.length < limit) result.push(clone(entry));
        }
        if (result.length >= limit) resolve(fromEntries(result));
        else cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async replaceAll(messages: readonly Message[]): Promise<void> {
    const entries = toEntries(messages);
    await this.enqueue((database) => new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(MESSAGE_ENTRY_STORE_NAME, "readwrite");
      const store = transaction.objectStore(MESSAGE_ENTRY_STORE_NAME);
      store.clear();
      entries.forEach((entry) => store.put(entry));
      transaction.oncomplete = () => {
        this.persistedEntries = entries.map((entry) => clone(entry));
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }

  async saveSnapshot(messages: readonly Message[]): Promise<void> {
    const entries = toEntries(messages);
    await this.enqueue((database) => new Promise<void>((resolve, reject) => {
      const previous = new Map((this.persistedEntries || []).map((entry) => [entry.recordId, entry]));
      const nextIds = new Set(entries.map((entry) => entry.recordId));
      const transaction = database.transaction(MESSAGE_ENTRY_STORE_NAME, "readwrite");
      const store = transaction.objectStore(MESSAGE_ENTRY_STORE_NAME);
      previous.forEach((entry, recordId) => {
        if (!nextIds.has(recordId)) store.delete(recordId);
      });
      entries.forEach((entry) => {
        const old = previous.get(entry.recordId);
        if (!old || JSON.stringify(old) !== JSON.stringify(entry)) store.put(entry);
      });
      transaction.oncomplete = () => {
        this.persistedEntries = entries.map((entry) => clone(entry));
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  async clearAll(): Promise<void> {
    await this.enqueue((database) => new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(MESSAGE_ENTRY_STORE_NAME, "readwrite");
      transaction.objectStore(MESSAGE_ENTRY_STORE_NAME).clear();
      transaction.oncomplete = () => {
        this.persistedEntries = [];
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }
}

export const messageEntryDb = new MessageEntryDB();
