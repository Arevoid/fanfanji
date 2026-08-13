import assert from "node:assert/strict";
import { createEmptyReadingStore, type ReadingBook, type ReadingBookAsset, type ReadingStore } from "../src/domain/reading/types";
import {
  deleteReadingBook,
  ensureReadingBookParsed,
  retryReadingAssetCleanup,
  setReadingBookArchived,
  updateReadingBookDetails,
  updateReadingBookCover,
  type ReadingLibraryDependencies,
} from "../src/features/reading/library/readingLibrary";

const makeBook = (userIdentityId: string, assetId: string): ReadingBook => ({
  id: "shared-book-id",
  userIdentityId,
  assetId,
  contentHash: `hash-${userIdentityId}`,
  format: "txt",
  status: "ready",
  title: `Book ${userIdentityId}`,
  sourceFileName: "source.txt",
  sourceMimeType: "text/plain",
  sourceEncoding: "utf-8",
  byteLength: 20,
  wordCount: 10,
  chapterCount: 0,
  createdAt: 1,
  updatedAt: 1,
});

let store: ReadingStore = {
  ...createEmptyReadingStore(),
  books: [makeBook("identity-a", "asset-a"), makeBook("identity-b", "asset-b")],
};
const assets = new Map<string, ReadingBookAsset>([
  ["asset-a", { assetId: "asset-a", userIdentityId: "identity-a", bookId: "shared-book-id", contentHash: "hash-a", mimeType: "text/plain", byteLength: 20, blob: new Blob(["第一章 开始\nA 的正文。"]), createdAt: 1 }],
  ["asset-b", { assetId: "asset-b", userIdentityId: "identity-b", bookId: "shared-book-id", contentHash: "hash-b", mimeType: "text/plain", byteLength: 20, blob: new Blob(["第一章 开始\nB 的正文。"]), createdAt: 1 }],
]);
let now = 10;
let deleteShouldFail = false;
const dependencies: ReadingLibraryDependencies = {
  loadStore: () => ({ value: store, found: true, valid: true }),
  saveStore: (next) => { store = next; return { success: true }; },
  assetStore: {
    load: async (assetId, userIdentityId, bookId) => {
      const asset = assets.get(assetId);
      return asset?.userIdentityId === userIdentityId && asset.bookId === bookId ? asset : null;
    },
    delete: async (assetId, userIdentityId, bookId) => {
      if (deleteShouldFail) throw new Error("blocked");
      const asset = assets.get(assetId);
      if (!asset || asset.userIdentityId !== userIdentityId || asset.bookId !== bookId) return false;
      return assets.delete(assetId);
    },
  },
  now: () => ++now,
  createId: (prefix) => `${prefix}-${now}`,
};

const parsedA = await ensureReadingBookParsed("identity-a", "shared-book-id", dependencies);
assert.equal(parsedA.chapterCount, 1);
assert.equal(store.chapters.length, 1);
assert.equal(store.chapters[0]?.userIdentityId, "identity-a");
assert.equal(store.books.find((book) => book.userIdentityId === "identity-b")?.chapterCount, 0, "parsing A never advances B");

const renamedA = updateReadingBookDetails({ userIdentityId: "identity-a", bookId: "shared-book-id", title: "A 新书名", author: "作者 A" }, dependencies);
assert.equal(renamedA.title, "A 新书名");
assert.equal(store.books.find((book) => book.userIdentityId === "identity-b")?.title, "Book identity-b", "editing A never edits B");
const coveredA = updateReadingBookCover({ userIdentityId: "identity-a", bookId: "shared-book-id", coverUrl: "data:image/png;base64,AAAA" }, dependencies);
assert.match(coveredA.coverUrl || "", /^data:image\/png/);
assert.equal(store.books.find((book) => book.userIdentityId === "identity-b")?.coverUrl, undefined, "cover update stays in the current identity");
assert.throws(() => updateReadingBookCover({ userIdentityId: "identity-a", bookId: "shared-book-id", coverUrl: "https://example.com/cover.png" }, dependencies), /本地图片/);

setReadingBookArchived("identity-a", "shared-book-id", true, dependencies);
assert.equal(store.books.find((book) => book.userIdentityId === "identity-a")?.status, "archived");
assert.equal(store.chapters.length, 1, "archive keeps chapters and正文");
setReadingBookArchived("identity-a", "shared-book-id", false, dependencies);
assert.equal(store.books.find((book) => book.userIdentityId === "identity-a")?.status, "ready");

deleteShouldFail = true;
const pending = await deleteReadingBook("identity-a", "shared-book-id", dependencies);
assert.equal(pending.status, "cleanup-pending");
assert.equal(store.books.some((book) => book.userIdentityId === "identity-a"), false);
assert.equal(store.books.some((book) => book.userIdentityId === "identity-b"), true, "delete A keeps same-ID book B");
assert.equal(store.chapters.length, 0, "delete removes scoped derived data");
assert.equal(store.assetCleanupTasks.length, 1);
assert.equal(assets.has("asset-a"), true);
assert.equal(assets.has("asset-b"), true);

deleteShouldFail = false;
await retryReadingAssetCleanup("identity-a", dependencies);
assert.equal(store.assetCleanupTasks.length, 0);
assert.equal(assets.has("asset-a"), false);
assert.equal(assets.has("asset-b"), true, "cleanup uses the full identity and book scope");

let unsafeAssetDeleteCalled = false;
const protectedStore: ReadingStore = { ...createEmptyReadingStore(), books: [makeBook("identity-a", "protected-asset")] };
const failingMetadataDependencies: ReadingLibraryDependencies = {
  ...dependencies,
  loadStore: () => ({ value: protectedStore, found: true, valid: true }),
  saveStore: () => ({ success: false, error: "quota" }),
  assetStore: {
    load: async () => null,
    delete: async () => { unsafeAssetDeleteCalled = true; return true; },
  },
};
await assert.rejects(
  deleteReadingBook("identity-a", "shared-book-id", failingMetadataDependencies),
  (error) => error instanceof Error && error.name === "ReadingLibraryError",
);
assert.equal(unsafeAssetDeleteCalled, false, "Blob deletion never starts before metadata removal is committed");

console.log("reading library management tests passed");
