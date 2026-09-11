import assert from "node:assert/strict";
import type { Message, UserSettings } from "../src/types";
import { requestDirectChatTurn } from "../src/features/chat/controllers/chatGenerationController";
import { executeDirectReplyTurn } from "../src/features/chat/services/directReplyTurnExecutor";
import { executeDirectReplyUseCase } from "../src/features/chat/services/directReplyUseCase";
import type { DirectReplyLifecycleInput } from "../src/features/chat/contracts/directReplyLifecycle";

const settings = { apiKey: "test-only", selectedModel: "test-model" } as UserSettings;
const userMessage = {
  id: "investigation-user",
  characterId: "investigation-character",
  sender: "user",
  content: "hello",
  timestamp: 1,
} as Message;
const baseRequest = {
  prompt: {
    scenario: "direct-chat" as const,
    message: userMessage.content,
    history: [],
    systemInstruction: "system",
  },
  settings,
  includeInnerVoice: true,
};
const candidateContext = (rawText: string) => ({
  rawText,
  disableBracketActions: false,
  keepPeriods: false,
  characterId: userMessage.characterId,
  characterName: "角色",
  userName: "用户",
  createId: (index: number) => `reply-${index}`,
  currentTime: (index: number) => index + 10,
});

// A: a valid provider result reaches candidate creation and delivery.
let deliveredCount = 0;
const valid = await executeDirectReplyTurn({
  request: { ...baseRequest, requestAi: async () => ({ text: "正常回复" }) },
  normalizeResponse: (response) => response,
  hasReplyText: (response) => Boolean(response.text),
  createCandidateContext: (response) => candidateContext(response.text),
  deliver: async ({ candidates }) => {
    deliveredCount = candidates.messages.length;
    return candidates.messages;
  },
});
assert.equal(valid.status, "delivered");
assert.equal(valid.generatedCandidateIds.length, 1);
assert.equal(deliveredCount, 1);

// B: the first structured response is invalid, but the repair request succeeds.
let repairCalls = 0;
let repairInstruction = "";
const repaired = await executeDirectReplyTurn({
  request: {
    ...baseRequest,
    requestAi: async (input) => {
      repairCalls += 1;
      repairInstruction = input.systemInstruction || "";
      return repairCalls === 1
        ? { text: '{"reply":{"unexpected":true}}' }
        : { text: '{"reply":"修复后的回复","innerVoice":{"content":"未说出口","emotionalState":"平静"}}' };
    },
  },
  normalizeResponse: (response) => response,
  hasReplyText: (response) => Boolean(response.text),
  createCandidateContext: (response) => candidateContext(response.text),
  deliver: async ({ candidates }) => candidates.messages,
});
assert.equal(repairCalls, 2, "format repair performs one additional provider call");
assert.match(repairInstruction, /只返回一个合法 JSON 对象/);
assert.equal(repaired.status, "delivered");
assert.equal(repaired.deliveredMessageIds.length, 1);

// C: format-retry exhaustion is an explicit parsed failure, never a false delivery.
let exhaustedCalls = 0;
let exhaustedCandidateCalled = false;
const exhausted = await executeDirectReplyTurn({
  request: {
    ...baseRequest,
    requestAi: async () => {
      exhaustedCalls += 1;
      return { text: '{"reply":{"still":"invalid"}}' };
    },
  },
  normalizeResponse: (response) => response,
  hasReplyText: (response) => Boolean(response.text),
  createCandidateContext: (response) => {
    exhaustedCandidateCalled = true;
    return candidateContext(response.text);
  },
  deliver: async ({ candidates }) => candidates.messages,
});
assert.equal(exhaustedCalls, 2);
assert.equal(exhausted.status, "failed");
assert.equal(exhausted.phase, "parsed");
assert.equal(exhaustedCandidateCalled, false, "format failure stops before candidate creation");
assert.equal(exhausted.deliveredMessageIds.length, 0);
assert.match(String(exhausted.error), /格式异常/);

// D: a response can normalize to no candidate; the executor exposes no_response.
const noCandidate = await executeDirectReplyTurn({
  request: { ...baseRequest, requestAi: async () => ({ text: "（发送了一张照片）" }) },
  normalizeResponse: (response) => response,
  hasReplyText: (response) => Boolean(response.text),
  createCandidateContext: (response) => candidateContext(response.text),
  deliver: async ({ candidates }) => candidates.messages,
});
assert.equal(noCandidate.status, "no_response");
assert.equal(noCandidate.phase, "delivered");
assert.deepEqual(noCandidate.generatedCandidateIds, []);
assert.deepEqual(noCandidate.deliveredMessageIds, []);

// E: a format failure still reaches the user-message durability boundary.
const lifecycle: DirectReplyLifecycleInput = {
  mode: "send",
  scope: {
    characterId: userMessage.characterId,
    relationId: "investigation-relation",
    conversationId: "investigation-conversation",
    userIdentityId: "investigation-identity",
  },
  userMessage,
  historyBoundary: { userMessageId: userMessage.id },
  runtime: { requestedAt: 1 },
  postReplyPolicy: "normal_send",
};
let durabilityCalls = 0;
const failedUseCase = await executeDirectReplyUseCase({
  lifecycle,
  turn: {
    request: { ...baseRequest, requestAi: async () => ({ text: '{"reply":{"invalid":true}}' }) },
    normalizeResponse: (response) => ({ text: response.text }),
    hasReplyText: (response) => Boolean(response.text),
    createCandidateContext: (response) => candidateContext(response.text),
    deliver: async ({ candidates }) => candidates.messages,
  },
  durableCompletion: ({ deliveredMessages }) => {
    durabilityCalls += 1;
    assert.equal(deliveredMessages.length, 0);
    return true;
  },
});
assert.equal(failedUseCase.outcome.status, "failed");
assert.equal(failedUseCase.outcome.error?.kind, "parse");
assert.equal(durabilityCalls, 1, "format failure still flushes the already-created user message");
assert.equal(failedUseCase.durableCompletionConfirmed, true);

console.log("Direct reply format/delivery investigation: valid, repair, exhaustion, zero-candidate, and durability cases passed");
