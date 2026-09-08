import { strict as assert } from "node:assert";
import type { Message } from "../src/types";
import {
  classifyDirectReplyError,
  createDirectReplyLifecycleOutcome,
  type DirectReplyLifecycleInput,
} from "../src/features/chat/contracts/directReplyLifecycle";

const userMessage = {
  id: "user-1",
  characterId: "character-1",
  sender: "user",
  content: "hello",
  timestamp: 1,
} as Message;

const sendInput: DirectReplyLifecycleInput = {
  mode: "send",
  scope: {
    characterId: "character-1",
    relationId: "relation-1",
    conversationId: "conversation-1",
    userIdentityId: "identity-1",
  },
  userMessage,
  historyBoundary: { userMessageId: userMessage.id, excludedMessageIds: [] },
  runtime: { requestedAt: 1 },
  postReplyPolicy: "normal_send",
};

const delivered = createDirectReplyLifecycleOutcome({
  lifecycle: sendInput,
  status: "delivered",
  phase: "post_reply_scheduled",
  delivery: {
    status: "delivered",
    generatedCandidateIds: ["reply-1", "reply-2"],
    deliveredMessageIds: ["reply-1", "reply-2"],
  },
  postReply: { scheduled: true },
});
assert.equal(delivered.status, "delivered");
assert.equal(delivered.phase, "post_reply_scheduled");
assert.equal(delivered.mode, "send");
assert.deepEqual(delivered.delivery.deliveredMessageIds, ["reply-1", "reply-2"]);
assert.equal(delivered.postReply.policy, "normal_send");
assert.equal(delivered.postReply.scheduled, true);

const regenerateInput: DirectReplyLifecycleInput = {
  ...sendInput,
  mode: "regenerate",
  targetMessage: { ...userMessage, id: "target-1", sender: "character" },
  historyBoundary: {
    userMessageId: userMessage.id,
    targetMessageId: "target-1",
    excludedMessageIds: ["target-1", userMessage.id],
  },
  correction: { oocComment: "保持当前角色语气" },
  postReplyPolicy: "regenerate_none",
};
const failed = createDirectReplyLifecycleOutcome({
  lifecycle: regenerateInput,
  status: "failed",
  phase: "failed",
  error: { kind: "provider", recoverable: true },
});
assert.equal(failed.mode, "regenerate");
assert.equal(failed.postReply.policy, "regenerate_none");
assert.equal(failed.delivery.status, "not_delivered");
assert.deepEqual(failed.delivery.deliveredMessageIds, []);
assert.deepEqual(classifyDirectReplyError(Object.assign(new Error("network"), { code: "network" })), { kind: "provider", recoverable: true });
assert.deepEqual(classifyDirectReplyError(Object.assign(new Error("aborted"), { code: "aborted" })), { kind: "cancelled", recoverable: true });
assert.deepEqual(classifyDirectReplyError(new Error("unknown")), { kind: "unknown", recoverable: false });

console.log("Direct reply lifecycle contract: 12 acceptance checks passed");
