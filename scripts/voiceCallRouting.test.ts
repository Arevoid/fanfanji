import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(new URL("../src/features/chat/hooks/useChatController.ts", import.meta.url), "utf8");
const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const incomingCallHandlerStart = appChat.indexOf("onExplicitIncomingCallRequest:");
const incomingCallHandlerEnd = appChat.indexOf("onReplyStopped:", incomingCallHandlerStart);
const incomingCallHandler = appChat.slice(incomingCallHandlerStart, incomingCallHandlerEnd);

assert.match(controller, /const routeExplicitIncomingCallRequest =/);
assert.equal(
  controller.match(/routeExplicitIncomingCallRequest\(userMessage\)/g)?.length,
  2,
  "send-only and send-and-reply must share explicit callback routing",
);
assert.match(appChat, /const resolveVoiceCallScopeForContext =/);
assert.match(appChat, /beginVoiceCall\(true, callScope\)/);
assert.match(appChat, /beginVideoCall\(true, callScope\)/);
assert.doesNotMatch(appChat, /onExplicitVoiceCallRequest/);
assert.doesNotMatch(controller, /routeExplicitVoiceCallRequest/);
assert.doesNotMatch(incomingCallHandler, /beginVoiceCall\(false/);
assert.doesNotMatch(incomingCallHandler, /beginVideoCall\(false/);
assert.match(appChat, /resolveCharacterCallIntent\(createdMessages\)/);
assert.match(appChat, /explicitCallbackRequested/);

console.log("PASS explicit callback requests share the send pipeline and recover call scope");
