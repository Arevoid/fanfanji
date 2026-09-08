import { strict as assert } from "node:assert";
import { buildDirectChatContextSnapshot } from "../src/features/chat/services/directChatContextSnapshotBuilder";
import { buildDirectChatSystemInstruction } from "../src/features/chat/prompts/directChatPromptBuilder";
import { requestDirectChatTurn } from "../src/features/chat/controllers/chatGenerationController";
import { createDirectReplyCandidates } from "../src/features/chat/services/directChatService";
import { createRegeneratedReplyCandidates } from "../src/features/chat/services/regenerateService";
import { deliverDirectReplyCandidates } from "../src/features/chat/services/directReplyDeliveryService";
import { createDirectReplyLifecycleOutcome, type DirectReplyLifecycleInput } from "../src/features/chat/contracts/directReplyLifecycle";
import type { Character, Message, UserSettings } from "../src/types";
import type { CharacterPromptProjection } from "../src/domain/prompt/characterPromptProjector";

const settings = { apiKey: "key", selectedModel: "model" } as UserSettings;
const character = { id: "character-1", name: "角色" } as Character;
const projection = {
  description: { content: "description" },
  personality: { content: "personality" },
  expressionAnchor: { content: "expression" },
} as CharacterPromptProjection;
const userMessage = { id: "user-1", characterId: character.id, sender: "user", content: "当前问题", timestamp: 2 } as Message;
const previousReply = { id: "reply-1", characterId: character.id, sender: "character", content: "旧回复", timestamp: 3 } as Message;
const lifecycle: DirectReplyLifecycleInput = {
  mode: "send",
  scope: { characterId: character.id, relationId: "relation-1", conversationId: "conversation-1", userIdentityId: "identity-1" },
  userMessage,
  historyBoundary: { userMessageId: userMessage.id, excludedMessageIds: [] },
  runtime: { requestedAt: 4 },
  postReplyPolicy: "normal_send",
};

const snapshot = buildDirectChatContextSnapshot({
  messages: [previousReply, userMessage],
  userMessageId: userMessage.id,
  enableTimeAwareness: false,
  contextLimit: 20,
  characterName: character.name,
  userName: "用户",
});
const systemInstruction = buildDirectChatSystemInstruction({
  mainPromptText: "main",
  characterDescriptionText: "description",
  personalityText: "personality",
  userProfileText: "profile",
  userKnowledgeBoundary: "knowledge",
  includeLongTermMemory: false,
  characterKnowledgeBoundary: "character knowledge",
  onlineChatSpatialBoundary: "online boundary",
  characterProjection: projection,
  diagnosticLabel: "direct chat prompt",
  finalLanguageInstruction: "language",
});

let requestCount = 0;
const response = await requestDirectChatTurn({
  prompt: { scenario: "direct-chat", message: userMessage.content, history: snapshot.history, systemInstruction },
  settings,
  requestAi: async () => {
    requestCount += 1;
    return { text: "第一条\n\n第二条" };
  },
});
const candidates = createDirectReplyCandidates({
  rawText: response.text,
  disableBracketActions: false,
  keepPeriods: false,
  characterId: character.id,
  characterName: character.name,
  userName: "用户",
  createId: (index) => `reply-${index}`,
  currentTime: (index) => 10 + index,
});
const deliveredMessages: Message[] = [];
const delivered = await deliverDirectReplyCandidates({
  candidates,
  shouldCancel: () => false,
  onTyping: () => undefined,
  onSendMessage: (message) => { deliveredMessages.push(message); },
  wait: async () => undefined,
});
assert.equal(requestCount, 1, "normal send keeps one provider request in the happy path");
assert.deepEqual(delivered.map((message) => message.id), ["reply-0", "reply-1"]);
assert.deepEqual(deliveredMessages.map((message) => message.id), ["reply-0", "reply-1"]);
const normalOutcome = createDirectReplyLifecycleOutcome({
  lifecycle,
  status: "delivered",
  phase: "delivered",
  delivery: { status: "delivered", generatedCandidateIds: delivered.map((message) => message.id), deliveredMessageIds: delivered.map((message) => message.id) },
});
assert.equal(normalOutcome.delivery.status, "delivered");

await assert.rejects(() => requestDirectChatTurn({
  prompt: { scenario: "direct-chat", message: userMessage.content, history: snapshot.history, systemInstruction },
  settings,
  includeInnerVoice: true,
  requestAi: async () => ({ text: "{\"reply\":{\"invalid\":true}}" }),
}), /格式异常/);
const parseFailureOutcome = createDirectReplyLifecycleOutcome({
  lifecycle,
  status: "failed",
  phase: "failed",
  delivery: { status: "not_delivered" },
  error: { kind: "parse", recoverable: true },
});
assert.equal(parseFailureOutcome.delivery.deliveredMessageIds.length, 0);
assert.deepEqual(parseFailureOutcome.error, { kind: "parse", recoverable: true });

const regenerationInput: DirectReplyLifecycleInput = {
  ...lifecycle,
  mode: "regenerate",
  targetMessage: previousReply,
  historyBoundary: { userMessageId: userMessage.id, targetMessageId: previousReply.id, excludedMessageIds: [previousReply.id, userMessage.id] },
  postReplyPolicy: "regenerate_none",
};
const regenerateSnapshot = buildDirectChatContextSnapshot({
  messages: [previousReply, userMessage],
  userMessageId: userMessage.id,
  historyExcludedMessageIds: [previousReply.id, userMessage.id],
  enableTimeAwareness: false,
  contextLimit: 20,
  characterName: character.name,
  userName: "用户",
});
assert.equal(regenerateSnapshot.messagesForHistory.some((message) => message.id === previousReply.id), false);
assert.equal(regenerateSnapshot.messagesForHistory.some((message) => message.id === userMessage.id), false);
const regeneratedCandidates = createRegeneratedReplyCandidates({
  rawText: "替换回复",
  disableBracketActions: false,
  keepPeriods: false,
  characterId: character.id,
  characterName: character.name,
  userName: "用户",
  createId: (index) => `regenerated-${index}`,
  currentTime: (index) => 20 + index,
});
assert.deepEqual(regeneratedCandidates.messages.map((message) => message.id), ["regenerated-0"]);
const regenerationOutcome = createDirectReplyLifecycleOutcome({
  lifecycle: regenerationInput,
  status: "delivered",
  phase: "delivered",
  delivery: { status: "delivered", generatedCandidateIds: ["regenerated-0"], deliveredMessageIds: ["regenerated-0"] },
});
assert.equal(regenerationOutcome.postReply.policy, "regenerate_none");

let failedDeliveryCount = 0;
await assert.rejects(() => deliverDirectReplyCandidates({
  candidates: { messages: [{ ...delivered[0], id: "failing" }], bubbleTexts: ["失败"] },
  shouldCancel: () => false,
  onTyping: () => undefined,
  onSendMessage: () => { failedDeliveryCount += 1; throw new Error("delivery failure"); },
  wait: async () => undefined,
}), /delivery failure/);
assert.equal(failedDeliveryCount, 1);
const failedOutcome = createDirectReplyLifecycleOutcome({
  lifecycle,
  status: "failed",
  phase: "failed",
  delivery: { status: "not_delivered" },
  error: { kind: "delivery", recoverable: true },
});
assert.equal(failedOutcome.delivery.deliveredMessageIds.length, 0, "failed delivery must not report false success");
assert.deepEqual(failedOutcome.error, { kind: "delivery", recoverable: true });

const postReplyFailureOutcome = createDirectReplyLifecycleOutcome({
  lifecycle,
  status: "delivered",
  phase: "post_reply_scheduled",
  delivery: { status: "delivered", generatedCandidateIds: ["reply-0"], deliveredMessageIds: ["reply-0"] },
  postReply: { scheduled: false, failures: ["memory_extract", "diary_generate"] },
});
assert.equal(postReplyFailureOutcome.status, "delivered", "best-effort post-reply failures must not fail the main reply");
assert.deepEqual(postReplyFailureOutcome.postReply.failures, ["memory_extract", "diary_generate"]);

console.log("Direct reply lifecycle behavior: send, regenerate boundary, delivery and failure characterization passed");
