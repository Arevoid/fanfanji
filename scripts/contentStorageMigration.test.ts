import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { migrateContentStorage } from "../src/core/storage/contentStorageMigration";
import { isMessageEntryStoreEnabled, isOfflineStoryEntryStoreEnabled } from "../src/core/storage/contentStorageFlags";
import { messageEntryDb } from "../src/core/storage/messageEntryDb";
import { offlineStoryEntryDb } from "../src/core/storage/offlineStoryEntryDb";
import { offlineStoryDb } from "../src/core/storage/offlineStoryDb";
import { loadStorageMigrationState } from "../src/core/storage/storageMigrationState";
import { buildSystemBackup, restoreSystemBackupIndexedDb } from "../src/features/settings/systemBackup";

const values = new Map<string, string>();
const localStorage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
};
Object.assign(globalThis, { indexedDB, localStorage, window: { localStorage } });
Object.defineProperty(globalThis, "navigator", {
  value: { storage: { estimate: async () => ({ usage: 100, quota: 10_000_000 }) } },
  configurable: true,
});

function createDatabase(name: string, storeName: string, seed: (store: IDBObjectStore) => void, options?: IDBObjectStoreParameters): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, options);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(storeName, "readwrite");
      seed(transaction.objectStore(storeName));
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

const messages = [
  { id: "message-1", characterId: "character-1", relationId: "relation-1", sender: "user" as const, content: "你好", timestamp: 1 },
  { id: "message-2", characterId: "character-1", relationId: "relation-1", sender: "character" as const, content: "你好呀", timestamp: 2 },
];
const stories = [{
  id: "story-1",
  characterId: "character-1",
  relationId: "relation-1",
  title: "旧故事",
  createdAt: 1,
  updatedAt: 2,
  mode: "continue" as const,
  messages,
}];

await createDatabase("FanfanjiReadingMetadataDB", "metadata", (store) => store.put(messages, "messages-v4"));
await createDatabase("FanfanjiOfflineStoryDB", "stories", (store) => store.put(stories[0]), { keyPath: "id" });
localStorage.setItem("phone_messages_v3", JSON.stringify(messages));
localStorage.setItem("phone_offline_stories", JSON.stringify(stories));

const report = await migrateContentStorage();
assert.equal(report.messageCount, messages.length);
assert.equal(report.offlineStoryCount, stories.length);
assert.equal(report.offlineStoryMessageCount, messages.length);
assert.equal(isMessageEntryStoreEnabled(), true);
assert.equal(isOfflineStoryEntryStoreEnabled(), true);
assert.deepEqual(await messageEntryDb.loadAll(), messages);
assert.deepEqual(await offlineStoryEntryDb.loadAll(), stories);
assert.deepEqual(await offlineStoryDb.loadAll(), stories);
assert.equal(loadStorageMigrationState()?.phase, "completed");
assert.equal(localStorage.getItem("phone_messages_v3"), JSON.stringify(messages));
assert.equal(localStorage.getItem("phone_offline_stories"), JSON.stringify(stories));

const backup = await buildSystemBackup(localStorage as Storage, ["phone_messages_v3", "phone_offline_stories"]);
assert.deepEqual(backup.indexedDb["message-entry-v1"], messages);
assert.deepEqual(backup.indexedDb["offline-story-entry-v1"], stories);
await messageEntryDb.replaceAll([]);
await offlineStoryEntryDb.replaceAll([]);
await restoreSystemBackupIndexedDb(backup.indexedDb);
assert.deepEqual(await messageEntryDb.loadAll(), messages);
assert.deepEqual(await offlineStoryEntryDb.loadAll(), stories);
console.log("PASS content storage migration preserves message/offline data and legacy sources");
