import assert from "node:assert/strict";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { messageEntryDb, MESSAGE_ENTRY_DB_NAME, MESSAGE_ENTRY_STORE_NAME } from "../src/core/storage/messageEntryDb";
import type { Message } from "../src/types";
Object.assign(globalThis, { indexedDB, IDBKeyRange });
const rows: Message[] = Array.from({ length: 120 }, (_, i) => ({ id: `m${String(i).padStart(4, "0")}`, characterId: "c", relationId: "r", conversationId: "v", sender: "user", timestamp: Math.floor(i / 3), content: `消息${i}` }));
// Create a genuine v2 database: opening v3 must index existing content, not
// replace or partially copy it into a second durable message store.
await new Promise<void>((resolve, reject) => {
  const request = indexedDB.open(MESSAGE_ENTRY_DB_NAME, 2);
  request.onupgradeneeded = () => {
    const store = request.result.createObjectStore(MESSAGE_ENTRY_STORE_NAME, { keyPath: "recordId" });
    for (const key of ["characterId", "relationId", "conversationId", "timestamp", "position"]) store.createIndex(`by${key[0].toUpperCase()}${key.slice(1)}`, key);
    rows.forEach((message, position) => store.put({ recordId: `${message.id}::${position}`, position, ...message, message }));
  };
  request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
});
assert.deepEqual(await messageEntryDb.loadAll(), rows);
const first = await messageEntryDb.loadPage({ characterId: "c", relationId: "r", conversationId: "v", limit: 50 });
assert.deepEqual(first.items.map(row => row.id), rows.slice(-50).map(row => row.id));
assert.equal(first.hasEarlier, true);
await messageEntryDb.saveSnapshot([...rows.slice(1), { ...rows[119], id: "new", timestamp: 999 }, { ...rows[0], id: "secret", relationId: "other", timestamp: 1000 }]);
const second = await messageEntryDb.loadPage({ characterId: "c", relationId: "r", conversationId: "v", before: first.cursor, limit: 50 });
assert.deepEqual(second.items.map(row => row.id), rows.slice(20, 70).map(row => row.id));
assert.equal(second.items.some(row => first.items.some(original => original.id === row.id)), false);
const last = await messageEntryDb.loadPage({ characterId: "c", relationId: "r", before: second.cursor, limit: 50 });
assert.deepEqual(last.items.map(row => row.id), rows.slice(1, 20).map(row => row.id));
assert.equal(last.hasEarlier, false);
assert.deepEqual((await messageEntryDb.loadPage({ characterId: "c", relationId: "other", limit: 50 })).items.map(row => row.id), ["secret"]);
assert.equal((await messageEntryDb.loadPage({ characterId: "missing", limit: 50 })).items.length, 0);
console.log("PASS v2 in-place index upgrade, complete source preservation, relation-scoped stable cursor pages after append/delete and equal timestamps");
