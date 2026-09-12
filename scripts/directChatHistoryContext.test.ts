import assert from "node:assert/strict";
import { buildDirectChatHistoryContext } from "../src/features/chat/services/directChatHistoryContext";
import { DIRECT_CHAT_LONG_GAP_MS } from "../src/features/chat/prompts/directChatTurnPrompt";

const messages = [
  { id: "m1", sender: "user", content: "旧消息", timestamp: 1 },
  { id: "m2", sender: "character", content: "回复", timestamp: 2 },
  { id: "m2", sender: "character", content: "回复更新", timestamp: 3 },
  { id: "current", sender: "user", content: "当前", timestamp: 4 },
] as any;
const context = buildDirectChatHistoryContext({
  messages,
  userMessageId: "current",
  userMessageAt: 4,
  enableTimeAwareness: false,
  contextLimit: 1,
  characterName: "范千",
  userName: "用户",
  requestTime: new Date(5),
});
assert.deepEqual(context.finalMessages.map((message) => message.id), ["m1", "m2", "current"]);
assert.deepEqual(context.messagesForHistory.map((message) => message.id), ["m1", "m2"]);
assert.deepEqual(context.recentMessages.map((message) => message.id), ["m2"]);
assert.equal(context.timeLogString, "");
assert.ok(context.history.length > 0);

const budgeted = buildDirectChatHistoryContext({
  messages: [
    { id: "b1", sender: "user", content: "旧消息一".repeat(8), timestamp: 1 },
    { id: "b2", sender: "character", content: "旧消息二".repeat(8), timestamp: 2 },
    { id: "b3", sender: "user", content: "最新消息".repeat(3), timestamp: 3 },
  ] as any,
  enableTimeAwareness: false,
  contextLimit: 50,
  historyCharacterLimit: 80,
  characterName: "范千",
  userName: "用户",
});
assert.deepEqual(budgeted.recentMessages.map((message) => message.id), ["b3"], "上下文应按字符预算保留最新完整消息");

const longGapCurrentAt = new Date("2026-08-12T14:19:00+08:00").getTime();
const longGap = buildDirectChatHistoryContext({
  messages: [
    { id: "old-topic", sender: "character", content: "旧话题现场", timestamp: longGapCurrentAt - DIRECT_CHAT_LONG_GAP_MS - 1 },
    { id: "current", sender: "user", content: "data:image/png;base64,TEST_IMAGE", timestamp: longGapCurrentAt },
  ] as any,
  userMessageId: "current",
  userMessageAt: longGapCurrentAt,
  enableTimeAwareness: true,
  contextLimit: 10,
  characterName: "范千",
  userName: "用户",
  requestTime: new Date(longGapCurrentAt),
});
assert.deepEqual(longGap.recentMessages.map((message) => message.id), []);
assert.match(longGap.crossDayHistoricalReference, /旧话题现场/);
assert.equal(longGap.hasCrossDayHistory, true, "same-day long gaps should close the old live scene");

const mediaBoundaryCurrentAt = new Date("2026-08-12T14:19:00+08:00").getTime();
const mediaBoundary = buildDirectChatHistoryContext({
  messages: [
    { id: "old-live-topic", sender: "character", content: "旧话题", timestamp: mediaBoundaryCurrentAt - DIRECT_CHAT_LONG_GAP_MS - 1 },
    { id: "recent-image", sender: "user", content: "data:image/png;base64,RECENT_IMAGE", timestamp: mediaBoundaryCurrentAt - 1_000 },
    { id: "new-topic", sender: "user", content: "你看看这张图", timestamp: mediaBoundaryCurrentAt },
  ] as any,
  userMessageId: "new-topic",
  userMessageAt: mediaBoundaryCurrentAt,
  enableTimeAwareness: true,
  contextLimit: 10,
  characterName: "范千",
  userName: "用户",
  requestTime: new Date(mediaBoundaryCurrentAt),
});
assert.deepEqual(mediaBoundary.recentMessages.map((message) => message.id), ["recent-image"], "a new image after a long pause starts a fresh live scene");
assert.match(mediaBoundary.crossDayHistoricalReference, /旧话题/);
console.log("PASS direct chat history context deduplicates, excludes the current turn, and applies the bounded window");
