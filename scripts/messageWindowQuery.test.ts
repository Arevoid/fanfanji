import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import type { Message } from "../src/types";
import { messageEntryDb } from "../src/core/storage/messageEntryDb";

const makeMessage = (id: string, characterId: string, conversationId: string): Message => ({
  id, characterId, conversationId, sender: "user", content: id, timestamp: Number(id.replace(/\D/g, "")),
});

const messages = [
  makeMessage("m1", "c1", "chat-1"),
  makeMessage("m2", "c2", "chat-1"),
  makeMessage("m3", "c1", "chat-1"),
  makeMessage("m4", "c1", "chat-2"),
];
await messageEntryDb.replaceAll(messages);
assert.deepEqual((await messageEntryDb.loadWindow({ conversationId: "chat-1", limit: 2 })).map((message) => message.id), ["m1", "m2"]);
assert.deepEqual((await messageEntryDb.loadWindow({ characterId: "c1", offset: 1, limit: 2 })).map((message) => message.id), ["m3", "m4"]);
assert.deepEqual(await messageEntryDb.loadWindow({ conversationId: "missing", limit: 3 }), []);
console.log("message entry window query tests passed");
