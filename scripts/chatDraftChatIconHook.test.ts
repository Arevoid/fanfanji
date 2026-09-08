import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatDraftChatIcon.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatDraftChatIcon\(/);
assert.doesNotMatch(appChat, /const updateDraftChatIcon = \(key: ChatIconKey/);
assert.match(hook, /value\.trim\(\)/);
assert.match(hook, /delete next\[key\]/);

console.log("PASS chat icon draft updates are isolated behind a hook");
