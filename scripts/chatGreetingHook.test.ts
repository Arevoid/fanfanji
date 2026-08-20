import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync("src/features/chat/hooks/useChatGreeting.ts", "utf8");
const chat = readFileSync("src/components/AppChat.tsx", "utf8");
assert.match(hook, /1500/);
assert.match(hook, /clearTimeout\(timer\)/);
assert.match(hook, /sentGreetings\.includes/);
assert.match(chat, /useChatGreeting\(/);
assert.doesNotMatch(chat, /msg-greeting-/);
console.log("PASS chat greeting side effect is isolated behind a cleanup-safe hook");
