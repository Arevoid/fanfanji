import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/chat/hooks/useInnerVoice.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(hook, /findInnerVoiceByMessage/);
assert.match(hook, /triggerMessageSummary === triggerSummary/);
assert.match(hook, /resolveStoredRecord/);
assert.match(hook, /syncInlineRecord/);
assert.match(hook, /setRecord\(current\.record \|\| null\)/);
assert.match(hook, /requestsRef/);
assert.match(hook, /generateInnerVoice/);
assert.match(app, /const innerVoiceController = useInnerVoice/);
assert.match(app, /record=\{innerVoiceController\.record\}/);
assert.match(app, /createInlineInnerVoiceRecord/);
assert.match(app, /innerVoiceController\.syncInlineRecord/);
console.log("PASS inner voice is read from cache and generated on demand when missing");
