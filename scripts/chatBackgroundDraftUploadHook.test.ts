import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatBackgroundDraftUpload.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatBackgroundDraftUpload\(\{ setDraftChatBg \}\)/);
assert.doesNotMatch(appChat, /const handleDraftChatBgUpload = async/);
assert.match(hook, /compressImage\(file, 1000, 1000, 0\.7\)/);
assert.match(hook, /setDraftChatBg\(compressed\)/);

console.log("PASS chat background draft upload is isolated behind a small asset action hook");
