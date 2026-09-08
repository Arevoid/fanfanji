import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/chat/hooks/useVoiceCallTimers.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(hook, /resolveOutgoingCallResolution/);
assert.match(hook, /30 \* 1000/);
assert.match(hook, /setInterval/);
assert.match(hook, /pageshow|requestAnimationFrame/);
assert.match(app, /useVoiceCallTimers\(\{/);
assert.doesNotMatch(app, /resolveOutgoingCallResolution/);
console.log("PASS voice call timers, timeout and transcript scrolling are isolated in a hook");
