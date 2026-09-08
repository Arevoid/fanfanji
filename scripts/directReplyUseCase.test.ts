import { strict as assert } from "node:assert";
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
const settings = { apiKey: "key", selectedModel: "model" } as UserSettings;
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

let providerRequestCount = 0;
const successful = await executeDirectReplyUseCase(createInput(async () => {
  providerRequestCount += 1;
  return { text: "第一条\n\n第二条" };
}, {
  postReply: () => ({ scheduled: true, failures: [] }),
}));
assert.equal(providerRequestCount, 1, "normal direct send performs one provider request");
assert.equal(successful.outcome.status, "delivered");
assert.equal(successful.outcome.phase, "post_reply_scheduled");
assert.deepEqual(successful.outcome.delivery.deliveredMessageIds, ["reply-0", "reply-1"]);

let postReplyCalls = 0;
const postReplyFailure = await executeDirectReplyUseCase(createInput(async () => ({ text: "回复" }), {
  postReply: () => {
    postReplyCalls += 1;
    return { scheduled: false, failures: ["memory_extract", "diary"] };
  },
}));
assert.equal(postReplyCalls, 1, "post-reply adapter runs once after delivery");
assert.equal(postReplyFailure.outcome.status, "delivered", "post-reply failure must not fail the main reply");
assert.deepEqual(postReplyFailure.outcome.postReply.failures, ["memory_extract", "diary"]);

const throwingPostReply = await executeDirectReplyUseCase(createInput(async () => ({ text: "回复" }), {
  postReply: () => { throw new Error("background failure"); },
}));
assert.equal(throwingPostReply.outcome.status, "delivered");
assert.deepEqual(throwingPostReply.outcome.postReply.failures, ["post_reply"]);

const providerFailure = await executeDirectReplyUseCase(createInput(async () => {
  throw Object.assign(new Error("network"), { code: "network" });
}));
assert.equal(providerFailure.outcome.status, "failed");
assert.equal(providerFailure.outcome.error?.kind, "provider");
assert.equal(providerFailure.outcome.postReply.scheduled, false);

const parseFailure = await executeDirectReplyUseCase(createInput(async () => ({ text: "" })));
assert.equal(parseFailure.outcome.status, "failed");
assert.equal(parseFailure.outcome.phase, "parsed");
assert.equal(parseFailure.outcome.error?.kind, "parse");

const partialInput = createInput(async () => ({ text: "第一条\n\n第二条" }));
partialInput.turn.deliver = async ({ candidates }) => {
  throw { deliveredMessages: [candidates.messages[0]] };
};
const partialDelivery = await executeDirectReplyUseCase(partialInput);
assert.equal(partialDelivery.outcome.status, "failed");
assert.equal(partialDelivery.outcome.phase, "delivering");
assert.equal(partialDelivery.outcome.delivery.status, "partial");
assert.deepEqual(partialDelivery.outcome.delivery.deliveredMessageIds, ["reply-0"]);

const controller = new AbortController();
controller.abort();
const cancelledInput = createInput(async () => {
  throw new Error("must not call provider");
});
cancelledInput.turn.signal = controller.signal;
const cancelled = await executeDirectReplyUseCase(cancelledInput);
assert.equal(cancelled.outcome.status, "cancelled");
assert.equal(cancelled.outcome.phase, "cancelled");

await assert.rejects(() => executeDirectReplyUseCase(createInput(async () => ({ text: "回复" }), {
  lifecycle: { ...lifecycle, mode: "regenerate", postReplyPolicy: "regenerate_none" },
})), /normal direct sends/);

console.log("DirectReplyUseCase: normal success, provider/parse/delivery failure, partial delivery, cancellation, post-reply isolation, and regenerate guard passed");
