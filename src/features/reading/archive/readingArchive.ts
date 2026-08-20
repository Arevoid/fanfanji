import { readingAssetDb } from "../../../core/storage/readingAssetDb";
import { loadReadingStore, saveReadingStore } from "../../../core/storage/repositories/readingRepository";
import type { StorageResult, StorageWriteResult } from "../../../core/storage/storageTypes";
import { normalizeReadingStore } from "../../../domain/reading/normalization";
import type { ReadingBookAsset, ReadingStore } from "../../../domain/reading/types";

export const READING_ARCHIVE_KIND = "fanfanji-reading-archive" as const;
export const READING_ARCHIVE_VERSION = 1 as const;

interface ReadingArchiveAsset {
  assetId: string;
  bookId: string;
  contentHash: string;
  mimeType: string;
  createdAt: number;
  base64: string;
}

export interface ReadingArchive {
  kind: typeof READING_ARCHIVE_KIND;
  version: typeof READING_ARCHIVE_VERSION;
  exportedAt: number;
  sourceIdentityId: string;
  store: ReadingStore;
  assets: ReadingArchiveAsset[];
}

interface ArchiveAssetStore {
  load(assetId: string, userIdentityId: string, bookId: string): Promise<ReadingBookAsset | null>;
  save(asset: ReadingBookAsset): Promise<void>;
  delete(assetId: string, userIdentityId: string, bookId: string): Promise<boolean>;
}

export interface ReadingArchiveDependencies {
  loadStore: () => StorageResult<ReadingStore>;
  saveStore: (store: ReadingStore) => StorageWriteResult;
  assetStore: ArchiveAssetStore;
  now: () => number;
  createId: (prefix: string) => string;
}

const defaultDependencies: ReadingArchiveDependencies = {
  loadStore: loadReadingStore,
  saveStore: saveReadingStore,
  assetStore: readingAssetDb,
  now: () => Date.now(),
  createId: (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return globalThis.btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const sha256Hex = async (text: string): Promise<string> => {
  if (!globalThis.crypto?.subtle) throw new Error("当前环境无法校验阅读归档哈希");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const scopedStore = (store: ReadingStore, userIdentityId: string): ReadingStore => {
  const books = store.books.filter((item) => item.userIdentityId === userIdentityId);
  const bookIds = new Set(books.map((item) => item.id));
  const inScope = (item: { userIdentityId: string; bookId: string }) => item.userIdentityId === userIdentityId && bookIds.has(item.bookId);
  return {
    ...store,
    books,
    chapters: store.chapters.filter(inScope),
    paragraphAnchors: store.paragraphAnchors.filter(inScope),
    progress: store.progress.filter(inScope),
    annotations: store.annotations.filter(inScope),
    preferences: store.preferences.filter(inScope),
    assetCleanupTasks: [],
  };
};

export async function buildReadingArchive(userIdentityId: string, dependencies: ReadingArchiveDependencies = defaultDependencies): Promise<ReadingArchive> {
  const loaded = dependencies.loadStore();
  if (!loaded.valid) throw new Error("阅读数据当前不可用，无法导出");
  const store = scopedStore(loaded.value, userIdentityId);
  const assets: ReadingArchiveAsset[] = [];
  for (const book of store.books) {
    const asset = await dependencies.assetStore.load(book.assetId, userIdentityId, book.id);
    if (!asset) throw new Error(`《${book.title}》的正文文件缺失，已停止导出`);
    assets.push({
      assetId: asset.assetId,
      bookId: asset.bookId,
      contentHash: asset.contentHash,
      mimeType: asset.mimeType,
      createdAt: asset.createdAt,
      base64: bytesToBase64(new Uint8Array(await asset.blob.arrayBuffer())),
    });
  }
  return { kind: READING_ARCHIVE_KIND, version: READING_ARCHIVE_VERSION, exportedAt: dependencies.now(), sourceIdentityId: userIdentityId, store, assets };
}

export function serializeReadingArchive(archive: ReadingArchive): Blob {
  return new Blob([JSON.stringify(archive)], { type: "application/vnd.fanfanji.reading+json" });
}

export async function restoreReadingArchive(
  input: unknown,
  targetIdentityId: string,
  dependencies: ReadingArchiveDependencies = defaultDependencies,
): Promise<{ restoredBooks: number }> {
  if (!input || typeof input !== "object") throw new Error("不是有效的阅读归档");
  const archive = input as Partial<ReadingArchive>;
  if (archive.kind !== READING_ARCHIVE_KIND || archive.version !== READING_ARCHIVE_VERSION || typeof archive.sourceIdentityId !== "string" || !Array.isArray(archive.assets)) {
    throw new Error("阅读归档类型或版本不受支持");
  }
  if (!archive.store || archive.store.version !== 1) throw new Error("阅读归档元数据版本不受支持");
  const source = normalizeReadingStore(archive.store);
  const sourceBooks = source.books.filter((book) => book.userIdentityId === archive.sourceIdentityId);
  if (sourceBooks.length === 0 && archive.assets.length > 0) throw new Error("阅读归档元数据损坏");
  const loaded = dependencies.loadStore();
  if (!loaded.valid) throw new Error("当前阅读数据不可用，已停止恢复以保护原数据");

  const bookIds = new Map(sourceBooks.map((book) => [book.id, dependencies.createId("book")]));
  const assetIds = new Map(sourceBooks.map((book) => [book.assetId, dependencies.createId("reading-asset")]));
  const sourceChapters = source.chapters.filter((chapter) => bookIds.has(chapter.bookId));
  const chapterIds = new Map(sourceChapters.map((chapter) => [chapter.id, dependencies.createId("chapter")]));
  const sourceAnchors = source.paragraphAnchors.filter((anchor) => bookIds.has(anchor.bookId) && chapterIds.has(anchor.chapterId));
  const anchorIds = new Map(sourceAnchors.map((anchor) => [anchor.id, dependencies.createId("anchor")]));
  const now = dependencies.now();
  const writtenAssets: ReadingBookAsset[] = [];

  try {
    for (const book of sourceBooks) {
      const payload = archive.assets.find((asset) => asset.assetId === book.assetId && asset.bookId === book.id && asset.contentHash === book.contentHash);
      if (!payload || typeof payload.base64 !== "string") throw new Error(`《${book.title}》的正文归档缺失`);
      const bytes = base64ToBytes(payload.base64);
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new Error(`《${book.title}》的正文编码损坏`);
      }
      if (await sha256Hex(text) !== book.contentHash) throw new Error(`《${book.title}》的正文哈希校验失败`);
      const asset: ReadingBookAsset = {
        assetId: assetIds.get(book.assetId)!,
        userIdentityId: targetIdentityId,
        bookId: bookIds.get(book.id)!,
        contentHash: book.contentHash,
        mimeType: payload.mimeType || "text/plain;charset=utf-8",
        byteLength: bytes.byteLength,
        blob: new Blob([bytes], { type: payload.mimeType || "text/plain;charset=utf-8" }),
        createdAt: now,
      };
      await dependencies.assetStore.save(asset);
      writtenAssets.push(asset);
    }

    const books = sourceBooks.map((book) => ({ ...book, id: bookIds.get(book.id)!, assetId: assetIds.get(book.assetId)!, userIdentityId: targetIdentityId, createdAt: now, updatedAt: now }));
    const chapters = sourceChapters.map((chapter) => ({
      ...chapter,
      id: chapterIds.get(chapter.id)!,
      userIdentityId: targetIdentityId,
      bookId: bookIds.get(chapter.bookId)!,
      firstParagraphAnchorId: chapter.firstParagraphAnchorId ? anchorIds.get(chapter.firstParagraphAnchorId) : undefined,
      lastParagraphAnchorId: chapter.lastParagraphAnchorId ? anchorIds.get(chapter.lastParagraphAnchorId) : undefined,
    }));
    const paragraphAnchors = sourceAnchors.map((anchor) => ({ ...anchor, id: anchorIds.get(anchor.id)!, userIdentityId: targetIdentityId, bookId: bookIds.get(anchor.bookId)!, chapterId: chapterIds.get(anchor.chapterId)! }));
    const progress = source.progress.flatMap((item) => bookIds.has(item.bookId) && chapterIds.has(item.chapterId) && anchorIds.has(item.paragraphAnchorId) ? [{ ...item, userIdentityId: targetIdentityId, bookId: bookIds.get(item.bookId)!, chapterId: chapterIds.get(item.chapterId)!, paragraphAnchorId: anchorIds.get(item.paragraphAnchorId)!, updatedAt: now }] : []);
    const annotations = source.annotations.flatMap((item) => bookIds.has(item.bookId) && chapterIds.has(item.chapterId) && anchorIds.has(item.paragraphAnchorId) ? [{ ...item, id: dependencies.createId("reading-annotation"), userIdentityId: targetIdentityId, bookId: bookIds.get(item.bookId)!, chapterId: chapterIds.get(item.chapterId)!, paragraphAnchorId: anchorIds.get(item.paragraphAnchorId)!, createdAt: now, updatedAt: now }] : []);
    const preferences = source.preferences.flatMap((item) => bookIds.has(item.bookId) ? [{ ...item, userIdentityId: targetIdentityId, bookId: bookIds.get(item.bookId)!, updatedAt: now }] : []);
    const current = dependencies.loadStore();
    if (!current.valid) throw new Error("恢复期间阅读数据变得不可用");
    const result = dependencies.saveStore({
      ...current.value,
      books: [...current.value.books, ...books],
      chapters: [...current.value.chapters, ...chapters],
      paragraphAnchors: [...current.value.paragraphAnchors, ...paragraphAnchors],
      progress: [...current.value.progress, ...progress],
      annotations: [...current.value.annotations, ...annotations],
      preferences: [...current.value.preferences, ...preferences],
    });
    if (!result.success) throw new Error(`阅读归档元数据恢复失败：${result.error || "unknown"}`);
    return { restoredBooks: books.length };
  } catch (error) {
    await Promise.all(writtenAssets.map((asset) => dependencies.assetStore.delete(asset.assetId, asset.userIdentityId, asset.bookId).catch(() => false)));
    throw error;
  }
}
