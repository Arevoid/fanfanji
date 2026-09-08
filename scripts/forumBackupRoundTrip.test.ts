import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync("src/features/settings/systemBackupSanitizer.ts", "utf8");
for (const key of ["phone_forum_profiles", "phone_forum_notifications"]) assert.match(source, new RegExp(key));
assert.doesNotMatch(source, /phone_forum_dm_/);
assert.match(source, /privateAuthorRelationId/);
console.log("forum backup round-trip wiring tests passed");
