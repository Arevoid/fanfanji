import assert from "node:assert/strict";
import { createEmptyReadingStore, type ReadingStore } from "../src/domain/reading/types";
import {
  createReadingAnnotation,
  deleteReadingAnnotation,
  getReadingAnnotations,
  getReadingBookPreferences,
  saveReadingBookPreferences,
  searchReadingContent,
  toggleReadingBookmark,
  type ReadingToolDependencies,
} from "../src/features/reading/tools/readingTools";
import type { ReadingBookContent } from "../src/features/reading/reader/readingReader";

let store: ReadingStore = {
  ...createEmptyReadingStore(),
  books: [{ id: "book", userIdentityId: "identity-a", assetId: "asset", contentHash: "hash", format: "txt", status: "ready", title: "测试", sourceFileName: "a.txt", sourceMimeType: "text/plain", sourceEncoding: "utf-8", byteLength: 10, wordCount: 8, chapterCount: 1, createdAt: 1, updatedAt: 1 }],
  chapters: [{ id: "chapter", userIdentityId: "identity-a", bookId: "book", order: 0, title: "第一章", firstParagraphAnchorId: "anchor", lastParagraphAnchorId: "anchor", wordCount: 8 }],
  paragraphAnchors: [{ id: "anchor", userIdentityId: "identity-a", bookId: "book", chapterId: "chapter", ordinal: 0, normalizedTextHash: "hash", characterStart: 0, characterEnd: 8 }],
};
let id = 0;
const dependencies: ReadingToolDependencies = {
  loadStore: () => ({ value: store, found: true, valid: true }),
  saveStore: (next) => { store = next; return { success: true }; },
  now: () => 100 + id,
  createId: (prefix) => `${prefix}-${++id}`,
};
const paragraph = { anchor: store.paragraphAnchors[0]!, text: "今天下雨了吗" };

assert.equal(getReadingBookPreferences("identity-a", "book", dependencies).fontSize, 18);
const preference = saveReadingBookPreferences({ userIdentityId: "identity-a", bookId: "book", fontAssetId: "global-custom-font", fontSize: 99, lineHeight: 1, paragraphSpacing: 100, letterSpacing: -1, pageMargin: 2, firstLineIndent: 9, textAlign: "left", updatedAt: 0 }, dependencies);
assert.equal(preference.fontSize, 30);
assert.equal(preference.lineHeight, 1.4);
assert.equal(preference.paragraphSpacing, 40);
assert.equal(preference.letterSpacing, 0);
assert.equal(preference.pageMargin, 12);
assert.equal(preference.firstLineIndent, 3);
assert.equal(preference.fontAssetId, "global-custom-font", "book preferences only reference the global asset ID");

const highlight = createReadingAnnotation({ userIdentityId: "identity-a", bookId: "book", chapterId: "chapter", paragraph, kind: "highlight", start: 2, end: 4 }, dependencies);
assert.deepEqual(highlight.range, { start: 2, end: 4 });
assert.equal(highlight.textSnapshot, "下雨");
const note = createReadingAnnotation({ userIdentityId: "identity-a", bookId: "book", chapterId: "chapter", paragraph, kind: "note", start: 2, end: 4, note: "天气变化" }, dependencies);
assert.equal(note.note, "天气变化");
assert.equal(toggleReadingBookmark({ userIdentityId: "identity-a", bookId: "book", chapterId: "chapter", paragraph }, dependencies).active, true);
assert.equal(toggleReadingBookmark({ userIdentityId: "identity-a", bookId: "book", chapterId: "chapter", paragraph }, dependencies).active, false);
assert.equal(getReadingAnnotations("identity-b", "book", dependencies).length, 0, "annotations never cross identities");
deleteReadingAnnotation("identity-b", highlight.id, dependencies);
assert.equal(getReadingAnnotations("identity-a", "book", dependencies).some((item) => item.id === highlight.id), true, "other identities cannot delete annotations");
deleteReadingAnnotation("identity-a", highlight.id, dependencies);
assert.equal(getReadingAnnotations("identity-a", "book", dependencies).some((item) => item.id === highlight.id), false);

const content: ReadingBookContent = { book: store.books[0]!, sourceCharacterLength: 8, chapters: [{ chapter: store.chapters[0]!, paragraphs: [paragraph] }] };
assert.equal(searchReadingContent(content, "下雨")[0]?.matchStart, 2);
assert.equal(searchReadingContent(content, "不存在").length, 0);

console.log("reading preferences, annotations and search tests passed");
