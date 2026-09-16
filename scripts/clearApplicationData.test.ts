import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { clearApplicationData } from "../src/features/settings/clearApplicationData";
import { innerVoiceDb } from "../src/core/storage/innerVoiceDb";
import { saveTruthVectorIndexRecords, loadTruthVectorIndexRecords } from "../src/core/storage/truthVectorIndexDb";
import { memoryProjectionJobRepository } from "../src/core/storage/repositories/memoryProjectionJobRepository";
import { openMemoryProjectionDatabase, MEMORY_PROJECTION_JOB_STORE_NAME } from "../src/core/storage/memoryProjectionJobDb";

const events: string[] = [];

await clearApplicationData({
  persistentStorage: {
    clear: () => events.push("persistent"),
  },
  sessionStorage: {
    clear: () => events.push("session"),
  },
  cacheStorage: {
    keys: async () => {
      events.push("cache-keys");
      return ["app-shell", "images"];
    },
    delete: async (cacheName: string) => {
      events.push(`cache-delete:${cacheName}`);
      return true;
    },
  },
  binaryStoreClearers: [
    async () => { events.push("audio"); },
    async () => { events.push("images"); },
    async () => { events.push("stickers"); },
  ],
});

assert.deepEqual(events.slice(0, 3), ["audio", "images", "stickers"]);
assert.ok(events.includes("cache-delete:app-shell"));
assert.ok(events.includes("cache-delete:images"));
assert.deepEqual(events.slice(-2), ["session", "persistent"]);

console.log("clear application data tests passed");

const persistentValues = new Map<string, string>();
const browserStorage: Storage = {
  get length() { return persistentValues.size; },
  clear() { persistentValues.clear(); },
  getItem(key) { return persistentValues.get(key) ?? null; },
  key(index) { return [...persistentValues.keys()][index] ?? null; },
  removeItem(key) { persistentValues.delete(key); },
  setItem(key, value) { persistentValues.set(key, value); },
};
Object.assign(globalThis, {
  indexedDB,
  window: { localStorage: browserStorage, sessionStorage: browserStorage },
});

await innerVoiceDb.upsert({
  id: "clear-test-voice", characterId: "character", relationId: "relation", userIdentityId: "identity",
  conversationId: "direct:relation", messageId: "message", triggerMessageSummary: "test", state: "calm", content: "private", createdAt: 1,
});
await saveTruthVectorIndexRecords([{
  id: "clear-test-vector", kind: "claim", scopeKey: "scope", relationId: "relation", characterId: "character",
  userIdentityId: "identity", text: "private truth", vector: [0.1], updatedAt: 1,
}]);
const projectionDb = await openMemoryProjectionDatabase(() => undefined);
await new Promise<void>((resolve, reject) => {
  const transaction = projectionDb.transaction(MEMORY_PROJECTION_JOB_STORE_NAME, "readwrite");
  transaction.objectStore(MEMORY_PROJECTION_JOB_STORE_NAME).put({ jobId: "clear-test-job" });
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
});

await clearApplicationData();
assert.deepEqual(await innerVoiceDb.loadAll(), [], "whole-app clear includes private voice IndexedDB data");
assert.deepEqual(await loadTruthVectorIndexRecords(), [], "whole-app clear includes truth-vector IndexedDB data");
const clearedProjectionDb = await openMemoryProjectionDatabase(() => undefined);
const remainingProjectionJobs = await new Promise<number>((resolve, reject) => {
  const request = clearedProjectionDb.transaction(MEMORY_PROJECTION_JOB_STORE_NAME, "readonly")
    .objectStore(MEMORY_PROJECTION_JOB_STORE_NAME).count();
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
assert.equal(remainingProjectionJobs, 0, "whole-app clear includes memory projection job metadata");
memoryProjectionJobRepository.close();
clearedProjectionDb.close();
