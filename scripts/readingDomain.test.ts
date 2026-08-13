import assert from "node:assert/strict";
import { normalizeReadingStore } from "../src/domain/reading/normalization";
import {
  filterByPersonalReadingScope,
  filterByReadingRoomScope,
  isSamePersonalReadingScope,
  isSameReadingRoomScope,
} from "../src/domain/reading/scope";
import { READING_STORE_VERSION, type ReadingStore } from "../src/domain/reading/types";

const personalA = { userIdentityId: "identity-a", bookId: "book-shared" };
const personalB = { userIdentityId: "identity-b", bookId: "book-shared" };
assert.equal(isSamePersonalReadingScope(personalA, personalA), true);
assert.equal(isSamePersonalReadingScope(personalA, personalB), false);

const progress = [
  { ...personalA, marker: "a" },
  { ...personalB, marker: "b" },
];
assert.deepEqual(filterByPersonalReadingScope(progress, personalA).map((item) => item.marker), ["a"]);

const roomA = {
  ...personalA,
  readingRoomId: "room-a",
  relationId: "relation-a",
  characterId: "same-character",
  conversationId: "conversation-a",
};
const roomB = {
  ...personalA,
  readingRoomId: "room-b",
  relationId: "relation-b",
  characterId: "same-character",
  conversationId: "conversation-b",
};
const wrongConversation = { ...roomA, conversationId: "conversation-other" };

assert.equal(isSameReadingRoomScope(roomA, roomB), false, "same book/character must not merge rooms");
assert.equal(isSameReadingRoomScope(roomA, wrongConversation), false, "conversation is part of the boundary");
assert.deepEqual(
  filterByReadingRoomScope([{ ...roomA, value: "a" }, { ...roomB, value: "b" }], roomA).map((item) => item.value),
  ["a"],
);

const validStore: ReadingStore = {
  version: READING_STORE_VERSION,
  books: [{
    id: "book-shared",
    userIdentityId: "identity-a",
    assetId: "asset-a",
    contentHash: "hash-a",
    format: "txt",
    status: "ready",
    title: "Test Book",
    sourceFileName: "test.txt",
    sourceMimeType: "text/plain",
    sourceEncoding: "utf-8",
    byteLength: 100,
    wordCount: 20,
    chapterCount: 1,
    createdAt: 1,
    updatedAt: 1,
  }],
  chapters: [{
    id: "chapter-a",
    userIdentityId: "identity-a",
    bookId: "book-shared",
    order: 0,
    title: "Chapter 1",
    firstParagraphAnchorId: "anchor-a",
    lastParagraphAnchorId: "anchor-a",
    wordCount: 20,
  }],
  paragraphAnchors: [{
    id: "anchor-a",
    userIdentityId: "identity-a",
    bookId: "book-shared",
    chapterId: "chapter-a",
    ordinal: 0,
    normalizedTextHash: "paragraph-hash",
    characterStart: 0,
    characterEnd: 20,
  }],
  progress: [{
    userIdentityId: "identity-a",
    bookId: "book-shared",
    chapterId: "chapter-a",
    paragraphAnchorId: "anchor-a",
    characterOffset: 4,
    percent: 25,
    updatedAt: 2,
  }],
  annotations: [{
    id: "annotation-a",
    userIdentityId: "identity-a",
    bookId: "book-shared",
    chapterId: "chapter-a",
    paragraphAnchorId: "anchor-a",
    kind: "highlight",
    range: { start: 0, end: 4 },
    textSnapshot: "Test",
    createdAt: 2,
    updatedAt: 2,
  }],
  preferences: [{
    userIdentityId: "identity-a",
    bookId: "book-shared",
    fontAssetId: "global-font-asset",
    fontSize: 18,
    updatedAt: 2,
  }],
  assetCleanupTasks: [],
};

const dirty = {
  ...validStore,
  books: [...validStore.books, { ...validStore.books[0], id: "", userIdentityId: "identity-b" }],
  progress: [
    ...validStore.progress,
    { ...validStore.progress[0], userIdentityId: "identity-b" },
    { ...validStore.progress[0], paragraphAnchorId: "missing-anchor" },
  ],
  annotations: [
    ...validStore.annotations,
    { ...validStore.annotations[0], id: "wrong-owner", userIdentityId: "identity-b" },
  ],
};

const normalized = normalizeReadingStore(dirty);
assert.equal(normalized.books.length, 1);
assert.equal(normalized.progress.length, 1, "orphan and cross-identity progress must be rejected");
assert.equal(normalized.annotations.length, 1, "cross-identity annotations must be rejected");
assert.equal(normalized.preferences[0]?.fontAssetId, "global-font-asset", "preferences store only a font asset reference");

const withCleanupTasks = normalizeReadingStore({
  ...validStore,
  assetCleanupTasks: [
    { id: "cleanup-a", assetId: "deleted-asset", userIdentityId: "identity-a", bookId: "deleted-book", createdAt: 3 },
    { id: "", assetId: "invalid", userIdentityId: "identity-a", bookId: "deleted-book", createdAt: 3 },
  ],
});
assert.equal(withCleanupTasks.assetCleanupTasks.length, 1, "valid cleanup tasks survive without a live book record");

const wrongVersion = normalizeReadingStore({ ...validStore, version: 99 });
assert.equal(wrongVersion.books.length, 0, "unknown versions require an explicit migration");

console.log("reading domain isolation tests passed");
