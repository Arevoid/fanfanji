import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatCallSpeechPlayback.ts", import.meta.url), "utf8");
assert.match(appChat, /useChatCallSpeechPlayback\(/);
assert.doesNotMatch(appChat, /const callSpeechQueueRef = useRef/);
assert.doesNotMatch(appChat, /const triggerMessageSpeech = async/);
assert.match(hook, /callSpeechGenerationRef\.current \+= 1/);
assert.match(hook, /URL\.revokeObjectURL/);
assert.match(hook, /getSpeechForText/);
assert.match(hook, /enqueueCallSpeech/);
assert.match(hook, /setTimeout\(playNextQueuedCallSpeech/);
console.log("PASS AppChat call speech playback is isolated behind a cancellable, URL-safe queue hook");
