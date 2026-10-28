import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { openMemoryWriterLease, updateMemoryWriterLease, MEMORY_WRITER_LEASE_MS } from "../src/core/storage/memoryWriterLease";

const factory = new IDBFactory();
const db = await openMemoryWriterLease(factory);
const now = Date.now();
const winners = await Promise.all(Array.from({ length: 12 }, (_, i) => updateMemoryWriterLease(db, `owner-${i}`, "acquire", now)));
assert.equal(winners.filter(Boolean).length, 1, "concurrent transactions elect exactly one writer");
const owner = `owner-${winners.findIndex(Boolean)}`;
assert.equal(await updateMemoryWriterLease(db, "outsider", "renew", now + 1), 0);
assert.equal(await updateMemoryWriterLease(db, owner, "renew", now + MEMORY_WRITER_LEASE_MS), 0, "expired page cannot renew stale snapshots");
assert.ok(await updateMemoryWriterLease(db, "replacement", "acquire", now + MEMORY_WRITER_LEASE_MS));
await updateMemoryWriterLease(db, owner, "release");
assert.equal(await updateMemoryWriterLease(db, "third", "acquire", now + MEMORY_WRITER_LEASE_MS + 1), 0, "stale release cannot remove replacement");
await updateMemoryWriterLease(db, "replacement", "release");
db.close();

Object.defineProperty(globalThis, "indexedDB", { value: factory, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
Object.defineProperty(globalThis, "document", { value: {}, configurable: true });
let moduleNumber = 0;
const modules: Array<{ api: any; window: EventTarget }> = [];
async function page() {
  const window = new EventTarget();
  Object.defineProperty(globalThis, "window", { value: window, configurable: true });
  const api = await import(new URL(`../src/core/storage/memoryWriterCoordination.ts?compat=${++moduleNumber}`, import.meta.url).href);
  const result = { api, window };
  modules.push(result);
  return result;
}
try {
  const first = await page();
  assert.equal(await first.api.initializeMemoryWriterCoordination(), "writer", "no Web Locks: single page can write");
  assert.equal(first.api.canWriteMemoryStorage("phone_messages"), true);
  const second = await page();
  assert.equal(await second.api.initializeMemoryWriterCoordination(), "writer", "each page can attempt guarded saves");
  assert.equal(second.api.canWriteMemoryStorage("phone_messages"), true);
  first.window.dispatchEvent(new Event("pagehide"));
  await new Promise(resolve => setTimeout(resolve, 20));
  const third = await page();
  assert.equal(await third.api.initializeMemoryWriterCoordination(), "writer", "fresh page takes over released lease");
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + MEMORY_WRITER_LEASE_MS + 1;
    assert.equal(third.api.canWriteMemoryStorage("phone_messages"), true, "background pause cannot expire page write access");
    assert.equal(third.api.getMemoryWriterState(), "writer");
  } finally { Date.now = originalNow; }
  await new Promise(resolve => setTimeout(resolve, 20));
  Object.defineProperty(globalThis, "navigator", { value: { locks: { request: () => { throw new Error("not supported"); } } }, configurable: true });
  const rejectedNative = await page();
  assert.equal(await rejectedNative.api.initializeMemoryWriterCoordination(), "writer", "exposed but rejected native API safely falls back");
  rejectedNative.window.dispatchEvent(new Event("pagehide"));
  await new Promise(resolve => setTimeout(resolve, 20));
  Object.defineProperty(globalThis, "navigator", { value: { locks: { request: async (_name: string, _options: unknown, callback: (lock: object) => Promise<void>) => callback({}) } }, configurable: true });
  const native = await page();
  assert.equal(await native.api.initializeMemoryWriterCoordination(), "writer");
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
  const mixed = await page();
  assert.equal(await mixed.api.initializeMemoryWriterCoordination(), "writer", "native and non-native clients both use per-save protection");
  native.window.dispatchEvent(new Event("pagehide"));
  await new Promise(resolve => setTimeout(resolve, 20));
  Object.defineProperty(globalThis, "indexedDB", { value: { open() { throw new Error("storage denied"); } }, configurable: true });
  const denied = await page();
  assert.equal(await denied.api.initializeMemoryWriterCoordination(), "unsupported");
  assert.equal(denied.api.canWriteMemoryStorage("phone_messages"), false);
} finally {
  for (const item of modules) item.window.dispatchEvent(new Event("pagehide"));
}
console.log("Memory writer compatibility: legacy lease tests retained; pages no longer elect or expire writers, unavailable storage still fails safely");
