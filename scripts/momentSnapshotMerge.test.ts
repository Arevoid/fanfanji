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

const idbShared: Moment = {
  id: "shared-moment",
  authorName: "角色",
  authorAvatar: "",
  content: "IndexedDB 内容",
  timestamp: 10,
  likes: ["idb-like"],
  comments: [{ id: "shared-comment", authorName: "角色", authorAvatar: "", content: "较早版本", timestamp: 20 }],
  visibility: "public",
  sourceCharacterPhonePostId: "phone-post-shared",
};
const idbOnly: Moment = {
  id: "idb-only-moment",
  authorName: "角色",
  authorAvatar: "",
  content: "IndexedDB 独有动态",
  timestamp: 30,
  likes: [],
  comments: [],
};
const localShared: Moment = {
  id: "shared-moment",
  authorName: "旧记录",
  authorAvatar: "",
  content: "过期的本地副本",
  timestamp: 10,
  likes: ["local-like"],
  comments: [
    { id: "shared-comment", authorName: "角色", authorAvatar: "", content: "较新版本", timestamp: 21 },
    { id: "local-comment", authorName: "用户", authorAvatar: "", content: "本地独有评论", timestamp: 22 },
  ],
};
const localOnly: Moment = {
  id: "local-only-moment",
  authorName: "用户",
  authorAvatar: "",
  content: "本地独有动态",
  timestamp: 5,
  likes: [],
  comments: [],
};

const { readingAssetDb } = await import("../src/core/storage/readingAssetDb");
await readingAssetDb.saveMetadataValue("moments-v4", [idbShared, idbOnly]);
values.set("phone_moments_v3", JSON.stringify([localShared, localOnly]));

const repository = await import("../src/core/storage/repositories/momentRepository");
const initialized = await repository.initializeMomentRepository([]);
assert.equal(initialized.valid, true);
assert.deepEqual(initialized.value.map((moment) => moment.id), ["shared-moment", "idb-only-moment", "local-only-moment"]);
assert.equal(initialized.value[0]?.content, "IndexedDB 内容", "IndexedDB remains authoritative for conflicting post fields");
assert.equal(initialized.value[0]?.visibility, "public", "IndexedDB-only privacy metadata is preserved");
assert.equal(initialized.value[0]?.sourceCharacterPhonePostId, "phone-post-shared");
assert.deepEqual(initialized.value[0]?.likes, ["idb-like", "local-like"]);
assert.deepEqual(initialized.value[0]?.comments.map((comment) => comment.content), ["较新版本", "本地独有评论"]);
assert.equal(values.has("phone_moments_v3"), false, "legacy LocalStorage is removed only after the merged IndexedDB snapshot is verified");

let rejectedLargeSnapshotWrites = true;
const originalSetItem = localStorage.setItem;
localStorage.setItem = (key: string, value: string) => {
  if (rejectedLargeSnapshotWrites && key === "phone_moments_v3") {
    const error = new Error("LocalStorage quota exhausted");
    error.name = "QuotaExceededError";
    throw error;
  }
  originalSetItem(key, value);
};
assert.equal(repository.saveMoments(initialized.value).success, true);
assert.equal((await repository.flushMoments()).success, true, "IndexedDB remains writable at the LocalStorage ceiling");
rejectedLargeSnapshotWrites = false;
assert.equal(values.has("phone_moments_v3"), false, "normal saves do not recreate the full LocalStorage snapshot");
assert.deepEqual(await readingAssetDb.loadMetadataValue("moments-v4"), initialized.value);

console.log("PASS divergent Moment copies merge without losing records and release LocalStorage after verification");
