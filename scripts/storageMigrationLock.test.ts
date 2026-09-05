import assert from "node:assert/strict";
import { loadStorageMigrationLock, renewStorageMigrationLock, releaseStorageMigrationLock, takeOverExpiredStorageMigrationLock, tryAcquireStorageMigrationLock } from "../src/core/storage/storageMigrationLock";
import { storageKeys } from "../src/core/storage/storageKeys";

const values = new Map<string, string>();
const storage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
};
Object.assign(globalThis, { localStorage: storage, window: { localStorage: storage } });

const first = tryAcquireStorageMigrationLock("page-a", 1_000, 10_000);
assert.equal(first.acquired, true);
assert.equal(tryAcquireStorageMigrationLock("page-b", 2_000, 10_000).reason, "locked");
assert.equal(renewStorageMigrationLock(first.lock!.id, "page-b", 3_000).acquired, false);
assert.equal(renewStorageMigrationLock(first.lock!.id, "page-a", 3_000, 10_000).acquired, true);
assert.equal(tryAcquireStorageMigrationLock("page-b", 20_000, 10_000).reason, "expired");
const takeover = takeOverExpiredStorageMigrationLock("page-b", 20_000, 10_000);
assert.equal(takeover.acquired, true);
assert.equal(loadStorageMigrationLock()?.ownerId, "page-b");
assert.equal(releaseStorageMigrationLock(takeover.lock!.id, "page-a"), false);
assert.equal(releaseStorageMigrationLock(takeover.lock!.id, "page-b"), true);
assert.equal(values.get(storageKeys.migrationLock), undefined);
console.log("PASS storage migration lock ownership, expiry, renewal, takeover, and release");
