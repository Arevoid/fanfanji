import assert from "node:assert/strict";
import type { Character, Message, UserSettings } from "../src/types";
import {
  executeDirectReplyUseCase,
  type DirectReplyUseCaseInput,
} from "../src/features/chat/services/directReplyUseCase";
import type { DirectReplyLifecycleInput } from "../src/features/chat/contracts/directReplyLifecycle";

const character = { id: "character-1", name: "角色" } as Character;
const userMessage = {
  id: "user-1",
  characterId: character.id,
  sender: "user",
  content: "你好",
  timestamp: 1,
} as Message;
const settings = { apiKey: "test-only", selectedModel: "test-model" } as UserSettings;
const lifecycle: DirectReplyLifecycleInput = {
  mode: "send",
  scope: {
    characterId: character.id,
    relationId: "relation-1",
    conversationId: "conversation-1",
    userIdentityId: "identity-1",
  },
  userMessage,
  historyBoundary: { userMessageId: userMessage.id },
  runtime: { requestedAt: 1 },
  postReplyPolicy: "normal_send",
};

const createInput = (
  requestAi: () => Promise<{ text: string }>,
  overrides: Partial<DirectReplyUseCaseInput<{ text: string }>> = {},
): DirectReplyUseCaseInput<{ text: string }> => ({
  lifecycle,
  turn: {
    request: {
      prompt: {
        scenario: "direct-chat",
        message: userMessage.content,
        history: [],
        systemInstruction: "system",
      },
      settings,
      requestAi,
    },
    normalizeResponse: (response) => ({ text: String((response as { text?: unknown }).text || "") }),
    hasReplyText: (response) => Boolean(response.text),
    createCandidateContext: (response) => ({
      rawText: response.text,
      characterId: character.id,
      characterName: character.name,
      userName: "用户",
      disableBracketActions: false,
      keepPeriods: false,
      createId: (index) => `reply-${index}`,
      currentTime: (index) => index + 10,
    }),
    deliver: async ({ candidates }) => candidates.messages,
  },
  ...overrides,
});

const lifecycleEvents: string[] = [];
const successful = await executeDirectReplyUseCase(createInput(async () => ({ text: "第一条\n\n第二条" }), {
  durableCompletion: async ({ deliveredMessages }) => {
    lifecycleEvents.push(`durable:${deliveredMessages.length}`);
    return true;
  },
  postReply: () => {
    lifecycleEvents.push("post-reply");
    return { scheduled: true, failures: [] };
  },
}));
assert.deepEqual(lifecycleEvents, ["durable:2", "post-reply"], "durability completes once after all bubbles and before side effects");
assert.equal(successful.durableCompletionConfirmed, true);

let providerFailureDurabilityCalls = 0;
const providerFailure = await executeDirectReplyUseCase(createInput(async () => {
  throw Object.assign(new Error("mock network failure"), { code: "network" });
}, {
  durableCompletion: ({ deliveredMessages }) => {
    providerFailureDurabilityCalls += 1;
    assert.equal(deliveredMessages.length, 0, "provider failure still flushes the already-created user message");
    return true;
  },
}));
assert.equal(providerFailure.outcome.status, "failed");
assert.equal(providerFailureDurabilityCalls, 1, "provider failure has one durable completion boundary");
assert.equal(providerFailure.durableCompletionConfirmed, true);

const partialInput = createInput(async () => ({ text: "第一条\n\n第二条" }), {
  durableCompletion: ({ deliveredMessages }) => {
    assert.deepEqual(deliveredMessages.map((message) => message.id), ["reply-0"]);
    return true;
  },
});
partialInput.turn.deliver = async ({ candidates }) => {
  throw { deliveredMessages: [candidates.messages[0]] };
};
const partial = await executeDirectReplyUseCase(partialInput);
assert.equal(partial.outcome.status, "failed");
assert.equal(partial.outcome.delivery.status, "partial");
assert.equal(partial.durableCompletionConfirmed, true);

const durabilityFailure = await executeDirectReplyUseCase(createInput(async () => ({ text: "回复" }), {
  durableCompletion: async () => { throw new Error("mock storage failure"); },
}));
assert.equal(durabilityFailure.outcome.status, "delivered", "storage failure must not rewrite the provider/delivery result");
assert.equal(durabilityFailure.durableCompletionConfirmed, false);

console.log("DirectReply durable completion contract passed: success, provider failure, partial delivery, multi-bubble, and non-blocking storage failure");
