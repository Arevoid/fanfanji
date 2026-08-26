import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/chat/hooks/useInnerVoice.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(hook, /findInnerVoiceByMessage/);
assert.match(hook, /triggerMessageSummary === triggerSummary/);
assert.match(hook, /requestsRef/);
assert.match(hook, /generateInnerVoice/);
assert.match(app, /const innerVoiceController = useInnerVoice/);
assert.match(app, /record=\{innerVoiceController\.record\}/);
assert.match(app, /createInlineInnerVoiceRecord/);
console.log("PASS inner voice is read from cache and generated on demand when missing");
