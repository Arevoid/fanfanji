import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatOperationState.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatOperationState\(\)/);
assert.doesNotMatch(appChat, /const \[isManualArchiving, setIsManualArchiving\]/);
assert.doesNotMatch(appChat, /const \[isCompressingMemory, setIsCompressingMemory\]/);
assert.match(hook, /isManualArchiving/);
assert.match(hook, /isCompressingMemory/);
assert.doesNotMatch(hook, /localStorage|sessionStorage|indexedDB|apiChat/);

console.log("PASS AppChat async operation flags are isolated without moving operation logic");
