import assert from "node:assert/strict";
import { deliverDirectReplyCandidates, DirectReplyDeliveryError } from "../src/features/chat/services/directReplyDeliveryService";
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

const beforeSendOrder: string[] = [];
await deliverDirectReplyCandidates({
  candidates: { messages: [message("prepared-one", "第一条"), message("prepared-two", "第二条")], bubbleTexts: ["第一条", "第二条"] },
  shouldCancel: () => false,
  onTyping: () => undefined,
  onBeforeSend: (value, index, total) => { beforeSendOrder.push(`prepare:${value.id}:${index + 1}/${total}`); },
  onSendMessage: (value) => { beforeSendOrder.push(`send:${value.id}`); },
  wait: async () => undefined,
});
assert.deepEqual(beforeSendOrder, [
  "prepare:prepared-one:1/2", "send:prepared-one",
  "prepare:prepared-two:2/2", "send:prepared-two",
], "message-bound data must be durable immediately before its bubble is committed");

const voiceFailureSent: Message[] = [];
await assert.rejects(() => deliverDirectReplyCandidates({
  candidates: { messages: [message("voice-ok", "已有心声"), message("voice-missing", "保存失败")], bubbleTexts: ["已有心声", "保存失败"] },
  shouldCancel: () => false,
  onTyping: () => undefined,
  onBeforeSend: (value) => {
    if (value.id === "voice-missing") throw new Error("心声本地保存失败");
  },
  onSendMessage: (value) => { voiceFailureSent.push(value); },
  wait: async () => undefined,
}), (error: unknown) => {
  assert.ok(error instanceof DirectReplyDeliveryError);
  assert.deepEqual(error.deliveredMessages.map((value) => value.id), ["voice-ok"]);
  assert.match(error.message, /心声本地保存失败/);
  return true;
});
assert.deepEqual(voiceFailureSent.map((value) => value.id), ["voice-ok"], "a bubble whose required sidecar could not be saved must not be sent");

let cancelledSent = 0;
const cancelled = await deliverDirectReplyCandidates({
  candidates: { messages: [message("first", "第一条"), message("second", "第二条")], bubbleTexts: ["第一条", "第二条"] },
  shouldCancel: () => cancelledSent > 0,
  onTyping: () => undefined,
  onSendMessage: (value) => { cancelledSent += 1; void value; },
  wait: async () => undefined,
});
assert.deepEqual(cancelled.map((value) => value.id), ["first"], "call cancellation stops unsent bubbles");

const partialFailureSent: Message[] = [];
await assert.rejects(
  () => deliverDirectReplyCandidates({
    candidates: { messages: [message("delivered", "已发送"), message("failing", "失败")], bubbleTexts: ["已发送", "失败"] },
    shouldCancel: () => false,
    onTyping: () => undefined,
    onSendMessage: (value) => {
      partialFailureSent.push(value);
      if (value.id === "failing") throw new Error("second bubble failed");
    },
    wait: async () => undefined,
  }),
  (error: unknown) => {
    assert.ok(error instanceof DirectReplyDeliveryError);
    assert.deepEqual(error.deliveredMessages.map((value) => value.id), ["delivered"]);
    assert.match(error.message, /second bubble failed/);
    return true;
  },
);
assert.deepEqual(partialFailureSent.map((value) => value.id), ["delivered", "failing"]);
console.log("Direct reply delivery service: timing and cancellation boundaries passed");
