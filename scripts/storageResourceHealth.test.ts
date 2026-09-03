import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { inspectStorage } from "../src/core/storage/storageDiagnostics";
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

values.clear();
await new Promise<void>((resolve, reject) => {
  const request = indexedDB.open("FanfanjiMessageEntryDB", 2);
  request.onupgradeneeded = () => {
    const store = request.result.createObjectStore("messages", { keyPath: "recordId" });
    store.createIndex("byPosition", "position");
  };
  request.onsuccess = () => {
    const database = request.result;
    const transaction = database.transaction("messages", "readwrite");
    transaction.objectStore("messages").put({
      recordId: "entry::0",
      position: 0,
      characterId: "character",
      timestamp: 1,
      message: { id: "entry", characterId: "character", sender: "character", content: "[图片]", imageAssetId: "entry-referenced-image", timestamp: 1 },
    });
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  };
  request.onerror = () => reject(request.error);
});
await new Promise<void>((resolve, reject) => {
  const request = indexedDB.open("FanfanImageAssets", 1);
  request.onsuccess = () => {
    const database = request.result;
    const transaction = database.transaction("images", "readwrite");
    transaction.objectStore("images").put("image", "entry-referenced-image");
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  };
  request.onerror = () => reject(request.error);
});
values.set(storageKeys.messageEntryStoreEnabled, "1");
const migratedDiagnostics = await inspectStorage();
const migratedImages = migratedDiagnostics.health.resources.find((resource) => resource.database === "FanfanImageAssets");
assert.equal(migratedImages?.referenced, 1, "entry-store image references must participate in health scans");
assert.equal(migratedImages?.orphaned, 2, "entry-store image references must not be reported as orphaned");
console.log("PASS resource health scan reports orphan and missing assets without modifying data");
