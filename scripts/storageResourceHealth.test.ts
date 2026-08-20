import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { inspectStorage } from "../src/core/storage/storageDiagnostics";

const values = new Map<string, string>();
const localStorage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
};
Object.assign(globalThis, { indexedDB, localStorage, window: { localStorage } });

function createDatabase(name: string, stores: string[], seed: (database: IDBDatabase) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => stores.forEach((store) => {
      if (!request.result.objectStoreNames.contains(store)) {
        request.result.createObjectStore(store, store === "stickerGroups" ? { keyPath: "id" } : undefined);
      }
    });
    request.onsuccess = () => {
      const database = request.result;
      seed(database);
      database.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

await createDatabase("FanfanImageAssets", ["images"], (database) => {
  const transaction = database.transaction("images", "readwrite");
  transaction.objectStore("images").put("image", "referenced-image");
  transaction.objectStore("images").put("image", "orphan-image");
});
await createDatabase("StickerAppDB", ["stickerGroups", "stickerImages"], (database) => {
  const transaction = database.transaction(["stickerGroups", "stickerImages"], "readwrite");
  transaction.objectStore("stickerGroups").put({ id: "group", stickers: [{ id: "referenced-sticker" }, { id: "missing-sticker" }] });
  transaction.objectStore("stickerImages").put("image", "referenced-sticker");
  transaction.objectStore("stickerImages").put("image", "orphan-sticker");
});

values.set("phone_messages_v3", JSON.stringify([{ id: "m", imageAssetId: "referenced-image" }]));
const diagnostics = await inspectStorage();
const imageResources = diagnostics.health.resources.find((resource) => resource.database === "FanfanImageAssets");
const stickerResources = diagnostics.health.resources.find((resource) => resource.database === "StickerAppDB");
assert.deepEqual(imageResources && {
  stored: imageResources.stored,
  referenced: imageResources.referenced,
  orphaned: imageResources.orphaned,
  missing: imageResources.missing,
}, { stored: 2, referenced: 1, orphaned: 1, missing: 0 });
assert.deepEqual(stickerResources && {
  stored: stickerResources.stored,
  referenced: stickerResources.referenced,
  orphaned: stickerResources.orphaned,
  missing: stickerResources.missing,
}, { stored: 2, referenced: 2, orphaned: 1, missing: 1 });
assert.equal(values.get("phone_messages_v3"), JSON.stringify([{ id: "m", imageAssetId: "referenced-image" }]));
console.log("PASS resource health scan reports orphan and missing assets without modifying data");
