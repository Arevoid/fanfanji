import type { Message } from "../../types";
import { canWriteMemoryStorage } from "./memoryWriterCoordination";
import { storageKeys } from "./storageKeys";

export const MESSAGE_ENTRY_DB_NAME = "FanfanjiMessageEntryDB";
export const MESSAGE_ENTRY_DB_VERSION = 3;
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
export interface MessageEntryPageQuery {
  characterId: string;
  relationId?: string;
  conversationId?: string;
  before?: { timestamp: number; id: string };
  limit: number;
}
export interface MessageEntryPage { items: Message[]; hasEarlier: boolean; cursor?: { timestamp: number; id: string } }

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
        // Index existing records in-place. No record rewriting or snapshot deletion.
        for (const [name, keys] of [
          ["byCharacterTimeline", ["characterId", "timestamp", "message.id", "position"]],
          ["byRelationTimeline", ["characterId", "relationId", "timestamp", "message.id", "position"]],
          ["byConversationTimeline", ["characterId", "conversationId", "timestamp", "message.id", "position"]],
        ] as const) if (!store.indexNames.contains(name)) store.createIndex(name, [...keys], { unique: false });
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
    const next = this.writeQueue.then(async () => {
      const database = await this.init();
      if (!canWriteMemoryStorage(storageKeys.messages)) throw new Error("聊天存储只读，请刷新页面后重试");
      return operation(database);
    });
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
    this.persistedEntries = entries;
    return fromEntries(entries);
  }

  async loadWindow(query: MessageEntryQuery): Promise<Message[]> {
    const limit = Math.max(0, Math.floor(query.limit));
    const offset = Math.max(0, Math.floor(query.offset || 0));
    if (!limit) return [];
    const database = await this.init();
    return new Promise<Message[]>((resolve, reject) => {
      const store = database.transaction(MESSAGE_ENTRY_STORE_NAME, "readonly").objectStore(MESSAGE_ENTRY_STORE_NAME);
      const selector = query.conversationId ? ["byConversationId", query.conversationId] : query.relationId ? ["byRelationId", query.relationId] : query.characterId ? ["byCharacterId", query.characterId] : undefined;
      const request = selector ? store.index(selector[0]).openCursor(IDBKeyRange.only(selector[1])) : store.index("byPosition").openCursor();
      const result: MessageEntryRecord[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(fromEntries(result).slice(offset, offset + limit));
          return;
        }
        const entry = cursor.value as MessageEntryRecord;
        const matches = (!query.characterId || entry.characterId === query.characterId)
          && (!query.relationId || entry.relationId === query.relationId)
          && (!query.conversationId || entry.conversationId === query.conversationId);
        if (matches) result.push(entry);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async loadPage(query: MessageEntryPageQuery): Promise<MessageEntryPage> {
    const limit = Math.max(1, Math.min(100, Math.floor(query.limit) || 50));
    const database = await this.init();
    const prefix: IDBValidKey[] = [query.characterId];
    const name = query.relationId ? "byRelationTimeline" : query.conversationId ? "byConversationTimeline" : "byCharacterTimeline";
    if (query.relationId) prefix.push(query.relationId); else if (query.conversationId) prefix.push(query.conversationId);
    const upper = query.before ? [...prefix, query.before.timestamp, query.before.id] : [...prefix, []];
    const bounds = IDBKeyRange.bound(prefix, upper, false, true);
    return new Promise<MessageEntryPage>((resolve, reject) => {
      const request = database.transaction(MESSAGE_ENTRY_STORE_NAME, "readonly").objectStore(MESSAGE_ENTRY_STORE_NAME).index(name).openCursor(bounds, "prev");
      const items: Message[] = [];
      const finish = (hasEarlier: boolean) => { items.reverse(); const first = items[0]; resolve({ items, hasEarlier, cursor: first ? { timestamp: first.timestamp, id: first.id } : undefined }); };
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return finish(false);
        const record = cursor.value as MessageEntryRecord;
        if ((!query.relationId || record.relationId === query.relationId) && (!query.conversationId || record.conversationId === query.conversationId)) {
          if (items.length === limit) return finish(true);
          items.push(record.message);
        }
        cursor.continue();
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
        this.persistedEntries = entries;
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
        this.persistedEntries = entries;
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
