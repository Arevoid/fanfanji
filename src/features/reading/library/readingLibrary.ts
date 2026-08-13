import { readingAssetDb } from "../../../core/storage/readingAssetDb";
import { loadReadingStore, saveReadingStore } from "../../../core/storage/repositories/readingRepository";
import type { StorageResult, StorageWriteResult } from "../../../core/storage/storageTypes";
import type {
  ReadingAssetCleanupTask,
  ReadingBook,
  ReadingBookAsset,
  ReadingStore,
} from "../../../domain/reading/types";
import { parseReadingDocument } from "./readingParser";

export type ReadingLibraryErrorCode = "store-unavailable" | "book-not-found" | "asset-not-found" | "save-failed" | "parse-failed";

export class ReadingLibraryError extends Error {
  constructor(public readonly code: ReadingLibraryErrorCode, message: string) {
    super(message);
    this.name = "ReadingLibraryError";
  }
}

interface ReadingLibraryAssetStore {
  load(assetId: string, userIdentityId: string, bookId: string): Promise<ReadingBookAsset | null>;
  delete(assetId: string, userIdentityId: string, bookId: string): Promise<boolean>;
}

export interface ReadingLibraryDependencies {
  loadStore: () => StorageResult<ReadingStore>;
  saveStore: (store: ReadingStore) => StorageWriteResult;
  assetStore: ReadingLibraryAssetStore;
  now: () => number;
  createId: (prefix: string) => string;
}

const defaultDependencies: ReadingLibraryDependencies = {
  loadStore: loadReadingStore,
  saveStore: saveReadingStore,
  assetStore: readingAssetDb,
  now: () => Date.now(),
  createId: (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
};

function requireStore(dependencies: ReadingLibraryDependencies): ReadingStore {
  const loaded = dependencies.loadStore();
  if (!loaded.valid) throw new ReadingLibraryError("store-unavailable", "阅读数据当前不可用，已停止操作以保护现有内容");
  return loaded.value;
}

function findScopedBook(store: ReadingStore, userIdentityId: string, bookId: string): ReadingBook {
  const book = store.books.find((candidate) => candidate.userIdentityId === userIdentityId && candidate.id === bookId);
  if (!book) throw new ReadingLibraryError("book-not-found", "没有找到当前身份下的这本书");
  return book;
}

function saveOrThrow(dependencies: ReadingLibraryDependencies, store: ReadingStore): void {
  const result = dependencies.saveStore(store);
  if (!result.success) throw new ReadingLibraryError("save-failed", `阅读数据保存失败：${result.error || "unknown"}`);
}

export async function ensureReadingBookParsed(
  userIdentityId: string,
  bookId: string,
  dependencies: ReadingLibraryDependencies = defaultDependencies,
): Promise<ReadingBook> {
  const initial = requireStore(dependencies);
  const book = findScopedBook(initial, userIdentityId, bookId);
  const existingChapters = initial.chapters.filter((chapter) => chapter.userIdentityId === userIdentityId && chapter.bookId === bookId);
  if (book.chapterCount > 0 && existingChapters.length === book.chapterCount) return book;

  const asset = await dependencies.assetStore.load(book.assetId, userIdentityId, bookId);
  if (!asset) throw new ReadingLibraryError("asset-not-found", "小说正文文件不存在或不属于当前身份");

  try {
    const parsed = await parseReadingDocument({ text: await asset.blob.text(), format: book.format, userIdentityId, bookId });
    const latest = requireStore(dependencies);
    const latestBook = findScopedBook(latest, userIdentityId, bookId);
    const updatedBook: ReadingBook = {
      ...latestBook,
      status: "ready",
      chapterCount: parsed.chapters.length,
      updatedAt: dependencies.now(),
      lastError: undefined,
    };
    saveOrThrow(dependencies, {
      ...latest,
      books: latest.books.map((candidate) =>
        candidate.userIdentityId === userIdentityId && candidate.id === bookId ? updatedBook : candidate),
      chapters: [
        ...latest.chapters.filter((chapter) => !(chapter.userIdentityId === userIdentityId && chapter.bookId === bookId)),
        ...parsed.chapters,
      ],
      paragraphAnchors: [
        ...latest.paragraphAnchors.filter((anchor) => !(anchor.userIdentityId === userIdentityId && anchor.bookId === bookId)),
        ...parsed.paragraphAnchors,
      ],
    });
    return updatedBook;
  } catch (error) {
    if (error instanceof ReadingLibraryError) throw error;
    const latest = requireStore(dependencies);
    const message = error instanceof Error ? error.message : "章节解析失败";
    saveOrThrow(dependencies, {
      ...latest,
      books: latest.books.map((candidate) => candidate.userIdentityId === userIdentityId && candidate.id === bookId
        ? { ...candidate, status: "error", lastError: message, updatedAt: dependencies.now() }
        : candidate),
    });
    throw new ReadingLibraryError("parse-failed", message);
  }
}

export function updateReadingBookDetails(
  input: { userIdentityId: string; bookId: string; title: string; author?: string; description?: string },
  dependencies: ReadingLibraryDependencies = defaultDependencies,
): ReadingBook {
  const store = requireStore(dependencies);
  const book = findScopedBook(store, input.userIdentityId, input.bookId);
  const title = input.title.trim();
  if (!title) throw new ReadingLibraryError("save-failed", "书名不能为空");
  const updated: ReadingBook = {
    ...book,
    title,
    author: input.author?.trim() || undefined,
    description: input.description?.trim() || undefined,
    updatedAt: dependencies.now(),
  };
  saveOrThrow(dependencies, {
    ...store,
    books: store.books.map((candidate) => candidate.userIdentityId === input.userIdentityId && candidate.id === input.bookId ? updated : candidate),
  });
  return updated;
}

export function setReadingBookArchived(
  userIdentityId: string,
  bookId: string,
  archived: boolean,
  dependencies: ReadingLibraryDependencies = defaultDependencies,
): ReadingBook {
  const store = requireStore(dependencies);
  const book = findScopedBook(store, userIdentityId, bookId);
  const now = dependencies.now();
  const updated: ReadingBook = {
    ...book,
    status: archived ? "archived" : "ready",
    archivedAt: archived ? now : undefined,
    updatedAt: now,
  };
  saveOrThrow(dependencies, {
    ...store,
    books: store.books.map((candidate) => candidate.userIdentityId === userIdentityId && candidate.id === bookId ? updated : candidate),
  });
  return updated;
}

export async function deleteReadingBook(
  userIdentityId: string,
  bookId: string,
  dependencies: ReadingLibraryDependencies = defaultDependencies,
): Promise<{ status: "deleted" | "cleanup-pending" }> {
  const store = requireStore(dependencies);
  const book = findScopedBook(store, userIdentityId, bookId);
  const cleanupTask: ReadingAssetCleanupTask = {
    id: dependencies.createId("reading-cleanup"),
    assetId: book.assetId,
    userIdentityId,
    bookId,
    createdAt: dependencies.now(),
  };
  const isBookScope = (item: { userIdentityId: string; bookId: string }) =>
    item.userIdentityId === userIdentityId && item.bookId === bookId;
  saveOrThrow(dependencies, {
    ...store,
    books: store.books.filter((candidate) => !(candidate.userIdentityId === userIdentityId && candidate.id === bookId)),
    chapters: store.chapters.filter((item) => !isBookScope(item)),
    paragraphAnchors: store.paragraphAnchors.filter((item) => !isBookScope(item)),
    progress: store.progress.filter((item) => !isBookScope(item)),
    annotations: store.annotations.filter((item) => !isBookScope(item)),
    preferences: store.preferences.filter((item) => !isBookScope(item)),
    assetCleanupTasks: [...store.assetCleanupTasks, cleanupTask],
  });

  try {
    await dependencies.assetStore.delete(book.assetId, userIdentityId, bookId);
    try {
      const latest = requireStore(dependencies);
      saveOrThrow(dependencies, {
        ...latest,
        assetCleanupTasks: latest.assetCleanupTasks.filter((task) => task.id !== cleanupTask.id),
      });
      return { status: "deleted" };
    } catch {
      return { status: "cleanup-pending" };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "正文清理失败";
    try {
      const latest = requireStore(dependencies);
      saveOrThrow(dependencies, {
        ...latest,
        assetCleanupTasks: latest.assetCleanupTasks.map((task) => task.id === cleanupTask.id
          ? { ...task, lastAttemptAt: dependencies.now(), lastError: message }
          : task),
      });
    } catch {
      // The original cleanup task was committed before Blob deletion and remains retryable.
    }
    return { status: "cleanup-pending" };
  }
}

export async function retryReadingAssetCleanup(
  userIdentityId: string,
  dependencies: ReadingLibraryDependencies = defaultDependencies,
): Promise<void> {
  const store = requireStore(dependencies);
  const tasks = store.assetCleanupTasks.filter((task) => task.userIdentityId === userIdentityId);
  if (tasks.length === 0) return;
  const completed = new Set<string>();
  const failures = new Map<string, string>();
  for (const task of tasks) {
    try {
      await dependencies.assetStore.delete(task.assetId, task.userIdentityId, task.bookId);
      completed.add(task.id);
    } catch (error) {
      failures.set(task.id, error instanceof Error ? error.message : "正文清理失败");
    }
  }
  const latest = requireStore(dependencies);
  saveOrThrow(dependencies, {
    ...latest,
    assetCleanupTasks: latest.assetCleanupTasks
      .filter((task) => !completed.has(task.id))
      .map((task) => failures.has(task.id)
        ? { ...task, lastAttemptAt: dependencies.now(), lastError: failures.get(task.id) }
        : task),
  });
}
