import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const forum = readFileSync("src/components/AppForum.tsx", "utf8");
const backup = readFileSync("src/features/settings/systemBackupSanitizer.ts", "utf8");
assert.doesNotMatch(forum, /ForumDm|发送私信|论坛私信/);
assert.match(backup, /privateAuthorRelationId/);
console.log("forum privacy audit tests passed");
