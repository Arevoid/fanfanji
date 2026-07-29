import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync("src/components/AppSettings.tsx", "utf8");
for (const key of ["phone_forum_dm_conversations", "phone_forum_dm_messages", "phone_forum_dm_tasks", "phone_forum_profiles", "phone_forum_notifications"]) assert.match(source, new RegExp(key));
assert.match(source, /privateAuthorRelationId/);
console.log("forum backup round-trip wiring tests passed");
