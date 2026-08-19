import type { Message, OfflineStory } from "../../types";

export const OFFLINE_STORY_ENTRY_DB_NAME = "FanfanjiOfflineStoryEntryDB";
export const OFFLINE_STORY_ENTRY_DB_VERSION = 1;
export const OFFLINE_STORY_METADATA_STORE_NAME = "stories";
export const OFFLINE_STORY_MESSAGE_STORE_NAME = "storyMessages";

interface OfflineStoryMetadataRecord extends Omit<OfflineStory, "messages"> {
  position: number;
  messageCount: number;
}

interface OfflineStoryMessageRecord {
  recordId: string;
  storyId: string;
  position: number;
  message: Message;
}

const clone = <T>(value: T): T => typeof structuredClone === "function"
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value)) as T;

function toMetadata(story: OfflineStory, position: number): OfflineStoryMetadataRecord {
  const { messages, ...metadata } = story;
  return { ...clone(metadata), position, messageCount: messages.length };
}

function toMessageEntries(story: OfflineStory): OfflineStoryMessageRecord[] {
  return story.messages.map((message, position) => ({
    recordId: `${story.id}::${position}`,
    storyId: story.id,
    position,
    message: clone(message),
  }));
}

class OfflineStoryEntryDB {
  private db: IDBDatabase | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  private async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable");
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(OFFLINE_STORY_ENTRY_DB_NAME, OFFLINE_STORY_ENTRY_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(OFFLINE_STORY_METADATA_STORE_NAME)) {
          database.createObjectStore(OFFLINE_STORY_METADATA_STORE_NAME, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(OFFLINE_STORY_MESSAGE_STORE_NAME)) {
          const store = database.createObjectStore(OFFLINE_STORY_MESSAGE_STORE_NAME, { keyPath: "recordId" });
          store.createIndex("byStoryId", "storyId", { unique: false });
        }
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
      request.onblocked = () => reject(new Error("Offline story entry database is blocked"));
    });
  }

  private enqueue(operation: (database: IDBDatabase) => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(async () => operation(await this.init()));
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  async loadAll(): Promise<OfflineStory[]> {
    const database = await this.init();
    const records = await new Promise<{ metadata: OfflineStoryMetadataRecord[]; messages: OfflineStoryMessageRecord[] }>((resolve, reject) => {
      const transaction = database.transaction([OFFLINE_STORY_METADATA_STORE_NAME, OFFLINE_STORY_MESSAGE_STORE_NAME], "readonly");
      const metadataRequest = transaction.objectStore(OFFLINE_STORY_METADATA_STORE_NAME).getAll();
      const messagesRequest = transaction.objectStore(OFFLINE_STORY_MESSAGE_STORE_NAME).getAll();
      let metadata: OfflineStoryMetadataRecord[] | null = null;
      let messages: OfflineStoryMessageRecord[] | null = null;
      const finish = () => {
        if (metadata && messages) resolve({ metadata, messages });
      };
      metadataRequest.onsuccess = () => { metadata = Array.isArray(metadataRequest.result) ? metadataRequest.result as OfflineStoryMetadataRecord[] : []; finish(); };
      messagesRequest.onsuccess = () => { messages = Array.isArray(messagesRequest.result) ? messagesRequest.result as OfflineStoryMessageRecord[] : []; finish(); };
      metadataRequest.onerror = () => reject(metadataRequest.error);
      messagesRequest.onerror = () => reject(messagesRequest.error);
      transaction.onerror = () => reject(transaction.error);
    });
    const groupedMessages = new Map<string, OfflineStoryMessageRecord[]>();
    records.messages.forEach((entry) => {
      const existing = groupedMessages.get(entry.storyId) || [];
      existing.push(entry);
      groupedMessages.set(entry.storyId, existing);
    });
    return records.metadata
      .sort((left, right) => left.position - right.position)
      .map((metadata) => {
        const { position: _position, messageCount: _messageCount, ...storyMetadata } = metadata;
        const messages = (groupedMessages.get(metadata.id) || [])
          .sort((left, right) => left.position - right.position)
          .map((entry) => clone(entry.message));
        return { ...clone(storyMetadata), messages } as OfflineStory;
      });
  }

  async replaceAll(stories: readonly OfflineStory[]): Promise<void> {
    await this.enqueue((database) => new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([OFFLINE_STORY_METADATA_STORE_NAME, OFFLINE_STORY_MESSAGE_STORE_NAME], "readwrite");
      const metadataStore = transaction.objectStore(OFFLINE_STORY_METADATA_STORE_NAME);
      const messageStore = transaction.objectStore(OFFLINE_STORY_MESSAGE_STORE_NAME);
      metadataStore.clear();
      messageStore.clear();
      stories.forEach((story, position) => {
        metadataStore.put(toMetadata(story, position));
        toMessageEntries(story).forEach((entry) => messageStore.put(entry));
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }

  async save(story: OfflineStory): Promise<void> {
    await this.enqueue((database) => new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([OFFLINE_STORY_METADATA_STORE_NAME, OFFLINE_STORY_MESSAGE_STORE_NAME], "readwrite");
      const metadataStore = transaction.objectStore(OFFLINE_STORY_METADATA_STORE_NAME);
      const messageStore = transaction.objectStore(OFFLINE_STORY_MESSAGE_STORE_NAME);
      const existingKeysRequest = messageStore.index("byStoryId").getAllKeys(story.id);
      existingKeysRequest.onsuccess = () => {
        existingKeysRequest.result.forEach((key) => messageStore.delete(key));
        const position = 0;
        metadataStore.put(toMetadata(story, position));
        toMessageEntries(story).forEach((entry) => messageStore.put(entry));
      };
      existingKeysRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Offline story entry write aborted"));
    }));
  }

  async delete(storyId: string): Promise<void> {
    await this.enqueue((database) => new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([OFFLINE_STORY_METADATA_STORE_NAME, OFFLINE_STORY_MESSAGE_STORE_NAME], "readwrite");
      const messageStore = transaction.objectStore(OFFLINE_STORY_MESSAGE_STORE_NAME);
      const keysRequest = messageStore.index("byStoryId").getAllKeys(storyId);
      keysRequest.onsuccess = () => {
        keysRequest.result.forEach((key) => messageStore.delete(key));
        transaction.objectStore(OFFLINE_STORY_METADATA_STORE_NAME).delete(storyId);
      };
      keysRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Offline story entry delete aborted"));
    }));
  }

  async clearAll(): Promise<void> {
    await this.enqueue((database) => new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([OFFLINE_STORY_METADATA_STORE_NAME, OFFLINE_STORY_MESSAGE_STORE_NAME], "readwrite");
      transaction.objectStore(OFFLINE_STORY_METADATA_STORE_NAME).clear();
      transaction.objectStore(OFFLINE_STORY_MESSAGE_STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }
}

export const offlineStoryEntryDb = new OfflineStoryEntryDB();

