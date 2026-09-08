import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/chat/hooks/useChatMessageProjection.ts", import.meta.url), "utf8");
const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");

assert.match(hook, /useMemo/);
assert.match(hook, /stripInternalDeliveryMarkers/);
assert.match(hook, /currentChatMessages/);
assert.match(hook, /visibleChatMessages/);
assert.match(appChat, /useChatMessageProjection/);
assert.doesNotMatch(appChat, /const visibleChatMessages = currentChatMessages\s*\n\s*\.map/);

console.log("PASS active chat message projection is isolated behind its hook");
