import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createEmptyReadingStore, type ReadingBookAsset, type ReadingStore } from "../src/domain/reading/types";
import { buildReadingArchive, restoreReadingArchive, type ReadingArchiveDependencies } from "../src/features/reading/archive/readingArchive";

const hashText = async (text: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const archiveText = "正文完整内容";
const archiveHash = await hashText(archiveText);
const book = { id: "book-a", userIdentityId: "identity-a", assetId: "asset-a", contentHash: archiveHash, format: "txt" as const, status: "ready" as const, title: "归档书", sourceFileName: "a.txt", sourceMimeType: "text/plain", sourceEncoding: "utf-8", byteLength: 12, wordCount: 8, chapterCount: 1, createdAt: 1, updatedAt: 1 };
let store: ReadingStore = {
  ...createEmptyReadingStore(),
  books: [book, { ...book, userIdentityId: "identity-b", assetId: "asset-b", contentHash: await hashText("不能导出"), title: "其他身份" }],
  chapters: [{ id: "chapter-a", userIdentityId: "identity-a", bookId: "book-a", order: 0, title: "第一章", firstParagraphAnchorId: "anchor-a", lastParagraphAnchorId: "anchor-a", wordCount: 8 }],
  paragraphAnchors: [{ id: "anchor-a", userIdentityId: "identity-a", bookId: "book-a", chapterId: "chapter-a", ordinal: 0, normalizedTextHash: "hash", characterStart: 0, characterEnd: 8 }],
  progress: [{ userIdentityId: "identity-a", bookId: "book-a", chapterId: "chapter-a", paragraphAnchorId: "anchor-a", characterOffset: 4, percent: 50, updatedAt: 2 }],
  annotations: [{ id: "note-a", userIdentityId: "identity-a", bookId: "book-a", chapterId: "chapter-a", paragraphAnchorId: "anchor-a", kind: "note", range: { start: 0, end: 2 }, textSnapshot: "正文", note: "测试", createdAt: 2, updatedAt: 2 }],
  preferences: [{ userIdentityId: "identity-a", bookId: "book-a", fontAssetId: "global-custom-font", fontSize: 20, updatedAt: 2 }],
};
const assets = new Map<string, ReadingBookAsset>([
  ["asset-a", { assetId: "asset-a", userIdentityId: "identity-a", bookId: "book-a", contentHash: archiveHash, mimeType: "text/plain", byteLength: 12, blob: new Blob([archiveText]), createdAt: 1 }],
  ["asset-b", { assetId: "asset-b", userIdentityId: "identity-b", bookId: "book-a", contentHash: await hashText("不能导出"), mimeType: "text/plain", byteLength: 12, blob: new Blob(["不能导出"]), createdAt: 1 }],
]);
let id = 0;
let failMetadata = false;
const dependencies: ReadingArchiveDependencies = {
  loadStore: () => ({ value: store, found: true, valid: true }),
  saveStore: (next) => { if (failMetadata) return { success: false, error: "quota" }; store = next; return { success: true }; },
  assetStore: {
    load: async (assetId, userIdentityId, bookId) => { const asset = assets.get(assetId); return asset?.userIdentityId === userIdentityId && asset.bookId === bookId ? asset : null; },
    save: async (asset) => { assets.set(asset.assetId, asset); },
    delete: async (assetId) => assets.delete(assetId),
  },
  now: () => 100,
  createId: (prefix) => `${prefix}-restored-${++id}`,
};

const archive = await buildReadingArchive("identity-a", dependencies);
assert.equal(archive.store.books.length, 1);
assert.equal(archive.store.books[0]?.userIdentityId, "identity-a");
assert.equal(archive.assets.length, 1);
assert.equal(archive.assets[0]?.assetId, "asset-a");

const restored = await restoreReadingArchive(archive, "identity-c", dependencies);
assert.equal(restored.restoredBooks, 1);
const restoredBook = store.books.find((item) => item.userIdentityId === "identity-c")!;
assert.notEqual(restoredBook.id, "book-a", "restore generates collision-safe business IDs");
assert.equal(store.progress.find((item) => item.userIdentityId === "identity-c")?.percent, 50);
assert.equal(store.annotations.find((item) => item.userIdentityId === "identity-c")?.note, "测试");
assert.equal(store.preferences.find((item) => item.userIdentityId === "identity-c")?.fontAssetId, "global-custom-font");
assert.equal(await assets.get(restoredBook.assetId)?.blob.text(), archiveText);

const assetCountBeforeRollback = assets.size;
failMetadata = true;
await assert.rejects(restoreReadingArchive(archive, "identity-d", dependencies), /元数据恢复失败/);
assert.equal(assets.size, assetCountBeforeRollback, "metadata failure rolls back all newly restored Blobs");
assert.equal(store.books.some((item) => item.userIdentityId === "identity-d"), false);

failMetadata = false;
const corruptedArchive = structuredClone(archive);
corruptedArchive.assets[0]!.base64 = Buffer.from("被篡改的正文", "utf8").toString("base64");
const assetCountBeforeHashFailure = assets.size;
await assert.rejects(restoreReadingArchive(corruptedArchive, "identity-e", dependencies), /哈希校验失败/);
assert.equal(assets.size, assetCountBeforeHashFailure, "corrupt archives fail before any Blob is committed");

console.log("reading archive round-trip and rollback tests passed");
