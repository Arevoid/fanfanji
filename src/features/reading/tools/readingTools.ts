import { loadReadingStore, saveReadingStore } from "../../../core/storage/repositories/readingRepository";
import { createId } from "../../../core/id/createId";
import type { StorageResult, StorageWriteResult } from "../../../core/storage/storageTypes";
import type { ReadingAnnotation, ReadingBookPreferences, ReadingStore } from "../../../domain/reading/types";
import type { ReadingBookContent, ReadingParagraphView } from "../reader/readingReader";

export interface ReadingToolDependencies {
  loadStore: () => StorageResult<ReadingStore>;
  saveStore: (store: ReadingStore) => StorageWriteResult;
  now: () => number;
  createId: (prefix: string) => string;
}

const defaultDependencies: ReadingToolDependencies = {
  loadStore: loadReadingStore,
  saveStore: saveReadingStore,
  now: () => Date.now(),
  createId,
};

const requireStore = (dependencies: ReadingToolDependencies): ReadingStore => {
  const loaded = dependencies.loadStore();
  if (!loaded.valid) throw new Error("阅读数据当前不可用");
  return loaded.value;
};

const save = (dependencies: ReadingToolDependencies, store: ReadingStore): void => {
  const result = dependencies.saveStore(store);
  if (!result.success) throw new Error(`阅读工具数据保存失败：${result.error || "unknown"}`);
};

export const DEFAULT_READING_PREFERENCES = {
  fontSize: 18,
  textColor: "#2f2b25",
  background: "#f6f1e7",
  lineHeight: 2.05,
  paragraphSpacing: 20,
  letterSpacing: 0.025,
  textAlign: "justify" as const,
  pageMargin: 24,
  firstLineIndent: 2,
  pageMode: "scroll" as const,
};

export function getReadingBookPreferences(userIdentityId: string, bookId: string, dependencies: Pick<ReadingToolDependencies, "loadStore"> = defaultDependencies): ReadingBookPreferences {
  const stored = dependencies.loadStore().value.preferences.find((item) => item.userIdentityId === userIdentityId && item.bookId === bookId);
  return { userIdentityId, bookId, ...DEFAULT_READING_PREFERENCES, ...stored, updatedAt: stored?.updatedAt || 0 };
}

export function saveReadingBookPreferences(
  input: ReadingBookPreferences,
  dependencies: ReadingToolDependencies = defaultDependencies,
): ReadingBookPreferences {
  const store = requireStore(dependencies);
  if (!store.books.some((book) => book.userIdentityId === input.userIdentityId && book.id === input.bookId)) throw new Error("书籍不属于当前身份");
  const sanitized: ReadingBookPreferences = {
    userIdentityId: input.userIdentityId,
    bookId: input.bookId,
    fontAssetId: input.fontAssetId || undefined,
    fontSize: Math.min(Math.max(input.fontSize ?? 18, 14), 30),
    textColor: input.textColor || DEFAULT_READING_PREFERENCES.textColor,
    background: input.background || DEFAULT_READING_PREFERENCES.background,
    lineHeight: Math.min(Math.max(input.lineHeight ?? 2.05, 1.4), 2.8),
    paragraphSpacing: Math.min(Math.max(input.paragraphSpacing ?? 20, 6), 40),
    letterSpacing: Math.min(Math.max(input.letterSpacing ?? 0.025, 0), 0.16),
    textAlign: input.textAlign === "left" ? "left" : "justify",
    pageMargin: Math.min(Math.max(input.pageMargin ?? 24, 12), 48),
    firstLineIndent: Math.min(Math.max(input.firstLineIndent ?? 2, 0), 3),
    pageMode: input.pageMode === "horizontal" ? "horizontal" : "scroll",
    updatedAt: dependencies.now(),
  };
  save(dependencies, {
    ...store,
    preferences: [...store.preferences.filter((item) => !(item.userIdentityId === input.userIdentityId && item.bookId === input.bookId)), sanitized],
  });
  return sanitized;
}

export function getReadingAnnotations(userIdentityId: string, bookId: string, dependencies: Pick<ReadingToolDependencies, "loadStore"> = defaultDependencies): ReadingAnnotation[] {
  const loaded = dependencies.loadStore();
  if (!loaded.valid) return [];
  return loaded.value.annotations.filter((item) => item.userIdentityId === userIdentityId && item.bookId === bookId);
}

export function toggleReadingBookmark(
  input: { userIdentityId: string; bookId: string; chapterId: string; paragraph: ReadingParagraphView },
  dependencies: ReadingToolDependencies = defaultDependencies,
): { active: boolean; annotation?: ReadingAnnotation } {
  const store = requireStore(dependencies);
  const existing = store.annotations.find((item) => item.userIdentityId === input.userIdentityId && item.bookId === input.bookId && item.paragraphAnchorId === input.paragraph.anchor.id && item.kind === "bookmark");
  if (existing) {
    save(dependencies, { ...store, annotations: store.annotations.filter((item) => item.id !== existing.id || item.userIdentityId !== input.userIdentityId) });
    return { active: false };
  }
  return { active: true, annotation: createReadingAnnotation({ ...input, kind: "bookmark" }, dependencies) };
}

export function createReadingAnnotation(
  input: { userIdentityId: string; bookId: string; chapterId: string; paragraph: ReadingParagraphView; kind: "bookmark" | "highlight" | "note"; note?: string; color?: string; start?: number; end?: number },
  dependencies: ReadingToolDependencies = defaultDependencies,
): ReadingAnnotation {
  const store = requireStore(dependencies);
  const anchor = store.paragraphAnchors.find((item) => item.userIdentityId === input.userIdentityId && item.bookId === input.bookId && item.chapterId === input.chapterId && item.id === input.paragraph.anchor.id);
  if (!anchor) throw new Error("段落不属于当前身份下的书籍");
  const start = Math.min(Math.max(input.start ?? 0, 0), input.paragraph.text.length);
  const end = Math.min(Math.max(input.end ?? input.paragraph.text.length, start), input.paragraph.text.length);
  const now = dependencies.now();
  const annotation: ReadingAnnotation = {
    id: dependencies.createId("reading-annotation"),
    userIdentityId: input.userIdentityId,
    bookId: input.bookId,
    chapterId: input.chapterId,
    paragraphAnchorId: anchor.id,
    kind: input.kind,
    range: input.kind === "bookmark" ? undefined : { start, end },
    textSnapshot: input.paragraph.text.slice(start, end) || input.paragraph.text,
    color: input.kind === "highlight" ? (input.color || "#f7d774") : undefined,
    note: input.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  save(dependencies, { ...store, annotations: [...store.annotations, annotation] });
  return annotation;
}

const READING_EDIT_PREFIX = "__reading_edit_v1__";

export function getReadingParagraphEditText(annotation: ReadingAnnotation | undefined): string | undefined {
  if (!annotation || annotation.kind !== "edit" || !annotation.note?.startsWith(READING_EDIT_PREFIX)) return undefined;
  return annotation.note.slice(READING_EDIT_PREFIX.length);
}

/** Stores one latest, identity-local full paragraph revision without mutating the uploaded source asset. */
export function saveReadingParagraphEdit(
  input: { userIdentityId: string; bookId: string; chapterId: string; paragraph: ReadingParagraphView; replacementText: string },
  dependencies: ReadingToolDependencies = defaultDependencies,
): ReadingAnnotation {
  const store = requireStore(dependencies);
  const anchor = store.paragraphAnchors.find((item) => item.userIdentityId === input.userIdentityId && item.bookId === input.bookId && item.chapterId === input.chapterId && item.id === input.paragraph.anchor.id);
  if (!anchor) throw new Error("段落不属于当前身份下的书籍");
  const now = dependencies.now();
  const existing = store.annotations.find((item) => item.userIdentityId === input.userIdentityId && item.bookId === input.bookId && item.paragraphAnchorId === anchor.id && item.kind === "edit");
  const annotation: ReadingAnnotation = {
    id: existing?.id || dependencies.createId("reading-paragraph-edit"),
    userIdentityId: input.userIdentityId,
    bookId: input.bookId,
    chapterId: input.chapterId,
    paragraphAnchorId: anchor.id,
    kind: "edit",
    range: { start: 0, end: input.paragraph.text.length },
    textSnapshot: existing?.textSnapshot || input.paragraph.text,
    note: `${READING_EDIT_PREFIX}${input.replacementText}`,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  save(dependencies, {
    ...store,
    annotations: [...store.annotations.filter((item) => !(item.userIdentityId === input.userIdentityId && item.bookId === input.bookId && item.paragraphAnchorId === anchor.id && item.kind === "edit")), annotation],
  });
  return annotation;
}

export function applyReadingParagraphEdits(content: ReadingBookContent, annotations: readonly ReadingAnnotation[]): ReadingBookContent {
  const edits = new Map<string, string>();
  annotations
    .filter((item) => item.kind === "edit")
    .sort((left, right) => left.updatedAt - right.updatedAt)
    .forEach((item) => {
      const replacement = getReadingParagraphEditText(item);
      if (replacement !== undefined) edits.set(item.paragraphAnchorId, replacement);
    });
  if (edits.size === 0) return content;
  return {
    ...content,
    chapters: content.chapters.map((chapterView) => ({
      ...chapterView,
      paragraphs: chapterView.paragraphs.map((paragraph) => edits.has(paragraph.anchor.id) ? { ...paragraph, text: edits.get(paragraph.anchor.id)! } : paragraph),
    })),
  };
}

export function deleteReadingAnnotation(userIdentityId: string, annotationId: string, dependencies: ReadingToolDependencies = defaultDependencies): void {
  const store = requireStore(dependencies);
  save(dependencies, { ...store, annotations: store.annotations.filter((item) => !(item.userIdentityId === userIdentityId && item.id === annotationId)) });
}

export interface ReadingSearchResult {
  chapterId: string;
  chapterTitle: string;
  paragraph: ReadingParagraphView;
  matchStart: number;
  snippet: string;
}

export function searchReadingContent(content: ReadingBookContent, query: string, limit = 100): ReadingSearchResult[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const results: ReadingSearchResult[] = [];
  for (const chapterView of content.chapters) {
    for (const paragraph of chapterView.paragraphs) {
      const matchStart = paragraph.text.toLocaleLowerCase().indexOf(needle);
      if (matchStart < 0) continue;
      const start = Math.max(0, matchStart - 24);
      const end = Math.min(paragraph.text.length, matchStart + needle.length + 36);
      results.push({
        chapterId: chapterView.chapter.id,
        chapterTitle: chapterView.chapter.title,
        paragraph,
        matchStart,
        snippet: `${start > 0 ? "…" : ""}${paragraph.text.slice(start, end)}${end < paragraph.text.length ? "…" : ""}`,
      });
      if (results.length >= limit) return results;
    }
  }
  return results;
}
