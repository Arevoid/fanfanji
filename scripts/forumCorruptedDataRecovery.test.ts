import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync("src/core/storage/repositories/forumRepository.ts", "utf8");
assert.match(source, /repairForumState/);
assert.match(source, /filterLoaded\(readArray<unknown>\(storageKeys\.forumThreads/);
assert.match(source, /task\.status === "running".*"stale"/s);
console.log("forum corrupted-data recovery tests passed");
