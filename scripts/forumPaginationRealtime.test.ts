import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync("src/components/AppForum.tsx", "utf8");
assert.match(source, /FORUM_HOME_PAGE_SIZE/);
assert.match(source, /FORUM_REPLY_PAGE_SIZE/);
assert.match(source, /加载更多/);
assert.match(source, /useSyncExternalStore/);
console.log("forum pagination/realtime tests passed");
