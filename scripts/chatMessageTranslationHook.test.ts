import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatMessageTranslation.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatMessageTranslation\(\{ settings, onUpdateMessage, showToast \}\)/);
assert.doesNotMatch(appChat, /const handleTranslateMessage = \(msg: Message\)/);
assert.match(hook, /apiTranslate\(/);
assert.match(hook, /onUpdateMessage\(msg\.id, \{ translation: res\.text \}, msg\)/);
assert.match(hook, /翻译失败，请检查 API 配置/);

console.log("PASS chat message translation is isolated behind a behavior-preserving hook");
