import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(new URL("../src/features/chat/hooks/useChatController.ts", import.meta.url), "utf8");
const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");

assert.match(controller, /const routeExplicitVoiceCallRequest =/);
assert.equal(
  controller.match(/routeExplicitVoiceCallRequest\(userMessage\)/g)?.length,
  2,
  "send-only and send-and-reply must share explicit call routing",
);
assert.match(appChat, /const resolveVoiceCallScopeForContext =/);
assert.match(appChat, /beginVoiceCall\(true, callScope\)/);

console.log("PASS explicit callback requests share the send pipeline and recover call scope");
