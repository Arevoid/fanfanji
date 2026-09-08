import assert from "node:assert/strict";
import { beginContentStorageMigration, enterContentStorageOperation, isContentStorageMigrationActive } from "../src/core/storage/contentStorageRuntimeLock";

const releaseOperation = await enterContentStorageOperation();
let migrationStarted = false;
const migrationPromise = beginContentStorageMigration().then((release) => {
  migrationStarted = true;
  return release;
});
await Promise.resolve();
assert.equal(migrationStarted, false, "迁移必须等待已经开始的存储操作完成");
releaseOperation();
const releaseMigration = await migrationPromise;
assert.equal(isContentStorageMigrationActive(), true);

let operationEntered = false;
const waitingOperation = enterContentStorageOperation().then((release) => {
  operationEntered = true;
  release();
});
await Promise.resolve();
assert.equal(operationEntered, false, "迁移期间的新存储操作必须等待");
releaseMigration();
await waitingOperation;
assert.equal(operationEntered, true);
assert.equal(isContentStorageMigrationActive(), false);
console.log("PASS content storage runtime lock serializes migration and ordinary operations");
