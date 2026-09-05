import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync("src/core/storage/repositories/forumRepository.ts", "utf8");
assert.match(source, /subscribeForumState/);
assert.doesNotMatch(source, /cleanupForumDmForRelations/);
assert.match(source, /cleanupForumIdentityData/);
console.log("forum lifecycle tests passed");
