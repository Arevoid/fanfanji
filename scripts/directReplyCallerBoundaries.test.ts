import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/features/chat/hooks/useChatController.ts", import.meta.url), "utf8");
const replyController = readFileSync(new URL("../src/features/chat/controllers/chatReplyController.ts", import.meta.url), "utf8");
const regenerate = readFileSync(new URL("../src/features/chat/hooks/useChatRegenerationAction.ts", import.meta.url), "utf8");

const sendOnlyStart = controller.indexOf("const handleSendOnly");
const sendOnlyEnd = controller.indexOf("// Handle Send Message and Trigger AI reply", sendOnlyStart);
assert.ok(sendOnlyStart >= 0 && sendOnlyEnd > sendOnlyStart, "send-only handler must remain explicit");
const sendOnly = controller.slice(sendOnlyStart, sendOnlyEnd);
assert.match(sendOnly, /onSendMessage\(userMessage\)/, "send-only must persist the user message");
assert.doesNotMatch(sendOnly, /generateResponseForUserMessage|apiChat/, "send-only must not start an AI request");

const sendAndReplyStart = controller.indexOf("const handleSendAndReply");
const sendAndReplyEnd = controller.indexOf("const stopReply", sendAndReplyStart);
assert.ok(sendAndReplyStart >= 0 && sendAndReplyEnd > sendAndReplyStart, "send-and-reply handler must remain explicit");
const sendAndReply = controller.slice(sendAndReplyStart, sendAndReplyEnd);
assert.ok(
  sendAndReply.indexOf("onSendMessage(userMessage)") < sendAndReply.indexOf("await generateResponseForUserMessage(userMessage"),
  "the user message must be persisted before the direct reply starts",
);
assert.match(sendAndReply, /finally\s*\{[\s\S]*replyInFlightRef\.current\.delete\(scopeKey\)/, "reply lock must be released in finally");

assert.match(replyController, /if \(context\.isGroup\)[\s\S]*generateGroupReply/, "controller must keep group/direct routing outside the direct pipeline");
assert.match(replyController, /return dependencies\.generateDirectReply\(/, "controller must forward the direct lifecycle outcome");

const pipelineStart = appChat.indexOf("const executeDirectReplyPipeline");
const pipelineEnd = appChat.indexOf("const chatReplyController", pipelineStart);
assert.ok(pipelineStart >= 0 && pipelineEnd > pipelineStart, "direct reply pipeline must remain a single explicit boundary");
const pipeline = appChat.slice(pipelineStart, pipelineEnd);
assert.match(pipeline, /requestDirectChatTurn\(/, "normal direct reply must keep the existing request service");
assert.match(pipeline, /deliverDirectReplyCandidates\(/, "normal direct reply must keep the existing delivery service");
assert.match(pipeline, /postReplyCoordinator\.schedule\(/, "post-reply work must remain behind the coordinator");
assert.match(pipeline, /finally\s*\{[\s\S]*setIsTyping\(false\)/, "typing state must always be restored");

assert.match(regenerate, /generateRegeneratedChatTurn/, "regenerate must keep its dedicated generation path");
assert.doesNotMatch(regenerate, /postReplyCoordinator|generateResponseForUserMessage/, "regenerate must not silently join normal-send orchestration");

console.log("Direct reply caller boundaries: persistence, send-only, routing, lifecycle cleanup, and regenerate isolation are characterized");
