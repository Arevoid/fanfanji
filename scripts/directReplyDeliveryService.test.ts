import assert from "node:assert/strict";
import { deliverDirectReplyCandidates } from "../src/features/chat/services/directReplyDeliveryService";
import type { Message } from "../src/types";

const message = (id: string, content: string): Message => ({ id, characterId: "character", sender: "character", content, timestamp: 0 });
const sent: Message[] = [];
const typing: boolean[] = [];
const waits: number[] = [];
let clock = 100;
const created = await deliverDirectReplyCandidates({
  candidates: { messages: [message("one", "你好"), message("two", "收到")], bubbleTexts: ["你好", "收到"] },
  shouldCancel: () => false,
  onTyping: (value) => typing.push(value),
  onSendMessage: async (value) => { sent.push(value); },
  now: () => ++clock,
  random: () => 0,
  wait: async (milliseconds) => { waits.push(milliseconds); },
});
assert.deepEqual(created.map((value) => value.id), ["one", "two"]);
assert.deepEqual(sent.map((value) => value.timestamp), [101, 102]);
assert.deepEqual(typing, [true, false, true, false]);
assert.deepEqual(waits, [600, 400, 600], "delivery keeps the typing and inter-bubble delay policy");

let cancelledSent = 0;
const cancelled = await deliverDirectReplyCandidates({
  candidates: { messages: [message("first", "第一条"), message("second", "第二条")], bubbleTexts: ["第一条", "第二条"] },
  shouldCancel: () => cancelledSent > 0,
  onTyping: () => undefined,
  onSendMessage: (value) => { cancelledSent += 1; void value; },
  wait: async () => undefined,
});
assert.deepEqual(cancelled.map((value) => value.id), ["first"], "call cancellation stops unsent bubbles");
console.log("Direct reply delivery service: timing and cancellation boundaries passed");
