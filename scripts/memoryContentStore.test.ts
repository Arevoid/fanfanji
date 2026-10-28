import assert from "node:assert/strict";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { MemoryContentStore } from "../src/core/storage/memoryContentStore";
import { LEGACY_MEMORY_TRANSACTION_KEY } from "../src/core/storage/memoryContentKeys";
class Legacy implements Storage {
  values = new Map<string, string>();
  setCalls = 0;
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem() { this.setCalls++; throw new DOMException("full", "QuotaExceededError"); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}
const factory = new IDBFactory(), legacy = new Legacy();
const key = "phone_conversation_summaries", continuityKey = "phone_character_memory_continuity_v1";
const original = [{ id: "one", content: "a".repeat(4 * 1024 * 1024), relationId: "r1" }, { id: "two", content: "other", relationId: "r2" }];
legacy.values.set(key, JSON.stringify(original));
legacy.values.set(continuityKey, JSON.stringify({ impressions: [{ id: "one", statement: "subjective" }], version: 1, forgotten: [] }));
const store = new MemoryContentStore();
assert.equal((await store.initialize({ factory, legacy, writable: true })).success, true);
assert.equal(legacy.setCalls, 0, "full LocalStorage never needs another large checkpoint");
assert.equal(legacy.getItem(key), null);
assert.deepEqual(JSON.parse(store.read(key).value!), original);
const staged = store.stage({ [key]: JSON.stringify([{ ...original[0], content: "updated" }, original[1]]) });
assert.equal(staged.pending, true);
let touched = 0;
const originalPut = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function (...args) { if (this.name === "records") touched++; return originalPut.apply(this, args); };
try { assert.equal((await staged.durable!).success, true); } finally { IDBObjectStore.prototype.put = originalPut; }
assert.equal(touched, 1, "editing one item does not rewrite the other records");
store.close();
const reopened = new MemoryContentStore();
assert.equal((await reopened.initialize({ factory, legacy, writable: true })).success, true);
assert.equal(JSON.parse(reopened.read(key).value!)[0].content, "updated");
assert.equal(JSON.parse(reopened.read(key).value!)[1].relationId, "r2");
assert.equal(reopened.stage({ [key]: "invalid" }).success, false);
assert.equal((await reopened.flush()).success, true);
reopened.close();

for (const status of ["pending", "committed"]) {
  const source = new Legacy(), db = new IDBFactory();
  source.values.set(key, JSON.stringify([{ id: "new" }]));
  source.values.set(LEGACY_MEMORY_TRANSACTION_KEY, JSON.stringify({ version: 1, status, before: { [key]: JSON.stringify([{ id: "old" }]) } }));
  const recovered = new MemoryContentStore();
  assert.equal((await recovered.initialize({ factory: db, legacy: source, writable: true })).success, true);
  assert.equal(JSON.parse(recovered.read(key).value!)[0].id, status === "pending" ? "old" : "new");
  assert.equal(source.getItem(LEGACY_MEMORY_TRANSACTION_KEY), null);
  recovered.close();
}
const invalid = new Legacy(); invalid.values.set(key, "broken");
const rejected = new MemoryContentStore();
assert.equal((await rejected.initialize({ factory: new IDBFactory(), legacy: invalid, writable: true })).success, false);
assert.equal(invalid.getItem(key), "broken"); rejected.close();
const readOnlyLegacy = new Legacy(); readOnlyLegacy.values.set(key, "[]");
const readonly = new MemoryContentStore();
assert.equal((await readonly.initialize({ factory: new IDBFactory(), legacy: readOnlyLegacy, writable: false })).success, true);
assert.equal(readonly.stage({ [key]: "[]" }).success, false);
assert.equal(readOnlyLegacy.getItem(key), "[]"); readonly.close();
const interruptedLegacy = new Legacy(), interruptedFactory = new IDBFactory();
const many = Array.from({ length: 503 }, (_, i) => ({ id: `row-${i}`, content: `record ${i}`, relationId: "same-scope" }));
interruptedLegacy.values.set(key, JSON.stringify(many));
let checks = 0;
const interrupted = new MemoryContentStore();
assert.equal((await interrupted.initialize({ factory: interruptedFactory, legacy: interruptedLegacy, writable: true, canWrite: () => ++checks < 2 })).success, false);
assert.equal(interruptedLegacy.getItem(key), JSON.stringify(many), "interrupted copy never removes its source");
interrupted.close();
const resumed = new MemoryContentStore();
assert.equal((await resumed.initialize({ factory: interruptedFactory, legacy: interruptedLegacy, writable: true })).success, true);
assert.deepEqual(JSON.parse(resumed.read(key).value!), many, "resumption handles orphan rows without duplicates");
const database = (resumed as unknown as { db: IDBDatabase }).db;
const realTransaction = database.transaction.bind(database);
database.transaction = ((...args: Parameters<IDBDatabase["transaction"]>) => {
  const tx = realTransaction(...args); if (args[1] === "readwrite") queueMicrotask(() => tx.abort()); return tx;
}) as IDBDatabase["transaction"];
const failedWrite = resumed.stage({ [key]: JSON.stringify([{ id: "should-not-survive" }]), [continuityKey]: "{}" });
assert.equal((await failedWrite.durable!).success, false);
assert.equal(resumed.status.phase, "failed");
assert.equal(resumed.stage({ [key]: "[]" }).success, false, "failure cannot silently accept more edits");
resumed.close();
const afterFailure = new MemoryContentStore();
assert.equal((await afterFailure.initialize({ factory: interruptedFactory, legacy: interruptedLegacy, writable: true })).success, true);
assert.deepEqual(JSON.parse(afterFailure.read(key).value!), many, "aborted multi-key transaction preserves durable data");
afterFailure.close();
let permission = true;
const expiredReceipt = new MemoryContentStore();
assert.equal((await expiredReceipt.initialize({ factory: new IDBFactory(), legacy: new Legacy(), writable: true, canWrite: () => permission })).success, true);
const receiptDb = (expiredReceipt as unknown as { db: IDBDatabase }).db;
const receiptTransaction = receiptDb.transaction.bind(receiptDb);
receiptDb.transaction = ((...args: Parameters<IDBDatabase["transaction"]>) => {
  const tx = receiptTransaction(...args);
  if (args[1] === "readwrite" && Array.isArray(args[0]) && args[0].includes("records")) tx.addEventListener("complete", () => { permission = false; });
  return tx;
}) as IDBDatabase["transaction"];
const expired = expiredReceipt.stage({ [key]: "[]" });
assert.equal((await expired.durable!).success, false, "a resumed old writer cannot acknowledge a commit after losing permission");
expiredReceipt.close();
console.log("Memory content: full quota migration, restart, exact records, old transaction recovery, validation and readonly passed");
