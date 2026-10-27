import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectUnarchivedChatMessages, splitChatArchiveBatches,getChatArchiveBatchSize } from "../src/features/chat/hooks/useChatMemoryExtraction";
import type { Message } from "../src/types";
import { splitChatArchiveTurnBatches } from "../src/domain/memory/chatArchiveTurns";

const messages = Array.from({ length: 5 }, (_, index) => ({
  id: `message-${index + 1}`,
  characterId: "character-1",
  sender: index % 2 === 0 ? "user" : "character",
  content: `消息 ${index + 1}`,
  timestamp: index + 1,
})) as Message[];

assert.deepEqual(
  selectUnarchivedChatMessages(messages).map((message) => message.id),
  ["message-1", "message-2", "message-3", "message-4", "message-5"],
);
assert.deepEqual(
  selectUnarchivedChatMessages(messages, "message-2").map((message) => message.id),
  ["message-3", "message-4", "message-5"],
);
assert.deepEqual(
  selectUnarchivedChatMessages(messages, "missing-marker").map((message) => message.id),
  ["message-1", "message-2", "message-3", "message-4", "message-5"],
);
assert.deepEqual(
  selectUnarchivedChatMessages(messages, "message-2", [messages[4]]).map((message) => message.id),
  ["message-5"],
);
assert.deepEqual(
  splitChatArchiveBatches(messages, 2).map((batch) => batch.map((message) => message.id)),
  [["message-1", "message-2"], ["message-3", "message-4"], ["message-5"]],
);

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(appChat, /一键总结归档记忆/);
assert.doesNotMatch(appChat, /一键手动提炼归档当前对话/);
assert.equal(getChatArchiveBatchSize({summaryTriggerRound:20,historyMemoryLimit:10},true),20,"automatic batch size is in logical rounds, independent of the history window");
assert.equal(getChatArchiveBatchSize({summaryTriggerRound:20,historyMemoryLimit:150},true),20);
assert.equal(getChatArchiveBatchSize({summaryTriggerRound:20,historyMemoryLimit:150},false),150,"manual backlog processing retains its existing batch sizing");
const backlog=Array.from({length:80},(_,i)=>({...messages[0],id:`backlog-${i}`,sender:i%2===0?"user":"character"} as Message));
assert.deepEqual(splitChatArchiveTurnBatches(backlog,getChatArchiveBatchSize({summaryTriggerRound:20},true)).map(batch=>batch.length),[40,40]);

console.log("Chat memory archive scope: 5 acceptance checks passed");
