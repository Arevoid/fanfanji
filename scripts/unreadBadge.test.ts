import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const readStateHook = readFileSync(new URL("../src/features/chat/hooks/useChatReadState.ts", import.meta.url), "utf8");
assert.match(appChat, /const totalUnreadCount = chatThreads\.reduce\(\(sum, thread\) => sum \+ getUnreadCount\(thread\.id\), 0\)/);
assert.doesNotMatch(appChat, /friendIds\.reduce\(\(sum, relationId\) => sum \+ messages\.filter\(/);
assert.match(readStateHook, /const lastRead = lastReadTimestamps\[chatKey\] \|\| 0/);
assert.match(readStateHook, /message\.timestamp > lastRead/);
assert.match(readStateHook, /const activeChatKey = activeChatCharId \? \(activeChatRelationId \|\| activeChatCharId\) : null/);
assert.match(appChat, /setActiveChatCharId\(null\);\s*setActiveChatRelationId\(null\);/);
console.log("unreadBadge.test passed");
