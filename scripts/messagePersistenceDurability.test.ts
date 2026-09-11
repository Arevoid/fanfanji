import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { readingAssetDb } from "../src/core/storage/readingAssetDb";
import { flushMessages, loadMessageWindow, saveMessages } from "../src/core/storage/repositories/messageRepository";

const values = new Map<string, string>();
const localStorage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
};
Object.assign(globalThis, { indexedDB, localStorage, window: { localStorage } });

const scope = {
  characterId: "character-1",
  relationId: "relation-1",
  conversationId: "conversation-1",
  userIdentityId: "identity-1",
};
const userMessage = {
  id: "user-1",
  ...scope,
  sender: "user" as const,
  content: "test user message",
  timestamp: 1,
};
const assistantMessage = {
  id: "assistant-1",
  ...scope,
  sender: "character" as const,
  content: "test assistant message",
  timestamp: 2,
};

saveMessages([userMessage]);
const firstFlush = flushMessages();
await firstFlush;
assert.deepEqual(await readingAssetDb.loadMetadataValue("messages-v4"), [userMessage], "flush waits for the first IndexedDB snapshot");

saveMessages([userMessage, assistantMessage]);
await flushMessages();
assert.deepEqual(await readingAssetDb.loadMetadataValue("messages-v4"), [userMessage, assistantMessage], "the latest snapshot wins without an empty overwrite");

const exactWindow = await loadMessageWindow({ ...scope, limit: 10 });
assert.deepEqual(exactWindow.map((message) => message.id), ["user-1", "assistant-1"], "exact scope reads both persisted sides");
assert.equal(exactWindow.every((message) => message.characterId === scope.characterId
  && message.relationId === scope.relationId
  && message.conversationId === scope.conversationId), true);

// A fresh module instance models a reload without adding a production reset API.
const freshRepository = await import(`../src/core/storage/repositories/messageRepository.ts?reload=${Date.now()}`);
const reloaded = await freshRepository.initializeMessages([]);
assert.deepEqual(reloaded.value.map((message) => message.id), ["user-1", "assistant-1"], "reload hydration reads the durable snapshot");
assert.deepEqual((await freshRepository.loadMessageWindow({ ...scope, limit: 10 })).map((message) => message.id), ["user-1", "assistant-1"]);

console.log("Message durability contract passed: awaited flush, latest snapshot, reload hydration, and exact scope");
