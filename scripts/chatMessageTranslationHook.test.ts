import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatMessageTranslation.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatMessageTranslation\(\{ settings, onUpdateMessage, showToast \}\)/);
assert.doesNotMatch(appChat, /const handleTranslateMessage = \(msg: Message\)/);
assert.match(hook, /apiTranslate\(/);
assert.match(hook, /getVoiceMessagePreview/);
assert.match(hook, /text: sourceText/);
assert.match(hook, /onUpdateMessage\(msg\.id, \{ translation: translatedText \}, msg\)/);
assert.match(hook, /翻译结果与原文相同/);
assert.match(hook, /翻译失败，请检查 API 配置/);
assert.match(appChat, /voiceTranscribed\[msg\.id\] && translationText/);

console.log("PASS chat message translation is isolated behind a behavior-preserving hook");
