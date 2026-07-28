import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(appChat, /const totalUnreadCount = chatThreads\.reduce\(\(sum, thread\) => sum \+ getUnreadCount\(thread\.id\), 0\)/);
assert.doesNotMatch(appChat, /friendIds\.reduce\(\(sum, relationId\) => sum \+ messages\.filter\(/);
assert.match(appChat, /const lastRead = lastReadTimestamps\[chatKey\] \|\| 0/);
assert.match(appChat, /m\.timestamp > lastRead/);
console.log("unreadBadge.test passed");
