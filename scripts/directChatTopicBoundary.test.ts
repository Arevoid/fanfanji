import assert from "node:assert/strict";
import { decideDirectChatTopicBoundary } from "../src/features/chat/services/directChatTopicBoundary";

const day = (value: string) => new Date(value).getTime();

const oldTopic = [
  { sender: "user", content: "昨天一直在讨论C++代码", timestamp: day("2026-08-19T18:00:00+08:00") },
  { sender: "character", content: "你的代码问题还没解决吗", timestamp: day("2026-08-19T18:02:00+08:00") },
] as const;

const freshImage = decideDirectChatTopicBoundary({
  currentMessage: { content: "[图片]", imageAssetId: "asset-new", timestamp: day("2026-09-13T12:18:00+08:00") },
  previousMessages: oldTopic,
  enableTimeAwareness: true,
});
assert.equal(freshImage.mode, "shift", "a fresh image after a cross-day pause starts a new topic by default");
assert.ok(freshImage.reasons.includes("fresh_media_after_pause"));

const freshText = decideDirectChatTopicBoundary({
  currentMessage: { content: "中午好，今天吃什么？", timestamp: day("2026-09-13T12:18:00+08:00") },
  previousMessages: [
    { sender: "user", content: "昨天一直在讨论C++代码", timestamp: day("2026-08-19T18:00:00+08:00") },
    { sender: "character", content: "代码问题已经解决了。", timestamp: day("2026-08-19T18:02:00+08:00") },
  ],
  enableTimeAwareness: true,
});
assert.equal(freshText.mode, "shift", "a low-overlap text turn after a long pause starts a new topic");

const explicitContinuation = decideDirectChatTopicBoundary({
  currentMessage: { content: "继续说说上次的C++代码问题", timestamp: day("2026-09-13T12:18:00+08:00") },
  previousMessages: oldTopic,
  enableTimeAwareness: true,
});
assert.equal(explicitContinuation.mode, "continue");
assert.equal(explicitContinuation.confidence, 0.99);

const explicitShift = decideDirectChatTopicBoundary({
  currentMessage: { content: "换个话题，今天吃什么", timestamp: day("2026-08-19T18:05:00+08:00") },
  previousMessages: oldTopic,
  enableTimeAwareness: false,
});
assert.equal(explicitShift.mode, "shift");

const shiftWinsOverReference = decideDirectChatTopicBoundary({
  currentMessage: { content: "上次先不聊了，换个话题吧", timestamp: day("2026-08-19T18:05:00+08:00") },
  previousMessages: oldTopic,
  enableTimeAwareness: false,
});
assert.equal(shiftWinsOverReference.mode, "shift", "an explicit shift wins even when the message mentions the old topic");

const openThread = decideDirectChatTopicBoundary({
  currentMessage: { content: "我到了", timestamp: day("2026-09-13T12:18:00+08:00") },
  previousMessages: [
    { sender: "character", content: "你到了吗？", timestamp: day("2026-09-13T12:00:00+08:00") },
  ],
  enableTimeAwareness: true,
});
assert.equal(openThread.mode, "continue", "an unanswered question remains a live topic");

console.log("PASS direct chat topic boundary combines explicit intent, closure, overlap, time, and media signals");
