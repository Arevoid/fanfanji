import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync("src/features/chat/hooks/useChatCustomCss.ts", "utf8");
const chat = readFileSync("src/components/AppChat.tsx", "utf8");
assert.match(hook, /scopeUserChatCss/);
assert.match(hook, /app-chat-user-custom-css/);
assert.match(hook, /style\.remove\(\)/);
assert.match(chat, /useChatCustomCss\(/);
assert.doesNotMatch(chat, /scopeUserChatCss|prioritizeUserChatCss/);
console.log("PASS chat custom CSS injection is isolated behind a scoped cleanup-safe hook");
