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

const latestTurn = resolveRegenerationTurnScope(messages, { id: "a2" });
assert.deepEqual(latestTurn.messagesBeforeTarget.map((message) => message.id), ["u1", "a1", "u2"]);
assert.equal(latestTurn.userMessage?.id, "u2");

const missingTarget = resolveRegenerationTurnScope(messages, { id: "missing" });
assert.deepEqual(missingTarget.messagesBeforeTarget.map((message) => message.id), ["u1", "a1", "u2", "a2"]);
assert.equal(missingTarget.userMessage?.id, "u2");

console.log("PASS regeneration stays within the selected reply turn");
