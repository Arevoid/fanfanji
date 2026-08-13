export const READING_STORE_VERSION = 1 as const;

export type ReadingBookFormat = "txt" | "markdown";
export type ReadingBookStatus = "importing" | "ready" | "error" | "archived";
export type ReadingAnnotationKind = "bookmark" | "highlight" | "note" | "edit";

export interface ReadingBook {
  id: string;
  userIdentityId: string;
  assetId: string;
  contentHash: string;
  format: ReadingBookFormat;
  status: ReadingBookStatus;
  title: string;
  author?: string;
  description?: string;
  coverUrl?: string;
  sourceFileName: string;
  sourceMimeType: string;
  sourceEncoding: string;
  byteLength: number;
  wordCount: number;
  chapterCount: number;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  lastError?: string;
}

export interface ReadingChapter {
  id: string;
  userIdentityId: string;
  bookId: string;
  order: number;
  title: string;
  firstParagraphAnchorId?: string;
  lastParagraphAnchorId?: string;
  wordCount: number;
}

export interface ParagraphAnchor {
  id: string;
  userIdentityId: string;
  bookId: string;
  chapterId: string;
  ordinal: number;
  normalizedTextHash: string;
  characterStart: number;
  characterEnd: number;
}

export interface ReadingProgress {
  userIdentityId: string;
  bookId: string;
  chapterId: string;
  paragraphAnchorId: string;
  characterOffset: number;
  scrollOffsetHint?: number;
  percent: number;
  updatedAt: number;
}

export interface ReadingTextRange {
  start: number;
  end: number;
}

export interface ReadingAnnotation {
  id: string;
  userIdentityId: string;
  bookId: string;
  chapterId: string;
  paragraphAnchorId: string;
  kind: ReadingAnnotationKind;
  range?: ReadingTextRange;
  textSnapshot: string;
  color?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReadingBookPreferences {
  userIdentityId: string;
  bookId: string;
  fontAssetId?: string;
  fontSize?: number;
  textColor?: string;
  background?: string;
  lineHeight?: number;
  paragraphSpacing?: number;
  letterSpacing?: number;
  textAlign?: "left" | "justify";
  pageMargin?: number;
  firstLineIndent?: number;
  pageMode?: "scroll" | "horizontal";
  updatedAt: number;
}

export interface PersonalReadingScope {
  userIdentityId: string;
  bookId: string;
}

/** Reserved now so every future co-reading record starts with the full relation boundary. */
export interface ReadingRoomScope extends PersonalReadingScope {
  readingRoomId: string;
  relationId: string;
  characterId: string;
  conversationId: string;
}

export interface ReadingStore {
  version: typeof READING_STORE_VERSION;
  books: ReadingBook[];
  chapters: ReadingChapter[];
  paragraphAnchors: ParagraphAnchor[];
  progress: ReadingProgress[];
  annotations: ReadingAnnotation[];
  preferences: ReadingBookPreferences[];
  assetCleanupTasks: ReadingAssetCleanupTask[];
}

export interface ReadingBookAsset {
  assetId: string;
  userIdentityId: string;
  bookId: string;
  contentHash: string;
  mimeType: string;
  byteLength: number;
  blob: Blob;
  createdAt: number;
}

export interface ReadingAssetCleanupTask {
  id: string;
  assetId: string;
  userIdentityId: string;
  bookId: string;
  createdAt: number;
  lastAttemptAt?: number;
  lastError?: string;
}

export const EMPTY_READING_STORE: ReadingStore = {
  version: READING_STORE_VERSION,
  books: [],
  chapters: [],
  paragraphAnchors: [],
  progress: [],
  annotations: [],
  preferences: [],
  assetCleanupTasks: [],
};

export const createEmptyReadingStore = (): ReadingStore => ({
  version: READING_STORE_VERSION,
  books: [],
  chapters: [],
  paragraphAnchors: [],
  progress: [],
  annotations: [],
  preferences: [],
  assetCleanupTasks: [],
});
