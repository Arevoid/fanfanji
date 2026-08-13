import assert from "node:assert/strict";
import { loadReadingStore, saveReadingStore } from "../src/core/storage/repositories/readingRepository";
import { storageKeys } from "../src/core/storage/storageKeys";
import { READING_STORE_VERSION, type ReadingStore } from "../src/domain/reading/types";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage },
});

const store: ReadingStore = {
  version: READING_STORE_VERSION,
  books: [{
    id: "book-a",
    userIdentityId: "identity-a",
    assetId: "asset-a",
    contentHash: "hash-a",
    format: "markdown",
    status: "ready",
    title: "Local Only",
    sourceFileName: "local.md",
    sourceMimeType: "text/markdown",
    sourceEncoding: "utf-8",
    byteLength: 40,
    wordCount: 10,
    chapterCount: 0,
    createdAt: 1,
    updatedAt: 1,
  }],
  chapters: [],
  paragraphAnchors: [],
  progress: [],
  annotations: [],
  preferences: [],
  assetCleanupTasks: [],
};

assert.deepEqual(saveReadingStore(store), { success: true });
const serialized = localStorage.getItem(storageKeys.readingStore);
assert.ok(serialized);
assert.equal(serialized!.includes("Local Only"), true);
assert.equal(serialized!.includes("blob"), false, "raw book content must not enter localStorage");

const loaded = loadReadingStore();
assert.equal(loaded.valid, true);
assert.equal(loaded.value.books[0]?.userIdentityId, "identity-a");

localStorage.setItem(storageKeys.readingStore, "{not-json");
const invalid = loadReadingStore();
assert.equal(invalid.valid, false);
assert.equal(invalid.value.books.length, 0);
assert.equal(localStorage.getItem(storageKeys.readingStore), "{not-json", "invalid source data must remain untouched");

console.log("reading repository tests passed");
