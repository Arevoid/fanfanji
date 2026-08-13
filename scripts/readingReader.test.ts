import assert from "node:assert/strict";
import { createEmptyReadingStore, type ReadingBook, type ReadingBookAsset, type ReadingStore } from "../src/domain/reading/types";
import {
  calculateReadingPercent,
  getReadingProgress,
  loadReadingBookContent,
  ReadingReaderError,
  saveReadingProgress,
  type ReadingReaderDependencies,
} from "../src/features/reading/reader/readingReader";

const makeBook = (userIdentityId: string, assetId: string): ReadingBook => ({
  id: "same-book",
  userIdentityId,
  assetId,
  contentHash: `hash-${userIdentityId}`,
  format: "txt",
  status: "ready",
  title: `Book ${userIdentityId}`,
  sourceFileName: "book.txt",
  sourceMimeType: "text/plain",
  sourceEncoding: "utf-8",
  byteLength: 12,
  wordCount: 8,
  chapterCount: 1,
  createdAt: 1,
  updatedAt: 1,
});

let store: ReadingStore = {
  ...createEmptyReadingStore(),
  books: [makeBook("identity-a", "asset-a"), makeBook("identity-b", "asset-b")],
  chapters: [
    { id: "chapter-a", userIdentityId: "identity-a", bookId: "same-book", order: 0, title: "A 章", firstParagraphAnchorId: "anchor-a", lastParagraphAnchorId: "anchor-a", wordCount: 8 },
    { id: "chapter-b", userIdentityId: "identity-b", bookId: "same-book", order: 0, title: "B 章", firstParagraphAnchorId: "anchor-b", lastParagraphAnchorId: "anchor-b", wordCount: 8 },
  ],
  paragraphAnchors: [
    { id: "anchor-a", userIdentityId: "identity-a", bookId: "same-book", chapterId: "chapter-a", ordinal: 0, normalizedTextHash: "hash-a", characterStart: 3, characterEnd: 10 },
    { id: "anchor-b", userIdentityId: "identity-b", bookId: "same-book", chapterId: "chapter-b", ordinal: 0, normalizedTextHash: "hash-b", characterStart: 3, characterEnd: 10 },
  ],
  progress: [{ userIdentityId: "identity-b", bookId: "same-book", chapterId: "chapter-b", paragraphAnchorId: "anchor-b", characterOffset: 2, percent: 50, updatedAt: 3 }],
};
const assets = new Map<string, ReadingBookAsset>([
  ["asset-a", { assetId: "asset-a", userIdentityId: "identity-a", bookId: "same-book", contentHash: "hash-a", mimeType: "text/plain", byteLength: 12, blob: new Blob(["标题\nA 的正文内容"]), createdAt: 1 }],
  ["asset-b", { assetId: "asset-b", userIdentityId: "identity-b", bookId: "same-book", contentHash: "hash-b", mimeType: "text/plain", byteLength: 12, blob: new Blob(["标题\nB 的正文内容"]), createdAt: 1 }],
]);
let now = 10;
const dependencies: ReadingReaderDependencies = {
  loadStore: () => ({ value: store, found: true, valid: true }),
  saveStore: (next) => { store = next; return { success: true }; },
  assetStore: {
    load: async (assetId, userIdentityId, bookId) => {
      const asset = assets.get(assetId);
      return asset?.userIdentityId === userIdentityId && asset.bookId === bookId ? asset : null;
    },
  },
  now: () => ++now,
};

const contentA = await loadReadingBookContent("identity-a", "same-book", dependencies);
assert.equal(contentA.book.userIdentityId, "identity-a");
assert.equal(contentA.chapters.length, 1);
assert.match(contentA.chapters[0]?.paragraphs[0]?.text || "", /A 的正文/);
assert.doesNotMatch(contentA.chapters[0]?.paragraphs[0]?.text || "", /B 的正文/);
assert.equal(contentA.sourceCharacterLength, 7, "headings and separators do not inflate readable progress");

const savedA = saveReadingProgress({
  userIdentityId: "identity-a",
  bookId: "same-book",
  chapterId: "chapter-a",
  paragraphAnchorId: "anchor-a",
  characterOffset: 3,
  scrollOffsetHint: -10,
  sourceCharacterLength: contentA.sourceCharacterLength,
}, dependencies);
assert.equal(savedA.percent, 42.86);
assert.equal(store.progress.length, 2, "same book ID keeps one independent progress row per identity");
assert.equal(getReadingProgress("identity-b", "same-book", dependencies)?.percent, 50, "saving A never replaces B progress");
assert.equal(getReadingProgress("identity-a", "same-book", dependencies)?.paragraphAnchorId, "anchor-a");
assert.equal(store.books.find((book) => book.userIdentityId === "identity-b")?.updatedAt, 1, "reading A never changes B recency");

assert.equal(calculateReadingPercent(7, 0, 7), 100);
assert.throws(
  () => saveReadingProgress({ userIdentityId: "identity-a", bookId: "same-book", chapterId: "chapter-b", paragraphAnchorId: "anchor-b", characterOffset: 1, sourceCharacterLength: 12 }, dependencies),
  (error) => error instanceof ReadingReaderError && error.code === "invalid-position",
);

const progressBeforeFailedSave = store.progress.map((item) => ({ ...item }));
const failingSaveDependencies: ReadingReaderDependencies = {
  ...dependencies,
  saveStore: () => ({ success: false, error: "quota" }),
};
assert.throws(
  () => saveReadingProgress({ userIdentityId: "identity-a", bookId: "same-book", chapterId: "chapter-a", paragraphAnchorId: "anchor-a", characterOffset: 5, sourceCharacterLength: 7 }, failingSaveDependencies),
  (error) => error instanceof ReadingReaderError && error.code === "save-failed",
);
assert.deepEqual(store.progress, progressBeforeFailedSave, "failed persistence never reports or mutates a newer reading position");

const unavailableDependencies: ReadingReaderDependencies = {
  ...dependencies,
  loadStore: () => ({ value: createEmptyReadingStore(), found: true, valid: false, error: "parse" }),
};
await assert.rejects(
  loadReadingBookContent("identity-a", "same-book", unavailableDependencies),
  (error) => error instanceof ReadingReaderError && error.code === "store-unavailable",
);

console.log("reading content and progress isolation tests passed");
