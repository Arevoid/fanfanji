import * as LZStringModule from "lz-string";
import { normalizeReadingStore } from "../../../domain/reading/normalization";
import { createEmptyReadingStore, type ReadingStore } from "../../../domain/reading/types";
import { readingAssetDb } from "../readingAssetDb";
import { readJson, readString, remove, writeString } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageErrorKind, StorageResult, StorageWriteResult } from "../storageTypes";

const LZString = ((LZStringModule as typeof LZStringModule & { default?: typeof LZStringModule }).default ?? LZStringModule) as typeof import("lz-string");

export function loadReadingStore(): StorageResult<ReadingStore> {
  if (metadataReady && cachedReadingStore) {
    return { value: cachedReadingStore, found: true, valid: true };
  }
  return loadLegacyReadingStore();
}

function loadLegacyReadingStore(): StorageResult<ReadingStore> {
  const raw = readString(storageKeys.readingStore);
  const loaded = raw.valid && raw.found && raw.value?.startsWith(COMPRESSED_READING_STORE_PREFIX)
    ? readCompressedReadingStore(raw.value)
    : readJson<unknown>(storageKeys.readingStore, createEmptyReadingStore());
  return {
    ...loaded,
    value: normalizeReadingStore(unpackReadingStore(loaded.value)),
  };
}

export function saveReadingStore(store: ReadingStore): StorageWriteResult {
  const normalized = normalizeReadingStore(store);
  if (typeof indexedDB !== "undefined") {
    cachedReadingStore = normalized;
    metadataReady = true;
    enqueueMetadataWrite(normalized).catch((error) => {
      console.warn("[reading] Failed to persist reading metadata in IndexedDB.", error);
    });
    return { success: true };
  }
  return saveLegacyReadingStore(normalized);
}

export async function saveReadingStoreDurably(store: ReadingStore): Promise<StorageWriteResult> {
  const normalized = normalizeReadingStore(store);
  if (typeof indexedDB === "undefined") return saveLegacyReadingStore(normalized);
  const previousStore = cachedReadingStore;
  cachedReadingStore = normalized;
  metadataReady = true;
  try {
    await enqueueMetadataWrite(normalized);
    remove(storageKeys.readingStore);
    return { success: true };
  } catch (error) {
    cachedReadingStore = previousStore;
    metadataReady = previousStore !== null;
    console.warn("[reading] Failed to persist reading metadata in IndexedDB.", error);
    return { success: false, error: describeIndexedDbError(error) };
  }
}

export async function flushReadingStore(): Promise<StorageWriteResult> {
  if (typeof indexedDB === "undefined") return { success: true };
  try {
    await metadataWriteQueue;
    remove(storageKeys.readingStore);
    return { success: true };
  } catch (error) {
    console.warn("[reading] Reading metadata IndexedDB transaction failed.", error);
    return { success: false, error: describeIndexedDbError(error) };
  }
}

export async function initializeReadingStore(): Promise<StorageResult<ReadingStore>> {
  if (typeof indexedDB === "undefined") return loadLegacyReadingStore();
  if (metadataReady && cachedReadingStore) return { value: cachedReadingStore, found: true, valid: true };
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    try {
      const stored = await readingAssetDb.loadMetadata();
      if (stored) {
        cachedReadingStore = normalizeReadingStore(stored);
        metadataReady = true;
        return { value: cachedReadingStore, found: true, valid: true };
      }
      const legacy = loadLegacyReadingStore();
      if (legacy.found && !legacy.valid) return legacy;
      cachedReadingStore = legacy.value;
      metadataReady = true;
      await enqueueMetadataWrite(cachedReadingStore);
      if (legacy.found && legacy.valid) remove(storageKeys.readingStore);
      return legacy;
    } catch (error) {
      console.warn("[reading] IndexedDB metadata initialization failed; using the legacy store for this session.", error);
      metadataReady = false;
      return loadLegacyReadingStore();
    }
  })();
  return initializationPromise;
}

function saveLegacyReadingStore(store: ReadingStore): StorageWriteResult {
  try {
    const serialized = JSON.stringify(packReadingStore(store));
    const compressed = LZString.compressToUTF16(serialized);
    return writeString(storageKeys.readingStore, `${COMPRESSED_READING_STORE_PREFIX}${compressed}`);
  } catch (error) {
    console.warn("[reading] Failed to serialize the reading metadata store.", error);
    return { success: false, error: "serialize" };
  }
}

let cachedReadingStore: ReadingStore | null = null;
let metadataReady = false;
let initializationPromise: Promise<StorageResult<ReadingStore>> | null = null;
let metadataWriteQueue: Promise<void> = Promise.resolve();

function enqueueMetadataWrite(store: ReadingStore): Promise<void> {
  const snapshot = structuredCloneReadingStore(store);
  metadataWriteQueue = metadataWriteQueue.catch(() => undefined).then(() => readingAssetDb.saveMetadata(snapshot));
  return metadataWriteQueue;
}

function structuredCloneReadingStore(store: ReadingStore): ReadingStore {
  return typeof structuredClone === "function"
    ? structuredClone(store)
    : JSON.parse(JSON.stringify(store)) as ReadingStore;
}

function describeIndexedDbError(error: unknown): StorageErrorKind {
  if (error && typeof error === "object") {
    const name = String((error as { name?: unknown }).name || "");
    if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return "quota";
  }
  return error instanceof Error && /unavailable|disabled/i.test(error.message) ? "unavailable" : "write";
}

const COMPRESSED_READING_STORE_PREFIX = "lz16:";

function readCompressedReadingStore(value: string): StorageResult<unknown> {
  try {
    const decompressed = LZString.decompressFromUTF16(value.slice(COMPRESSED_READING_STORE_PREFIX.length));
    if (!decompressed) throw new Error("The compressed reading store is empty or invalid.");
    return { value: JSON.parse(decompressed), found: true, valid: true };
  } catch (error) {
    console.warn("[reading] Invalid compressed reading metadata. The original value was left untouched.", error);
    return { value: createEmptyReadingStore(), found: true, valid: false, error: "parse" };
  }
}

/**
 * Paragraph indexes contain thousands of records. Repeating the identity, book and
 * chapter keys in every JSON object can consume the entire localStorage quota even
 * though the novel body itself already lives in IndexedDB. This wire format keeps
 * the public domain model unchanged while persisting the index as compact tuples.
 */
function packReadingStore(store: ReadingStore) {
  return {
    version: store.version,
    compact: 2,
    books: store.books,
    chapters: store.chapters.map((chapter) => [chapter.id, chapter.bookId, chapter.order, chapter.title, chapter.firstParagraphAnchorId || "", chapter.lastParagraphAnchorId || "", chapter.wordCount]),
    paragraphAnchors: store.paragraphAnchors.map((anchor) => [anchor.id, anchor.chapterId, anchor.ordinal, anchor.normalizedTextHash.slice(0, 16), anchor.characterStart, anchor.characterEnd]),
    progress: store.progress.map((item) => [item.bookId, item.chapterId, item.paragraphAnchorId, item.characterOffset, item.scrollOffsetHint ?? null, item.percent, item.updatedAt]),
    annotations: store.annotations.map((item) => [item.id, item.bookId, item.chapterId, item.paragraphAnchorId, item.kind, item.range?.start ?? null, item.range?.end ?? null, item.textSnapshot, item.color || "", item.note || "", item.createdAt, item.updatedAt]),
    preferences: store.preferences.map((item) => [item.bookId, item.fontAssetId || "", item.fontSize ?? null, item.textColor || "", item.background || "", item.lineHeight ?? null, item.paragraphSpacing ?? null, item.letterSpacing ?? null, item.textAlign || "", item.pageMargin ?? null, item.firstLineIndent ?? null, item.updatedAt, item.pageMode || "scroll"]),
    assetCleanupTasks: store.assetCleanupTasks,
  };
}

function unpackReadingStore(value: unknown): unknown {
  if (!value || typeof value !== "object" || (value as { compact?: unknown }).compact !== 2) return value;
  const packed = value as Record<string, unknown>;
  const books = Array.isArray(packed.books) ? packed.books : [];
  const bookById = new Map(books.flatMap((book) => book && typeof book === "object" && typeof (book as { id?: unknown }).id === "string" ? [[(book as { id: string }).id, book as { userIdentityId?: string }]] : []));
  const chapters = (Array.isArray(packed.chapters) ? packed.chapters : []).flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const book = bookById.get(String(row[1] || ""));
    if (!book?.userIdentityId) return [];
    return [{ id: row[0], userIdentityId: book.userIdentityId, bookId: row[1], order: row[2], title: row[3], ...(row[4] ? { firstParagraphAnchorId: row[4] } : {}), ...(row[5] ? { lastParagraphAnchorId: row[5] } : {}), wordCount: row[6] }];
  });
  const chapterById = new Map(chapters.map((chapter) => [String(chapter.id), chapter]));
  const paragraphAnchors = (Array.isArray(packed.paragraphAnchors) ? packed.paragraphAnchors : []).flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const chapter = chapterById.get(String(row[1] || ""));
    if (!chapter) return [];
    return [{ id: row[0], userIdentityId: chapter.userIdentityId, bookId: chapter.bookId, chapterId: row[1], ordinal: row[2], normalizedTextHash: row[3], characterStart: row[4], characterEnd: row[5] }];
  });
  const scoped = (bookId: unknown) => bookById.get(String(bookId || ""));
  const progress = (Array.isArray(packed.progress) ? packed.progress : []).flatMap((row) => Array.isArray(row) && scoped(row[0])?.userIdentityId ? [{ userIdentityId: scoped(row[0])!.userIdentityId, bookId: row[0], chapterId: row[1], paragraphAnchorId: row[2], characterOffset: row[3], ...(row[4] !== null ? { scrollOffsetHint: row[4] } : {}), percent: row[5], updatedAt: row[6] }] : []);
  const annotations = (Array.isArray(packed.annotations) ? packed.annotations : []).flatMap((row) => Array.isArray(row) && scoped(row[1])?.userIdentityId ? [{ id: row[0], userIdentityId: scoped(row[1])!.userIdentityId, bookId: row[1], chapterId: row[2], paragraphAnchorId: row[3], kind: row[4], ...(row[5] !== null && row[6] !== null ? { range: { start: row[5], end: row[6] } } : {}), textSnapshot: row[7], ...(row[8] ? { color: row[8] } : {}), ...(row[9] ? { note: row[9] } : {}), createdAt: row[10], updatedAt: row[11] }] : []);
  const preferences = (Array.isArray(packed.preferences) ? packed.preferences : []).flatMap((row) => Array.isArray(row) && scoped(row[0])?.userIdentityId ? [{ userIdentityId: scoped(row[0])!.userIdentityId, bookId: row[0], ...(row[1] ? { fontAssetId: row[1] } : {}), ...(row[2] !== null ? { fontSize: row[2] } : {}), ...(row[3] ? { textColor: row[3] } : {}), ...(row[4] ? { background: row[4] } : {}), ...(row[5] !== null ? { lineHeight: row[5] } : {}), ...(row[6] !== null ? { paragraphSpacing: row[6] } : {}), ...(row[7] !== null ? { letterSpacing: row[7] } : {}), ...(row[8] ? { textAlign: row[8] } : {}), ...(row[9] !== null ? { pageMargin: row[9] } : {}), ...(row[10] !== null ? { firstLineIndent: row[10] } : {}), updatedAt: row[11], pageMode: row[12] === "horizontal" ? "horizontal" : "scroll" }] : []);
  return { version: packed.version, books, chapters, paragraphAnchors, progress, annotations, preferences, assetCleanupTasks: packed.assetCleanupTasks };
}
