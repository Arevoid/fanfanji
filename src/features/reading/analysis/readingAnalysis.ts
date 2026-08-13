import { loadReadingStore } from "../../../core/storage/repositories/readingRepository";
import { getReadingBookBible, getReadingAnalysisTask, listReadingAnalysisEntities, listReadingAnalysisTasks, listReadingChapterSummaries, saveReadingAnalysisEntity, saveReadingAnalysisTask, saveReadingBookBible, saveReadingChapterSummary } from "../../../core/storage/repositories/readingAnalysisRepository";
import type { ReadingAnalysisEntity, ReadingAnalysisScope, ReadingAnalysisTask, ReadingAnalysisTaskType, ReadingBookBible, ReadingChapterSummary } from "../../../domain/reading/analysisTypes";

const createId = (prefix: string): string => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const trim = (value: string, max: number): string => value.trim().slice(0, max);

export class ReadingAnalysisError extends Error {
  constructor(message: string, public readonly code: "missing-book" | "missing-chapter" | "invalid-input" | "missing-task" | "storage") {
    super(message);
    this.name = "ReadingAnalysisError";
  }
}

function requireBook(scope: ReadingAnalysisScope) {
  const book = loadReadingStore().value.books.find((candidate) => candidate.id === scope.bookId && candidate.userIdentityId === scope.userIdentityId);
  if (!book) throw new ReadingAnalysisError("当前身份下找不到这本书", "missing-book");
  return book;
}

function requireChapter(scope: ReadingAnalysisScope, chapterId: string) {
  requireBook(scope);
  const chapter = loadReadingStore().value.chapters.find((candidate) => candidate.id === chapterId && candidate.bookId === scope.bookId && candidate.userIdentityId === scope.userIdentityId);
  if (!chapter) throw new ReadingAnalysisError("章节不属于当前身份的这本书", "missing-chapter");
  return chapter;
}

function persist<T>(result: { success: boolean; error?: string }, value: T): T {
  if (!result.success) throw new ReadingAnalysisError(result.error || "分析数据保存失败", "storage");
  return value;
}

export function createReadingAnalysisTask(input: { scope: ReadingAnalysisScope; type: ReadingAnalysisTaskType; inputVersion: string; chapterIds: string[]; now?: number }): ReadingAnalysisTask {
  requireBook(input.scope);
  const chapterIds = Array.from(new Set(input.chapterIds.filter((chapterId) => { try { requireChapter(input.scope, chapterId); return true; } catch { return false; } })));
  if (!chapterIds.length || !input.inputVersion.trim()) throw new ReadingAnalysisError("分析任务必须包含章节和输入版本", "invalid-input");
  const now = input.now ?? Date.now();
  const task: ReadingAnalysisTask = { ...input.scope, id: createId("reading-analysis"), type: input.type, status: "queued", inputVersion: trim(input.inputVersion, 200), chapterIds, completedChapterIds: [], checkpointIndex: 0, attempts: 0, createdAt: now, updatedAt: now };
  return persist(saveReadingAnalysisTask(task), task);
}

export function startReadingAnalysisTask(scope: ReadingAnalysisScope, taskId: string, now = Date.now()): ReadingAnalysisTask {
  const task = getReadingAnalysisTask(scope, taskId);
  if (!task) throw new ReadingAnalysisError("分析任务不存在", "missing-task");
  return persist(saveReadingAnalysisTask({ ...task, status: "running", attempts: task.attempts + 1, updatedAt: now }), { ...task, status: "running", attempts: task.attempts + 1, updatedAt: now });
}

export function markReadingAnalysisCheckpoint(input: { scope: ReadingAnalysisScope; taskId: string; chapterId: string; now?: number }): ReadingAnalysisTask {
  const task = getReadingAnalysisTask(input.scope, input.taskId);
  if (!task) throw new ReadingAnalysisError("分析任务不存在", "missing-task");
  if (!task.chapterIds.includes(input.chapterId)) throw new ReadingAnalysisError("检查点章节不属于当前任务", "invalid-input");
  const completed = Array.from(new Set([...task.completedChapterIds, input.chapterId]));
  const checkpointIndex = Math.max(task.checkpointIndex, task.chapterIds.indexOf(input.chapterId) + 1);
  const status = completed.length >= task.chapterIds.length ? "completed" : "running";
  const next = { ...task, completedChapterIds: completed, checkpointIndex, status: status as ReadingAnalysisTask["status"], updatedAt: input.now ?? Date.now(), lastError: undefined };
  return persist(saveReadingAnalysisTask(next), next);
}

export function markReadingAnalysisFailed(input: { scope: ReadingAnalysisScope; taskId: string; error: string; now?: number }): ReadingAnalysisTask {
  const task = getReadingAnalysisTask(input.scope, input.taskId);
  if (!task) throw new ReadingAnalysisError("分析任务不存在", "missing-task");
  const next = { ...task, status: "failed" as const, lastError: trim(input.error, 2000) || "未知分析错误", updatedAt: input.now ?? Date.now() };
  return persist(saveReadingAnalysisTask(next), next);
}

export interface ReadingChapterAnalysisRequest {
  scope: ReadingAnalysisScope;
  chapterId: string;
  chapterTitle: string;
  chapterText: string;
  previousSummary?: string;
  nextSummary?: string;
}

/** Builds a bounded, chapter-scoped API payload; never accepts a whole-book body. */
export function prepareChapterAnalysisRequest(input: { scope: ReadingAnalysisScope; chapterId: string; chapterText: string; previousSummary?: string; nextSummary?: string }): ReadingChapterAnalysisRequest {
  const chapter = requireChapter(input.scope, input.chapterId);
  const chapterText = trim(input.chapterText, 16000);
  if (!chapterText) throw new ReadingAnalysisError("章节正文不能为空", "invalid-input");
  return { scope: input.scope, chapterId: chapter.id, chapterTitle: chapter.title, chapterText, previousSummary: input.previousSummary ? trim(input.previousSummary, 2000) : undefined, nextSummary: input.nextSummary ? trim(input.nextSummary, 2000) : undefined };
}

export function saveChapterSummary(summary: ReadingChapterSummary): ReadingChapterSummary {
  requireChapter(summary, summary.chapterId);
  if (!summary.summary.trim() || !summary.sourceHash.trim()) throw new ReadingAnalysisError("章节摘要缺少正文或来源哈希", "invalid-input");
  return persist(saveReadingChapterSummary({ ...summary, summary: trim(summary.summary, 8000), keyPoints: summary.keyPoints.slice(0, 30).map((item) => trim(item, 500)), updatedAt: Date.now() }), summary);
}

export function saveAnalysisEntity(entity: ReadingAnalysisEntity): ReadingAnalysisEntity {
  requireBook(entity);
  if (!entity.name.trim() || !entity.summary.trim()) throw new ReadingAnalysisError("索引实体缺少名称或摘要", "invalid-input");
  return persist(saveReadingAnalysisEntity({ ...entity, name: trim(entity.name, 300), summary: trim(entity.summary, 4000), aliases: entity.aliases.slice(0, 30).map((item) => trim(item, 200)), updatedAt: Date.now() }), entity);
}

export function saveBookBible(bible: ReadingBookBible): ReadingBookBible {
  requireBook(bible);
  if (!bible.premise.trim()) throw new ReadingAnalysisError("Book Bible 至少需要故事 premise", "invalid-input");
  const current = getReadingBookBible(bible);
  const next = { ...bible, version: Math.max(current?.version ?? 0, bible.version), premise: trim(bible.premise, 6000), updatedAt: Date.now() };
  return persist(saveReadingBookBible(next), next);
}

export { getReadingBookBible, listReadingAnalysisEntities, listReadingAnalysisTasks, listReadingChapterSummaries };
