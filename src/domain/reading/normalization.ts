import {
  createEmptyReadingStore,
  READING_STORE_VERSION,
  type ReadingAssetCleanupTask,
  type ParagraphAnchor,
  type ReadingAnnotation,
  type ReadingBook,
  type ReadingBookPreferences,
  type ReadingChapter,
  type ReadingProgress,
  type ReadingStore,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object";
const string = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonNegative = (value: unknown): value is number => number(value) && value >= 0;
const timestamp = (value: unknown): value is number => nonNegative(value);
const optionalString = (value: unknown): boolean => value === undefined || typeof value === "string";
const optionalNumber = (value: unknown): boolean => value === undefined || number(value);
const array = <T>(value: unknown, guard: (item: unknown) => item is T): T[] =>
  Array.isArray(value) ? value.filter(guard) : [];

export function isReadingBook(value: unknown): value is ReadingBook {
  if (!record(value)) return false;
  return string(value.id)
    && string(value.userIdentityId)
    && string(value.assetId)
    && string(value.contentHash)
    && (value.format === "txt" || value.format === "markdown")
    && ["importing", "ready", "error", "archived"].includes(String(value.status))
    && string(value.title)
    && optionalString(value.author)
    && optionalString(value.description)
    && optionalString(value.coverUrl)
    && string(value.sourceFileName)
    && string(value.sourceMimeType)
    && string(value.sourceEncoding)
    && nonNegative(value.byteLength)
    && nonNegative(value.wordCount)
    && nonNegative(value.chapterCount)
    && timestamp(value.createdAt)
    && timestamp(value.updatedAt)
    && optionalNumber(value.archivedAt)
    && optionalString(value.lastError);
}

export function isReadingChapter(value: unknown): value is ReadingChapter {
  if (!record(value)) return false;
  return string(value.id)
    && string(value.userIdentityId)
    && string(value.bookId)
    && nonNegative(value.order)
    && string(value.title)
    && optionalString(value.firstParagraphAnchorId)
    && optionalString(value.lastParagraphAnchorId)
    && nonNegative(value.wordCount);
}

export function isParagraphAnchor(value: unknown): value is ParagraphAnchor {
  if (!record(value)) return false;
  return string(value.id)
    && string(value.userIdentityId)
    && string(value.bookId)
    && string(value.chapterId)
    && nonNegative(value.ordinal)
    && string(value.normalizedTextHash)
    && nonNegative(value.characterStart)
    && nonNegative(value.characterEnd)
    && value.characterEnd >= value.characterStart;
}

export function isReadingProgress(value: unknown): value is ReadingProgress {
  if (!record(value)) return false;
  return string(value.userIdentityId)
    && string(value.bookId)
    && string(value.chapterId)
    && string(value.paragraphAnchorId)
    && nonNegative(value.characterOffset)
    && optionalNumber(value.scrollOffsetHint)
    && number(value.percent)
    && value.percent >= 0
    && value.percent <= 100
    && timestamp(value.updatedAt);
}

export function isReadingAnnotation(value: unknown): value is ReadingAnnotation {
  if (!record(value)) return false;
  const validRange = value.range === undefined || (
    record(value.range)
    && nonNegative(value.range.start)
    && nonNegative(value.range.end)
    && value.range.end >= value.range.start
  );
  return string(value.id)
    && string(value.userIdentityId)
    && string(value.bookId)
    && string(value.chapterId)
    && string(value.paragraphAnchorId)
    && ["bookmark", "highlight", "note", "edit"].includes(String(value.kind))
    && validRange
    && typeof value.textSnapshot === "string"
    && optionalString(value.color)
    && optionalString(value.note)
    && timestamp(value.createdAt)
    && timestamp(value.updatedAt);
}

export function isReadingBookPreferences(value: unknown): value is ReadingBookPreferences {
  if (!record(value)) return false;
  return string(value.userIdentityId)
    && string(value.bookId)
    && optionalString(value.fontAssetId)
    && optionalNumber(value.fontSize)
    && optionalString(value.textColor)
    && optionalString(value.background)
    && optionalNumber(value.lineHeight)
    && optionalNumber(value.paragraphSpacing)
    && optionalNumber(value.letterSpacing)
    && (value.textAlign === undefined || value.textAlign === "left" || value.textAlign === "justify")
    && optionalNumber(value.pageMargin)
    && optionalNumber(value.firstLineIndent)
    && (value.pageMode === undefined || value.pageMode === "scroll" || value.pageMode === "horizontal")
    && timestamp(value.updatedAt);
}

export function isReadingAssetCleanupTask(value: unknown): value is ReadingAssetCleanupTask {
  if (!record(value)) return false;
  return string(value.id)
    && string(value.assetId)
    && string(value.userIdentityId)
    && string(value.bookId)
    && timestamp(value.createdAt)
    && optionalNumber(value.lastAttemptAt)
    && optionalString(value.lastError);
}

const dedupe = <T>(items: readonly T[], key: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

export function normalizeReadingStore(value: unknown): ReadingStore {
  if (!record(value) || value.version !== READING_STORE_VERSION) return createEmptyReadingStore();

  const books = dedupe(array(value.books, isReadingBook), (item) => `${item.userIdentityId}:${item.id}`);
  const validBooks = new Set(books.map((item) => `${item.userIdentityId}:${item.id}`));
  const belongsToBook = (item: { userIdentityId: string; bookId: string }): boolean =>
    validBooks.has(`${item.userIdentityId}:${item.bookId}`);
  const chapters = dedupe(array(value.chapters, isReadingChapter).filter(belongsToBook), (item) => `${item.userIdentityId}:${item.id}`);
  const validChapters = new Set(chapters.map((item) => `${item.userIdentityId}:${item.bookId}:${item.id}`));
  const belongsToChapter = (item: { userIdentityId: string; bookId: string; chapterId: string }): boolean =>
    validChapters.has(`${item.userIdentityId}:${item.bookId}:${item.chapterId}`);
  const paragraphAnchors = dedupe(
    array(value.paragraphAnchors, isParagraphAnchor).filter(belongsToChapter),
    (item) => `${item.userIdentityId}:${item.id}`,
  );
  const validAnchors = new Set(paragraphAnchors.map((item) => `${item.userIdentityId}:${item.bookId}:${item.chapterId}:${item.id}`));
  const belongsToAnchor = (item: { userIdentityId: string; bookId: string; chapterId: string; paragraphAnchorId: string }): boolean =>
    belongsToChapter(item) && validAnchors.has(`${item.userIdentityId}:${item.bookId}:${item.chapterId}:${item.paragraphAnchorId}`);

  return {
    version: READING_STORE_VERSION,
    books,
    chapters,
    paragraphAnchors,
    progress: dedupe(array(value.progress, isReadingProgress).filter(belongsToAnchor), (item) => `${item.userIdentityId}:${item.bookId}`),
    annotations: dedupe(array(value.annotations, isReadingAnnotation).filter(belongsToAnchor), (item) => `${item.userIdentityId}:${item.id}`),
    preferences: dedupe(array(value.preferences, isReadingBookPreferences).filter(belongsToBook), (item) => `${item.userIdentityId}:${item.bookId}`),
    assetCleanupTasks: dedupe(array(value.assetCleanupTasks, isReadingAssetCleanupTask), (item) => `${item.userIdentityId}:${item.id}`),
  };
}
