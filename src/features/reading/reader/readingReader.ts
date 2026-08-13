import { readingAssetDb } from "../../../core/storage/readingAssetDb";
import { loadReadingStore, saveReadingStore } from "../../../core/storage/repositories/readingRepository";
import type { StorageResult, StorageWriteResult } from "../../../core/storage/storageTypes";
import type {
  ParagraphAnchor,
  ReadingBook,
  ReadingBookAsset,
  ReadingChapter,
  ReadingProgress,
  ReadingStore,
} from "../../../domain/reading/types";

export interface ReadingParagraphView {
  anchor: ParagraphAnchor;
  text: string;
}

export interface ReadingChapterView {
  chapter: ReadingChapter;
  paragraphs: ReadingParagraphView[];
}

export interface ReadingBookContent {
  book: ReadingBook;
  chapters: ReadingChapterView[];
  sourceCharacterLength: number;
}

export type ReadingReaderErrorCode = "store-unavailable" | "book-not-found" | "content-not-ready" | "asset-not-found" | "invalid-position" | "save-failed";

export class ReadingReaderError extends Error {
  constructor(public readonly code: ReadingReaderErrorCode, message: string) {
    super(message);
    this.name = "ReadingReaderError";
  }
}

interface ReadingReaderAssetStore {
  load(assetId: string, userIdentityId: string, bookId: string): Promise<ReadingBookAsset | null>;
}

export interface ReadingReaderDependencies {
  loadStore: () => StorageResult<ReadingStore>;
  saveStore: (store: ReadingStore) => StorageWriteResult;
  assetStore: ReadingReaderAssetStore;
  now: () => number;
}

const defaultDependencies: ReadingReaderDependencies = {
  loadStore: loadReadingStore,
  saveStore: saveReadingStore,
  assetStore: readingAssetDb,
  now: () => Date.now(),
};

function requireStore(dependencies: ReadingReaderDependencies): ReadingStore {
  const loaded = dependencies.loadStore();
  if (!loaded.valid) throw new ReadingReaderError("store-unavailable", "阅读数据当前不可用，已停止读取以保护现有内容");
  return loaded.value;
}

function findBook(store: ReadingStore, userIdentityId: string, bookId: string): ReadingBook {
  const book = store.books.find((candidate) => candidate.userIdentityId === userIdentityId && candidate.id === bookId);
  if (!book) throw new ReadingReaderError("book-not-found", "没有找到当前身份下的这本书");
  return book;
}

export async function loadReadingBookContent(
  userIdentityId: string,
  bookId: string,
  dependencies: ReadingReaderDependencies = defaultDependencies,
): Promise<ReadingBookContent> {
  const store = requireStore(dependencies);
  const book = findBook(store, userIdentityId, bookId);
  const chapters = store.chapters
    .filter((chapter) => chapter.userIdentityId === userIdentityId && chapter.bookId === bookId)
    .sort((left, right) => left.order - right.order);
  if (chapters.length === 0) throw new ReadingReaderError("content-not-ready", "书籍目录尚未解析完成");
  const asset = await dependencies.assetStore.load(book.assetId, userIdentityId, bookId);
  if (!asset) throw new ReadingReaderError("asset-not-found", "小说正文文件不存在或不属于当前身份");
  const text = await asset.blob.text();
  const chapterViews = chapters.map((chapter) => {
    const anchors = store.paragraphAnchors
      .filter((anchor) => anchor.userIdentityId === userIdentityId && anchor.bookId === bookId && anchor.chapterId === chapter.id)
      .sort((left, right) => left.ordinal - right.ordinal);
    const paragraphs = anchors.map((anchor) => {
      if (anchor.characterStart > text.length || anchor.characterEnd > text.length) {
        throw new ReadingReaderError("content-not-ready", "正文版本与段落锚点不一致，请重新导入书籍");
      }
      return { anchor, text: text.slice(anchor.characterStart, anchor.characterEnd) };
    });
    return { chapter, paragraphs };
  });
  const readableCharacterLength = chapterViews.reduce((total, chapterView) =>
    total + chapterView.paragraphs.reduce((chapterTotal, paragraph) =>
      chapterTotal + paragraph.anchor.characterEnd - paragraph.anchor.characterStart, 0), 0);
  return { book, chapters: chapterViews, sourceCharacterLength: Math.max(readableCharacterLength, 1) };
}

export function getReadingProgress(
  userIdentityId: string,
  bookId: string,
  dependencies: Pick<ReadingReaderDependencies, "loadStore"> = defaultDependencies,
): ReadingProgress | null {
  const loaded = dependencies.loadStore();
  if (!loaded.valid) return null;
  return loaded.value.progress.find((progress) => progress.userIdentityId === userIdentityId && progress.bookId === bookId) || null;
}

export function calculateReadingPercent(characterOffset: number, readableCharactersBefore: number, readableCharacterLength: number): number {
  if (readableCharacterLength <= 0) return 0;
  const position = Math.min(Math.max(readableCharactersBefore + characterOffset, 0), readableCharacterLength);
  return Math.round((position / readableCharacterLength) * 10000) / 100;
}

export function saveReadingProgress(
  input: Omit<ReadingProgress, "percent" | "updatedAt"> & { sourceCharacterLength: number },
  dependencies: ReadingReaderDependencies = defaultDependencies,
): ReadingProgress {
  const store = requireStore(dependencies);
  const book = findBook(store, input.userIdentityId, input.bookId);
  const chapter = store.chapters.find((candidate) =>
    candidate.userIdentityId === input.userIdentityId && candidate.bookId === input.bookId && candidate.id === input.chapterId);
  const anchor = store.paragraphAnchors.find((candidate) =>
    candidate.userIdentityId === input.userIdentityId
    && candidate.bookId === input.bookId
    && candidate.chapterId === input.chapterId
    && candidate.id === input.paragraphAnchorId);
  if (!chapter || !anchor || input.characterOffset < 0 || input.characterOffset > anchor.characterEnd - anchor.characterStart) {
    throw new ReadingReaderError("invalid-position", "阅读位置不属于当前身份下的这本书");
  }
  const scopedAnchors = store.paragraphAnchors
    .filter((candidate) => candidate.userIdentityId === input.userIdentityId && candidate.bookId === input.bookId)
    .sort((left, right) => left.characterStart - right.characterStart || left.ordinal - right.ordinal);
  const anchorIndex = scopedAnchors.findIndex((candidate) => candidate.id === anchor.id && candidate.chapterId === anchor.chapterId);
  const readableCharactersBefore = scopedAnchors.slice(0, anchorIndex).reduce((total, candidate) =>
    total + candidate.characterEnd - candidate.characterStart, 0);
  const now = dependencies.now();
  const progress: ReadingProgress = {
    userIdentityId: input.userIdentityId,
    bookId: input.bookId,
    chapterId: input.chapterId,
    paragraphAnchorId: input.paragraphAnchorId,
    characterOffset: input.characterOffset,
    scrollOffsetHint: input.scrollOffsetHint,
    percent: calculateReadingPercent(input.characterOffset, readableCharactersBefore, input.sourceCharacterLength),
    updatedAt: now,
  };
  const result = dependencies.saveStore({
    ...store,
    books: store.books.map((candidate) => candidate.userIdentityId === input.userIdentityId && candidate.id === input.bookId
      ? { ...book, updatedAt: now }
      : candidate),
    progress: [
      ...store.progress.filter((candidate) => !(candidate.userIdentityId === input.userIdentityId && candidate.bookId === input.bookId)),
      progress,
    ],
  });
  if (!result.success) throw new ReadingReaderError("save-failed", `阅读进度保存失败：${result.error || "unknown"}`);
  return progress;
}
