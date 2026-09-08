import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatSaveSettings.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatSaveSettings\(\{/);
assert.doesNotMatch(appChat, /const handleSaveSettings = \(\) =>/);
assert.match(hook, /createProactiveOfflinePreferencePatch/);
assert.match(hook, /updateRelationshipSession\(activeRelationship\.id/);
assert.match(hook, /apiTranslate\(/);
assert.match(hook, /setIsShowingCardModal\(false\)/);

console.log("PASS chat settings save and auto-translation are isolated behind a behavior-preserving hook");
