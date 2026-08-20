import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { migrateContentStorage } from "../src/core/storage/contentStorageMigration";
import { disableOfflineStoryEntryStore, isMessageEntryStoreEnabled, isOfflineStoryEntryStoreEnabled } from "../src/core/storage/contentStorageFlags";
import { messageEntryDb } from "../src/core/storage/messageEntryDb";
import { offlineStoryEntryDb } from "../src/core/storage/offlineStoryEntryDb";
import { offlineStoryDb } from "../src/core/storage/offlineStoryDb";
import { readingAssetDb } from "../src/core/storage/readingAssetDb";
import { loadStorageMigrationState } from "../src/core/storage/storageMigrationState";
import { buildSystemBackup, restoreSystemBackupIndexedDb } from "../src/features/settings/systemBackup";
import { removeMigratedStorageCopies } from "../src/core/storage/storageDiagnostics";
import { runStoragePreflight } from "../src/core/storage/storagePreflight";

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

const secondStory = { ...stories[0], id: "story-2", title: "第二个故事", updatedAt: 3 };
await offlineStoryEntryDb.replaceAll([stories[0], secondStory]);
await offlineStoryEntryDb.save({ ...stories[0], title: "已继续的旧故事", updatedAt: 4 });
assert.deepEqual((await offlineStoryEntryDb.loadAll()).map((story) => story.id), ["story-1", "story-2"], "更新线下故事不能改变卡片顺序");
const removedLegacyCopies = await removeMigratedStorageCopies();
assert.ok(removedLegacyCopies.includes("phone_messages_v3"));
assert.ok(removedLegacyCopies.includes("phone_offline_stories"));
assert.equal(localStorage.getItem("phone_messages_v3"), null);
assert.equal(localStorage.getItem("phone_offline_stories"), null);
assert.equal(await readingAssetDb.loadMetadataValue("messages-v4"), null);

const originalOfflineReplaceAll = offlineStoryEntryDb.replaceAll.bind(offlineStoryEntryDb);
disableOfflineStoryEntryStore();
offlineStoryEntryDb.replaceAll = (async () => { throw new Error("simulated offline migration failure"); }) as typeof offlineStoryEntryDb.replaceAll;
await assert.rejects(
  migrateContentStorage({ preflight: await runStoragePreflight() }),
  /simulated offline migration failure/,
);
offlineStoryEntryDb.replaceAll = originalOfflineReplaceAll;
assert.equal(isMessageEntryStoreEnabled(), true, "已有聊天条目库在后续模块失败时必须保留");
assert.deepEqual(await messageEntryDb.loadAll(), messages, "部分迁移失败不能清空已完成的聊天条目");
assert.equal(isOfflineStoryEntryStoreEnabled(), false);
console.log("PASS content storage migration preserves message/offline data and legacy sources");
