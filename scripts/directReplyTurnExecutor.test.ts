import assert from "node:assert/strict";
import type { Message } from "../src/types";
import { DirectReplyDeliveryError } from "../src/features/chat/services/directReplyDeliveryService";
import { executeDirectReplyTurn } from "../src/features/chat/services/directReplyTurnExecutor";

const settings = { apiKey: "key", selectedModel: "model" } as any;
const baseRequest = {
  prompt: { scenario: "direct-chat" as const, message: "hello", history: [], systemInstruction: "system" },
  settings,
  includeInnerVoice: true,
};
const baseCandidateContext = (rawText: string) => ({
  rawText,
  disableBracketActions: false,
  keepPeriods: true,
  characterId: "character-1",
  createId: (index: number) => `reply-${index}`,
  currentTime: (index: number) => index + 1,
});

let normalizeCount = 0;
let requestCount = 0;
let deliveryOrder: string[] = [];
const normal = await executeDirectReplyTurn({
  request: {
    ...baseRequest,
    requestAi: async () => {
      requestCount += 1;
      return { text: "第一条\n\n第二条" };
    },
  },
  normalizeResponse: (response) => {
    normalizeCount += 1;
    return response;
  },
  hasReplyText: (response) => Boolean(response.text),
  createCandidateContext: (response) => baseCandidateContext(response.text),
  deliver: async ({ candidates }) => {
    deliveryOrder = candidates.messages.map((message) => message.id);
    return candidates.messages;
  },
});
assert.equal(requestCount, 1, "normal turn must use one provider request");
assert.equal(normalizeCount, 1, "normal turn must normalize once");
assert.equal(normal.status, "delivered");
assert.deepEqual(deliveryOrder, ["reply-0", "reply-1"], "candidate order must reach delivery unchanged");
assert.deepEqual(normal.generatedCandidateIds, ["reply-0", "reply-1"]);
assert.deepEqual(normal.deliveredMessageIds, ["reply-0", "reply-1"]);

let candidateCalled = false;
let deliveryCalled = false;
const providerFailure = await executeDirectReplyTurn({
  request: {
    ...baseRequest,
    requestAi: async () => { throw new Error("provider down"); },
  },
  normalizeResponse: (response) => response,
  hasReplyText: (response) => Boolean(response.text),
  createCandidateContext: (response) => {
    candidateCalled = true;
    return baseCandidateContext(response.text);
  },
  deliver: async ({ candidates }) => {
    deliveryCalled = true;
    return candidates.messages;
  },
});
assert.equal(providerFailure.status, "failed");
assert.equal(providerFailure.phase, "requesting");
assert.equal(candidateCalled, false, "provider failure must not create candidates");
assert.equal(deliveryCalled, false, "provider failure must not deliver candidates");

let parseCandidateCalled = false;
let parseDeliveryCalled = false;
const parseFailure = await executeDirectReplyTurn({
  request: { ...baseRequest, requestAi: async () => ({ text: "raw" }) },
  normalizeResponse: () => { throw new Error("normalization failed"); },
  hasReplyText: () => true,
  createCandidateContext: () => {
    parseCandidateCalled = true;
    return baseCandidateContext("never");
  },
  deliver: async ({ candidates }) => {
    parseDeliveryCalled = true;
    return candidates.messages;
  },
});
assert.equal(parseFailure.status, "failed");
assert.equal(parseFailure.phase, "parsed");
assert.equal(parseCandidateCalled, false, "normalization failure must not create candidates");
assert.equal(parseDeliveryCalled, false, "normalization failure must not deliver candidates");

const deliveredBeforeFailure: Message = { id: "reply-0", characterId: "character-1", sender: "character", content: "第一条", timestamp: 1 };
const deliveryFailure = await executeDirectReplyTurn({
  request: { ...baseRequest, requestAi: async () => ({ text: "第一条\n\n第二条" }) },
  normalizeResponse: (response) => response,
  hasReplyText: (response) => Boolean(response.text),
  createCandidateContext: (response) => baseCandidateContext(response.text),
  deliver: async () => {
    throw new DirectReplyDeliveryError(new Error("second bubble failed"), [deliveredBeforeFailure]);
  },
});
assert.equal(deliveryFailure.status, "failed");
assert.equal(deliveryFailure.phase, "delivering");
assert.deepEqual(deliveryFailure.deliveredMessageIds, ["reply-0"], "partial delivery IDs must be preserved");

const abortController = new AbortController();
abortController.abort();
let abortedRequestCount = 0;
const cancelled = await executeDirectReplyTurn({
  request: {
    ...baseRequest,
    signal: abortController.signal,
    requestAi: async () => {
      abortedRequestCount += 1;
      return { text: "should not run" };
    },
  },
  signal: abortController.signal,
  normalizeResponse: (response) => response,
  hasReplyText: (response) => Boolean(response.text),
  createCandidateContext: (response) => baseCandidateContext(response.text),
  deliver: async ({ candidates }) => candidates.messages,
});
assert.equal(cancelled.status, "cancelled");
assert.equal(cancelled.phase, "cancelled");
assert.equal(abortedRequestCount, 0, "pre-aborted turn must not call the request service");
console.log("Direct reply turn executor: request/normalize/candidate/delivery, order, failure, partial delivery, and cancellation passed");
