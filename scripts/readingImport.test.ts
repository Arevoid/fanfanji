import assert from "node:assert/strict";
import { File } from "node:buffer";
import { createEmptyReadingStore, type ReadingBookAsset, type ReadingStore } from "../src/domain/reading/types";
import {
  decodeReadingText,
  detectReadingBookFormat,
  importReadingFile,
  prepareReadingImport,
  ReadingImportError,
  type ReadingImportDependencies,
} from "../src/features/reading/import/readingImport";

assert.equal(detectReadingBookFormat({ name: "novel.TXT", type: "" }), "txt");
assert.equal(detectReadingBookFormat({ name: "story.markdown", type: "" }), "markdown");
assert.throws(
  () => detectReadingBookFormat({ name: "book.epub", type: "application/epub+zip" }),
  (error) => error instanceof ReadingImportError && error.code === "unsupported-format",
);

const utf16 = Uint8Array.from([0xff, 0xfe, 0x60, 0x4f, 0x7d, 0x59]).buffer;
assert.deepEqual(decodeReadingText(utf16), { text: "你好", encoding: "utf-16le" });
const gbk = Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3]).buffer;
assert.deepEqual(decodeReadingText(gbk), { text: "你好", encoding: "gb18030" });
assert.throws(
  () => decodeReadingText(new ArrayBuffer(0)),
  (error) => error instanceof ReadingImportError && error.code === "empty-file",
);

const sourceFile = new File(["第一行\r\n第二行"], "测试小说.txt", { type: "text/plain" });
const prepared = await prepareReadingImport(sourceFile);
assert.equal(prepared.text, "第一行\n第二行");
assert.equal(prepared.title, "测试小说");
assert.equal(prepared.sourceEncoding, "utf-8");
assert.equal(prepared.contentHash.length, 64);
assert.equal(prepared.characterCount, 6);

let store: ReadingStore = createEmptyReadingStore();
const assets = new Map<string, ReadingBookAsset>();
let idCounter = 0;
const dependencies: ReadingImportDependencies = {
  loadStore: () => ({ value: store, found: true, valid: true }),
  saveStore: (next) => {
    store = next;
    return { success: true };
  },
  assetStore: {
    save: async (asset) => { assets.set(asset.assetId, asset); },
    delete: async (assetId, userIdentityId, bookId) => {
      const asset = assets.get(assetId);
      if (!asset || asset.userIdentityId !== userIdentityId || asset.bookId !== bookId) return false;
      return assets.delete(assetId);
    },
  },
  now: () => 100,
  createId: (prefix) => `${prefix}-${++idCounter}`,
};

const first = await importReadingFile(sourceFile, "identity-a", { dependencies });
assert.equal(first.status, "imported");
assert.equal(store.books.length, 1);
assert.equal(assets.size, 1);
assert.equal(store.books[0]?.userIdentityId, "identity-a");
assert.equal(store.books[0]?.chapterCount, 1);
assert.equal(store.chapters.length, 1, "import persists parsed chapters in the metadata transaction");
assert.equal(store.paragraphAnchors.length, 2, "import creates stable paragraph anchors before reporting success");
assert.equal(await [...assets.values()][0]?.blob.text(), "第一行\n第二行", "asset is canonical UTF-8 text");

const duplicate = await importReadingFile(sourceFile, "identity-a", { dependencies });
assert.equal(duplicate.status, "duplicate");
assert.equal(store.books.length, 1);
assert.equal(assets.size, 1, "duplicate detection happens before Blob writes");

const otherIdentity = await importReadingFile(sourceFile, "identity-b", { dependencies });
assert.equal(otherIdentity.status, "imported", "content hashes never deduplicate across identities");
assert.equal(store.books.length, 2);
assert.equal(assets.size, 2);

let rollbackDeleteCalled = false;
const failingDependencies: ReadingImportDependencies = {
  ...dependencies,
  loadStore: () => ({ value: createEmptyReadingStore(), found: true, valid: true }),
  saveStore: () => ({ success: false, error: "quota" }),
  assetStore: {
    save: async (asset) => { assets.set(asset.assetId, asset); },
    delete: async (assetId) => {
      rollbackDeleteCalled = true;
      return assets.delete(assetId);
    },
  },
};
await assert.rejects(
  importReadingFile(new File(["rollback"], "rollback.md", { type: "text/markdown" }), "identity-a", { dependencies: failingDependencies }),
  (error) => error instanceof ReadingImportError && error.code === "metadata-write-failed",
);
assert.equal(rollbackDeleteCalled, true, "metadata failure rolls back the newly written Blob");

let invalidStoreAssetWriteCalled = false;
const invalidStoreDependencies: ReadingImportDependencies = {
  ...dependencies,
  loadStore: () => ({ value: createEmptyReadingStore(), found: true, valid: false, error: "parse" }),
  assetStore: {
    save: async () => { invalidStoreAssetWriteCalled = true; },
    delete: async () => false,
  },
};
await assert.rejects(
  importReadingFile(new File(["protected"], "protected.txt", { type: "text/plain" }), "identity-a", {
    dependencies: invalidStoreDependencies,
  }),
  (error) => error instanceof ReadingImportError && error.code === "metadata-write-failed",
);
assert.equal(invalidStoreAssetWriteCalled, false, "invalid metadata never gets overwritten or creates an orphan Blob");

console.log("reading import tests passed");
