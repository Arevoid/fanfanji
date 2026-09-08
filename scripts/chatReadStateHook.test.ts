import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/chat/hooks/useChatReadState.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(hook, /phone_initiated_chat_ids/);
assert.match(hook, /phone_last_read_timestamps/);
assert.match(hook, /markChatRead/);
assert.match(hook, /message\.relationId === chatKey/);
assert.match(app, /useChatReadState/);
assert.doesNotMatch(app, /const \[lastReadTimestamps/);
console.log("PASS chat initiated and unread persistence is isolated in a dedicated hook");
