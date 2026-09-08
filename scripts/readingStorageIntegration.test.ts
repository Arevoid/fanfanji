import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clearApplicationData } from "../src/features/settings/clearApplicationData";

const keysSource = readFileSync("src/core/storage/storageKeys.ts", "utf8");
const clearSource = readFileSync("src/features/settings/clearApplicationData.ts", "utf8");
const dbSource = readFileSync("src/core/storage/readingAssetDb.ts", "utf8");

assert.match(keysSource, /readingStore:\s*"phone_reading_store_v1"/);
assert.match(clearSource, /readingAssetDb\.clearAll\(\)/);
assert.match(dbSource, /createIndex\("byIdentityAndBook", \["userIdentityId", "bookId"\]/);
assert.match(dbSource, /asset\.userIdentityId !== userIdentityId \|\| asset\.bookId !== bookId/);
assert.match(dbSource, /indexedDB\.open\(DB_NAME\)/, "正文仓库 must open without forcing an upgrade");
assert.match(dbSource, /FanfanjiReadingCoverDB/);

const calls: string[] = [];
await clearApplicationData({
  persistentStorage: { clear: () => calls.push("persistent") },
  sessionStorage: { clear: () => calls.push("session") },
  binaryStoreClearers: [
    async () => { calls.push("reading-assets"); },
    async () => { calls.push("other-assets"); },
  ],
});
assert.equal(calls.includes("reading-assets"), true);
assert.equal(calls.at(-1), "persistent", "localStorage must be cleared after binary stores");

console.log("reading storage integration tests passed");
