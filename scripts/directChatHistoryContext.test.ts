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

const agreementCurrentAt = new Date("2026-09-15T20:35:00+08:00").getTime();
const agreementMessages = [
  "你要发 亲亲老婆，么么哒💋",
  "这样才行 才算",
  "我操，要求还真多",
  "还得是标准格式的？你这是趁火打劫啊",
  "行行行，怕了你了",
  "亲亲老婆，么么哒",
  "好了！盖章了！今天的份！不许再有别的附加条款了！",
  "这还差不多",
  "亲亲老公😘",
].map((content, index) => ({
  id: `agreement-${index}`,
  sender: index < 2 || index > 6 ? "user" : "character",
  content,
  timestamp: agreementCurrentAt - 24 * 60 * 60 * 1000 + index * 1_000,
}));
const agreementOpening = {
  id: "agreement-opening",
  sender: "user",
  content: "我还以为你又在翻昨天查岗的旧账",
  timestamp: agreementCurrentAt,
};
const agreementContext = buildDirectChatHistoryContext({
  messages: [...agreementMessages, agreementOpening] as any,
  userMessageId: agreementOpening.id,
  userMessageAt: agreementOpening.timestamp,
  enableTimeAwareness: true,
  contextLimit: 20,
  characterName: "谌澈",
  userName: "用户",
  requestTime: new Date(agreementCurrentAt),
});
assert.equal(agreementContext.topicBoundary.mode, "continue");
assert.match(agreementContext.crossDayHistoricalReference, /你要发 亲亲老婆，么么哒/);
assert.match(agreementContext.crossDayHistoricalReference, /亲亲老婆，么么哒/);
console.log("PASS direct chat history context deduplicates, applies topic boundaries, and keeps the bounded window");
