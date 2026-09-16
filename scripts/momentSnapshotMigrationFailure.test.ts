import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import type { Moment } from "../src/types";

const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  clear: () => values.clear(),
  key: (index: number) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
Object.assign(globalThis, { indexedDB, window: { localStorage } });

const persisted: Moment[] = [{
  id: "idb-moment",
  authorName: "角色",
  authorAvatar: "",
  content: "已保存的动态",
  timestamp: 1,
  likes: [],
  comments: [],
}];
const legacy: Moment[] = [{
  id: "legacy-moment",
  authorName: "用户",
  authorAvatar: "",
  content: "本地恢复副本",
  timestamp: 2,
  likes: [],
  comments: [],
}];

const { readingAssetDb } = await import("../src/core/storage/readingAssetDb");
await readingAssetDb.saveMetadataValue("moments-v4", persisted);
values.set("phone_moments_v3", JSON.stringify(legacy));
const originalSave = readingAssetDb.saveMetadataValue.bind(readingAssetDb);
readingAssetDb.saveMetadataValue = async (key: string, value: unknown) => {
  if (key === "moments-v4") throw new Error("simulated IndexedDB failure");
  return originalSave(key, value);
};

const repository = await import("../src/core/storage/repositories/momentRepository");
const initialized = await repository.initializeMomentRepository([]);
assert.equal(initialized.valid, true, "the intact LocalStorage recovery copy remains readable");
assert.deepEqual(initialized.value.map((moment) => moment.id), ["idb-moment", "legacy-moment"], "both intact copies remain visible when the merge cannot commit");
assert.equal(values.has("phone_moments_v3"), true, "migration failure must retain the legacy recovery copy");
assert.deepEqual(await readingAssetDb.loadMetadataValue("moments-v4"), persisted, "failed merge must leave the existing IndexedDB value untouched");

console.log("PASS failed Moment reconciliation preserves the legacy recovery copy");
