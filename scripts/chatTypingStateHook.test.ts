import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatTypingState.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatTypingState\(activeTypingScopeKey\)/);
assert.doesNotMatch(appChat, /typingByScope/);
assert.doesNotMatch(appChat, /setChatScopeTyping/);
assert.match(hook, /activeScopeKey/);
assert.match(hook, /setChatScopeTyping/);
assert.match(hook, /setChatScopeCharacterOverride/);
assert.match(hook, /getVisibleChatTyping/);
assert.doesNotMatch(hook, /localStorage|sessionStorage|indexedDB/);

console.log("PASS AppChat typing indicators remain isolated by runtime chat scope");
