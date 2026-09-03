import assert from "node:assert/strict";
import { File } from "node:buffer";
import { indexedDB } from "fake-indexeddb";
import { storageKeys } from "../src/core/storage/storageKeys";
import { READING_STORE_VERSION, type ReadingStore } from "../src/domain/reading/types";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  failWrites = false;
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    this.data.set(key, value);
  }
}

const localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDB });
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });

const legacyStore: ReadingStore = {
  version: READING_STORE_VERSION,
  books: [{
    id: "book-a",
    userIdentityId: "identity-a",
    assetId: "asset-a",
    contentHash: "hash-a",
    format: "txt",
    status: "ready",
    title: "Migrated book",
    sourceFileName: "book.txt",
    sourceMimeType: "text/plain",
    sourceEncoding: "utf-8",
    byteLength: 100,
    wordCount: 20,
    chapterCount: 1,
    createdAt: 1,
    updatedAt: 1,
  }],
  chapters: [{ id: "chapter-a", userIdentityId: "identity-a", bookId: "book-a", order: 0, title: "Chapter", wordCount: 20 }],
  paragraphAnchors: [],
  progress: [],
  annotations: [],
  preferences: [],
  assetCleanupTasks: [],
};

localStorage.setItem(storageKeys.readingStore, JSON.stringify(legacyStore));

const { initializeReadingStore, loadReadingStore, saveReadingStoreDurably } = await import("../src/core/storage/repositories/readingRepository");
const { readingAssetDb } = await import("../src/core/storage/readingAssetDb");

const initialized = await initializeReadingStore();
assert.equal(initialized.value.books[0]?.title, "Migrated book");
assert.equal(localStorage.getItem(storageKeys.readingStore), null, "successful migration releases the legacy localStorage payload");
assert.equal((await readingAssetDb.loadMetadata())?.books[0]?.id, "book-a");
localStorage.failWrites = true;

const expanded: ReadingStore = {
  ...loadReadingStore().value,
  paragraphAnchors: Array.from({ length: 5_000 }, (_, index) => ({
    id: `anchor-${index}`,
    userIdentityId: "identity-a",
    bookId: "book-a",
    chapterId: "chapter-a",
    ordinal: index,
    normalizedTextHash: `hash-${index}`,
    characterStart: index * 10,
    characterEnd: index * 10 + 10,
  })),
};

assert.deepEqual(await saveReadingStoreDurably(expanded), { success: true });
assert.equal(localStorage.getItem(storageKeys.readingStore), null, "large reading indexes must never return to localStorage");
assert.equal((await readingAssetDb.loadMetadata())?.paragraphAnchors.length, 5_000);

const { importReadingFile } = await import("../src/features/reading/import/readingImport");
const imported = await importReadingFile(
  new File(["第一章\n\n新的故事正文。"], "quota-browser.txt", { type: "text/plain" }),
  "identity-a",
);
assert.equal(imported.status, "imported", "imports must succeed when localStorage rejects every write");
assert.equal((await readingAssetDb.loadMetadata())?.books.length, 2);

const { flushReadingCoStoryStore, initializeReadingCoStoryStore } = await import("../src/core/storage/repositories/readingCoStoryRepository");
const { createReadingCoStory, createReadingCoStoryOpening } = await import("../src/features/reading/story/readingCoStory");
await initializeReadingCoStoryStore();
const world = createReadingCoStory({
  scope: { userIdentityId: "identity-a", coStoryId: "world-quota", relationId: "relation-a", characterId: "character-a" },
  origin: "custom",
  title: "Quota-safe world",
  worldDefinition: { genre: "Mystery", worldView: "A local-first world", synopsis: "Two people investigate a sealed room" },
  length: "short",
  userCharacterName: "User",
  aiFriend: { relationId: "relation-a", characterId: "character-a", displayName: "Friend", characterName: "Friend", personaSummary: "Careful", knownIntel: [], knownTurnIds: [] },
});
createReadingCoStoryOpening({ scope: world, narrative: "The door opens.", choices: [{ id: "enter", label: "Enter" }] });
assert.deepEqual(await flushReadingCoStoryStore(), { success: true }, "custom worlds must persist without localStorage");
assert.equal(localStorage.getItem(storageKeys.readingCoStoryStore), null);
assert.equal((await readingAssetDb.loadMetadataValue<{ stories: unknown[] }>("reading-co-story-store"))?.stories.length, 1);

console.log("reading IndexedDB metadata tests passed");
