import assert from "node:assert/strict";
import { buildDirectChatHistoryContext } from "../src/features/chat/services/directChatHistoryContext";

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
console.log("PASS direct chat history context deduplicates, excludes the current turn, and applies the bounded window");
