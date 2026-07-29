import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const dm = readFileSync("src/domain/forum/forumDmData.ts", "utf8");
const backup = readFileSync("src/components/AppSettings.tsx", "utf8");
assert.match(dm, /isAnonymous/);
assert.match(dm, /return undefined/);
assert.match(backup, /privateAuthorRelationId/);
console.log("forum privacy audit tests passed");
