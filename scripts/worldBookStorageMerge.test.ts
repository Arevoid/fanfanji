import assert from "node:assert/strict";
import { getLatestWorldBookEntries } from "../src/utils/worldBook";
import { loadWorldBookEntries } from "../src/core/storage/repositories/worldBookRepository";
import type { WorldBookEntry } from "../src/types";

const records = new Map<string, string>();
const localStorage: Storage = {
  get length() { return records.size; },
  clear: () => records.clear(),
  getItem: (key) => records.get(key) ?? null,
  key: (index) => [...records.keys()][index] ?? null,
  removeItem: (key) => { records.delete(key); },
  setItem: (key, value) => { records.set(key, value); },
};
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });

const entry = (id: string, timestamp: number, content = id): WorldBookEntry => ({
  id,
  title: id,
  category: "常规",
  content,
  timestamp,
  triggerType: "constant",
});

records.set("phone_worldbook_entries", JSON.stringify([
  entry("old", 5, "storage-old"),
  entry("stored-only", 20),
  { id: "malformed" },
]));

const props = [entry("old", 10, "memory-new"), entry("prop-only", 30)];
const latest = getLatestWorldBookEntries(props);
assert.deepEqual(latest.map((item) => item.id), ["old", "prop-only", "stored-only"]);
assert.equal(latest.find((item) => item.id === "old")?.content, "memory-new");
assert.equal(latest.find((item) => item.id === "stored-only")?.content, "stored-only");
assert.equal(latest.some((item) => item.id === "malformed"), false);

const loaded = loadWorldBookEntries(props);
assert.equal(loaded.valid, true);
assert.equal(loaded.value.some((item) => item.id === "malformed"), false);

console.log("PASS WorldBook storage merge keeps per-entry freshness and filters malformed records");
