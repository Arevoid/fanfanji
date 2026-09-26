import assert from "node:assert/strict";
import { resolveRegenerationTurnScope } from "../src/features/chat/services/regenerationTurnScope";

const messages = [
  { id: "u1", sender: "user", content: "旧话题", timestamp: 1 },
  { id: "a1", sender: "character", content: "旧回复", timestamp: 2 },
  { id: "u2", sender: "user", content: "新话题", timestamp: 3 },
  { id: "a2", sender: "character", content: "新回复", timestamp: 4 },
] as any;
const oldTurn = resolveRegenerationTurnScope(messages, { id: "a1" });
assert.deepEqual(oldTurn.messagesBeforeTarget.map((message) => message.id), ["u1"]);
assert.equal(oldTurn.userMessage?.id, "u1", "an older reply must use its immediately preceding user turn");
assert.deepEqual(oldTurn.targetMessages.map((message) => message.id), ["a1"]);

const latestTurn = resolveRegenerationTurnScope(messages, { id: "a2" });
assert.deepEqual(latestTurn.messagesBeforeTarget.map((message) => message.id), ["u1", "a1", "u2"]);
assert.equal(latestTurn.userMessage?.id, "u2");
assert.deepEqual(latestTurn.targetMessages.map((message) => message.id), ["a2"]);

const batchedMessages = [
  { id: "u3", sender: "user", content: "再说一次", timestamp: 5 },
  { id: "a3", sender: "character", replyBatchId: "batch-1", content: "第一句", timestamp: 6 },
  { id: "a4", sender: "character", replyBatchId: "batch-1", content: "第二句", timestamp: 7 },
  { id: "a5", sender: "character", replyBatchId: "batch-1", content: "第三句", timestamp: 8 },
  { id: "u4", sender: "user", content: "下一轮", timestamp: 9 },
] as any;
const batchedTurn = resolveRegenerationTurnScope(batchedMessages, { id: "a4" });
assert.deepEqual(batchedTurn.messagesBeforeTarget.map((message) => message.id), ["u3"]);
assert.deepEqual(batchedTurn.targetMessages.map((message) => message.id), ["a3", "a4", "a5"]);

const missingTarget = resolveRegenerationTurnScope(messages, { id: "missing" });
assert.deepEqual(missingTarget.messagesBeforeTarget.map((message) => message.id), ["u1", "a1", "u2", "a2"]);
assert.equal(missingTarget.userMessage?.id, "u2");
assert.deepEqual(missingTarget.targetMessages.map((message) => message.id), ["missing"]);

console.log("PASS regeneration stays within the selected reply turn");
