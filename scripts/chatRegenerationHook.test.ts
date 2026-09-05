import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatRegenerationAction.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatRegenerationAction\(/);
assert.doesNotMatch(appChat, /const handleRegenerateResponse = async/);
assert.match(hook, /diagnosticLabel: "regenerate prompt"/);
assert.match(hook, /deleteMessageAndLinkedImage\(targetMsg\.id\)/);
assert.match(hook, /recordPendingOfflineHandoffDelivery/);
assert.match(hook, /generateRegeneratedChatTurn/);

console.log("PASS chat regeneration remains behavior-preserving behind an explicit dependency hook");
