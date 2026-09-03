import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { loadMessages, initializeMessages, saveMessages, flushMessages } from "../src/core/storage/repositories/messageRepository";
import { enableMessageEntryStore } from "../src/core/storage/contentStorageFlags";
import { messageEntryDb } from "../src/core/storage/messageEntryDb";

const values = new Map<string, string>();
const localStorage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
};
Object.assign(globalThis, { indexedDB, localStorage, window: { localStorage } });

const legacy = { id: "legacy", characterId: "character", sender: "user" as const, content: "旧路径不应被读取", timestamp: 1 };
values.set("phone_messages_v3", JSON.stringify([legacy]));
assert.equal(enableMessageEntryStore().success, true);
assert.deepEqual(loadMessages([]).value, [], "entry-store mode must not synchronously reread the legacy snapshot");

const current = { id: "current", characterId: "character", sender: "character" as const, content: "新路径", timestamp: 2 };
await messageEntryDb.replaceAll([current]);
assert.deepEqual((await initializeMessages([])).value, [current]);
const next = { id: "next", characterId: "character", sender: "user" as const, content: "继续", timestamp: 3 };
saveMessages([current, next]);
await flushMessages();
assert.deepEqual(await messageEntryDb.loadAll(), [current, next]);
console.log("PASS message repository switches to entry storage without rereading legacy messages");

