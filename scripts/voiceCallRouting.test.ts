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
assert.match(appChat, /const dispatchIncomingCallIntent =/);
assert.match(appChat, /dispatchIncomingCallIntent\(\{/);
assert.match(appChat, /const explicitCallbackIntent =/);
assert.match(appChat, /const incomingCallIntent = explicitCallbackIntent \|\| structuredCallIntent/);
assert.match(appChat, /media: incomingCallIntent/);
assert.match(appChat, /parseCallActionDirective/);
assert.match(appChat, /responseBatchId: replyBatchId/);
assert.doesNotMatch(appChat, /onExplicitVoiceCallRequest/);
assert.doesNotMatch(controller, /routeExplicitVoiceCallRequest/);
assert.doesNotMatch(incomingCallHandler, /beginVoiceCall\(false/);
assert.doesNotMatch(incomingCallHandler, /beginVideoCall\(false/);
assert.doesNotMatch(appChat, /resolveCharacterCallIntent\(createdMessages\)/);
assert.match(appChat, /explicitCallbackRequested/);

console.log("PASS explicit callback requests share the structured call pipeline and recover call scope");
