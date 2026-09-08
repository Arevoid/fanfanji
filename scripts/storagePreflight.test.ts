import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { runStoragePreflight } from "../src/core/storage/storagePreflight";
import { storageKeys } from "../src/core/storage/storageKeys";

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
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, options);
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(storeName, "readwrite");
      seed(transaction.objectStore(storeName));
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

const messages = [{ id: "message-1", relationId: "relation-1" }, { id: "message-2", relationId: "relation-1" }];
const stories = [{ id: "story-1", relationId: "relation-1" }];
await createDatabase("FanfanjiReadingMetadataDB", "metadata", (store) => store.put(messages, "messages-v4"));
await createDatabase("FanfanjiOfflineStoryDB", "stories", (store) => stories.forEach((story) => store.put(story)), { keyPath: "id" });
values.set("phone_messages_v3", JSON.stringify([{ id: "legacy-message" }]));
values.set("phone_offline_stories", JSON.stringify([{ id: "legacy-story" }]));

const result = await runStoragePreflight();
assert.equal(result.status, "ready");
assert.equal(result.modules.find((module) => module.id === "messages")?.sources.find((source) => source.source === "indexeddb")?.records, 2);
assert.equal(result.modules.find((module) => module.id === "offlineStories")?.sources.find((source) => source.source === "indexeddb")?.records, 1);
assert.equal(result.modules.find((module) => module.id === "messages")?.sources.find((source) => source.source === "localStorage")?.records, 1);
assert.equal(values.get("phone_messages_v3"), JSON.stringify([{ id: "legacy-message" }]));
assert.equal(values.get("phone_offline_stories"), JSON.stringify([{ id: "legacy-story" }]));
values.set(storageKeys.dataSchemaVersion, "99");
const futureSchemaResult = await runStoragePreflight();
assert.equal(futureSchemaResult.status, "blocked");
assert.ok(futureSchemaResult.warnings.some((warning) => warning.includes("高于此版本支持")));
assert.equal(futureSchemaResult.currentSchemaVersion, 0);
assert.equal(futureSchemaResult.migrationScriptVersion, "content-entry-storage-v1");
values.delete(storageKeys.dataSchemaVersion);

await new Promise<void>((resolve, reject) => {
  const request = indexedDB.open("FanfanjiReadingMetadataDB");
  request.onsuccess = () => {
    const database = request.result;
    const transaction = database.transaction("metadata", "readwrite");
    transaction.objectStore("metadata").delete("messages-v4");
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  };
  request.onerror = () => reject(request.error);
});
const missingSnapshotResult = await runStoragePreflight();
assert.equal(missingSnapshotResult.modules.find((module) => module.id === "messages")?.sources.find((source) => source.label === "IndexedDB 消息快照")?.records, 0);

values.set(storageKeys.migrationState, JSON.stringify({
  id: "content-storage-migration",
  sourceVersion: 1,
  targetVersion: 2,
  phase: "migrating",
  startedAt: Date.now() - 1_000,
  updatedAt: Date.now(),
  completedModules: [],
}));
const interruptedResult = await runStoragePreflight();
assert.equal(interruptedResult.status, "blocked");
assert.ok(interruptedResult.warnings.some((warning) => warning.includes("存在未完成的迁移状态")));

const recoveryResult = await runStoragePreflight({ allowInterruptedMigration: true });
assert.notEqual(recoveryResult.status, "blocked");
assert.equal(recoveryResult.warnings.some((warning) => warning.includes("存在未完成的迁移状态")), false);

Object.defineProperty(globalThis, "navigator", {
  value: { storage: { estimate: async () => ({ usage: 9_999, quota: 10_000 }) } },
  configurable: true,
});
const recoveryWithLowQuotaResult = await runStoragePreflight({ allowInterruptedMigration: true });
assert.equal(recoveryWithLowQuotaResult.status, "blocked");
assert.ok(recoveryWithLowQuotaResult.warnings.some((warning) => warning.includes("可用空间不足")));

console.log("PASS storage migration preflight reads sources and keeps recovery scoped to interrupted state");
