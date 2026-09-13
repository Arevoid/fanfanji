import assert from "node:assert/strict";
import { buildDirectChatHistoryContext } from "../src/features/chat/services/directChatHistoryContext";
import { DIRECT_CHAT_LONG_GAP_MS } from "../src/features/chat/prompts/directChatTurnPrompt";

const messages = [
  { id: "m1", sender: "user", content: "old message", timestamp: 1 },
  { id: "m2", sender: "character", content: "reply", timestamp: 2 },
  { id: "m2", sender: "character", content: "reply updated", timestamp: 3 },
  { id: "current", sender: "user", content: "current", timestamp: 4 },
] as any;
const context = buildDirectChatHistoryContext({
  messages,
  userMessageId: "current",
  userMessageAt: 4,
  enableTimeAwareness: false,
  contextLimit: 1,
  characterName: "character",
  userName: "user",
  requestTime: new Date(5),
});
assert.deepEqual(context.finalMessages.map((message) => message.id), ["m1", "m2", "current"]);
assert.deepEqual(context.messagesForHistory.map((message) => message.id), ["m1", "m2"]);
assert.deepEqual(context.recentMessages.map((message) => message.id), ["m2"]);
assert.equal(context.timeLogString, "");
assert.ok(context.history.length > 0);

const budgeted = buildDirectChatHistoryContext({
  messages: [
    { id: "b1", sender: "user", content: "old message one ".repeat(8), timestamp: 1 },
    { id: "b2", sender: "character", content: "old message two ".repeat(8), timestamp: 2 },
    { id: "b3", sender: "user", content: "latest message ".repeat(3), timestamp: 3 },
  ] as any,
  enableTimeAwareness: false,
  contextLimit: 50,
  historyCharacterLimit: 80,
  characterName: "character",
  userName: "user",
});
assert.deepEqual(budgeted.recentMessages.map((message) => message.id), ["b3"], "history keeps the newest complete message within the character budget");

const longGapCurrentAt = new Date("2026-08-12T14:19:00+08:00").getTime();
const longGap = buildDirectChatHistoryContext({
  messages: [
    { id: "old-topic", sender: "character", content: "old topic scene", timestamp: longGapCurrentAt - DIRECT_CHAT_LONG_GAP_MS - 1 },
    { id: "current", sender: "user", content: "data:image/png;base64,TEST_IMAGE", timestamp: longGapCurrentAt },
  ] as any,
  userMessageId: "current",
  userMessageAt: longGapCurrentAt,
  enableTimeAwareness: true,
  contextLimit: 10,
  characterName: "character",
  userName: "user",
  requestTime: new Date(longGapCurrentAt),
});
assert.deepEqual(longGap.recentMessages.map((message) => message.id), []);
assert.equal(longGap.crossDayHistoricalReference, "", "a fresh image after a long pause must not carry stale topic prose");
assert.equal(longGap.hasCrossDayHistory, true, "same-day long gaps should close the old live scene");
assert.equal(longGap.topicBoundary.mode, "shift");

const mediaBoundaryCurrentAt = new Date("2026-08-12T14:19:00+08:00").getTime();
const mediaBoundary = buildDirectChatHistoryContext({
  messages: [
    { id: "old-live-topic", sender: "character", content: "old topic", timestamp: mediaBoundaryCurrentAt - DIRECT_CHAT_LONG_GAP_MS - 1 },
    { id: "recent-image", sender: "user", content: "data:image/png;base64,RECENT_IMAGE", timestamp: mediaBoundaryCurrentAt - 1_000 },
    { id: "new-topic", sender: "user", content: "look at this image", timestamp: mediaBoundaryCurrentAt },
  ] as any,
  userMessageId: "new-topic",
  userMessageAt: mediaBoundaryCurrentAt,
  enableTimeAwareness: true,
  contextLimit: 10,
  characterName: "character",
  userName: "user",
  requestTime: new Date(mediaBoundaryCurrentAt),
});
assert.deepEqual(mediaBoundary.recentMessages.map((message) => message.id), ["recent-image"], "a follow-up text immediately after an image remains in the live scene");
assert.ok(mediaBoundary.crossDayHistoricalReference.length > 0, "an immediately-following image turn keeps older context as low-priority reference");
assert.equal(mediaBoundary.topicBoundary.mode, "uncertain", "a follow-up text immediately after an image remains eligible for continuity");
console.log("PASS direct chat history context deduplicates, applies topic boundaries, and keeps the bounded window");
