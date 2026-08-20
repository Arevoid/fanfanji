import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";

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

const legacy = [{
  id: "legacy-moment",
  authorName: "用户",
  authorAvatar: "",
  content: "旧朋友圈",
  timestamp: 1,
  likes: [],
  comments: [],
}];
values.set("phone_moments_v3", JSON.stringify(legacy));

const repository = await import("../src/core/storage/repositories/momentRepository");
const { readingAssetDb } = await import("../src/core/storage/readingAssetDb");
const initialized = await repository.initializeMomentRepository([]);
assert.deepEqual(initialized.value, legacy);
assert.equal(values.has("phone_moments_v3"), false, "legacy Moments should migrate out of quota-limited localStorage");

const moments = [{ ...legacy[0], id: "persisted", content: "朋友圈与评论上下文", comments: [
  { id: "comment", authorName: "角色", authorAvatar: "", content: "正常评论", timestamp: 2 },
] }];
assert.equal(repository.saveMoments(moments).success, true);
assert.equal((await repository.flushMoments()).success, true);
const stored = await readingAssetDb.loadMetadataValue<typeof moments>("moments-v4");
assert.deepEqual(stored, moments);

console.log("PASS Moments and comments migrate to and persist in IndexedDB");
