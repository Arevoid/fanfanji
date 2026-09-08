import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatTransientUiState.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatTransientUiState\(\)/);
assert.doesNotMatch(appChat, /const \[manualLocationText, setManualLocationText\]/);
assert.doesNotMatch(appChat, /const \[sentGreetings, setSentGreetings\]/);
assert.doesNotMatch(appChat, /const \[toastMessage, setToastMessage\]/);
assert.doesNotMatch(appChat, /const \[memoNotes, setMemoNotes\]/);
assert.match(hook, /manualLocationText/);
assert.match(hook, /sentGreetings/);
assert.match(hook, /toastMessage/);
assert.match(hook, /memoNotes/);
assert.doesNotMatch(hook, /localStorage|sessionStorage|indexedDB|apiChat/);

console.log("PASS AppChat transient UI state is isolated without persistence or I/O");
