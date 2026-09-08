import assert from "node:assert/strict";
import { saveReadingStore } from "../src/core/storage/repositories/readingRepository";
import { getReadingBookBible, listReadingAnalysisEntities, listReadingAnalysisTasks, loadReadingAnalysisStore } from "../src/core/storage/repositories/readingAnalysisRepository";
import { commitReadingChapterAnalysisResult, createReadingAnalysisTask, markReadingAnalysisCheckpoint, markReadingAnalysisFailed, prepareChapterAnalysisRequest, saveAnalysisEntity, saveBookBible, startReadingAnalysisTask } from "../src/features/reading/analysis/readingAnalysis";
import { buildReadingChapterAnalysisPrompt, validateReadingChapterAnalysisResponse } from "../src/features/reading/analysis/readingAnalysisProtocol";
import type { ReadingBook, ReadingStore } from "../src/domain/reading/types";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}
const localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
const book: ReadingBook = { id: "analysis-book", userIdentityId: "identity-a", assetId: "asset", contentHash: "hash", format: "txt", status: "ready", title: "Analysis", sourceFileName: "analysis.txt", sourceMimeType: "text/plain", sourceEncoding: "utf-8", byteLength: 10, wordCount: 20, chapterCount: 2, createdAt: 1, updatedAt: 1 };
const store: ReadingStore = { version: 1, books: [book], chapters: [
  { id: "analysis-chapter-1", userIdentityId: "identity-a", bookId: book.id, order: 0, title: "第一章", wordCount: 10 },
  { id: "analysis-chapter-2", userIdentityId: "identity-a", bookId: book.id, order: 1, title: "第二章", wordCount: 10 },
], paragraphAnchors: [], progress: [], annotations: [], preferences: [], assetCleanupTasks: [] };
saveReadingStore(store);
const scope = { userIdentityId: "identity-a", bookId: book.id };
const task = createReadingAnalysisTask({ scope, type: "chapter_summary", inputVersion: "hash-v1", chapterIds: ["analysis-chapter-1", "analysis-chapter-2"], now: 2 });
assert.equal(startReadingAnalysisTask(scope, task.id, 3).status, "running");
assert.equal(markReadingAnalysisCheckpoint({ scope, taskId: task.id, chapterId: "analysis-chapter-1", now: 4 }).checkpointIndex, 1);
assert.equal(markReadingAnalysisFailed({ scope, taskId: task.id, error: "API 暂时不可用", now: 5 }).status, "failed");
const resumed = startReadingAnalysisTask(scope, task.id, 6);
assert.equal(resumed.attempts, 2, "retry resumes from persisted checkpoint");
assert.equal(markReadingAnalysisCheckpoint({ scope, taskId: task.id, chapterId: "analysis-chapter-2", now: 7 }).status, "completed");
const request = prepareChapterAnalysisRequest({ scope, chapterId: "analysis-chapter-1", chapterText: "第一章正文".repeat(4000), previousSummary: "前文" });
assert.equal(request.chapterId, "analysis-chapter-1");
assert.equal(request.chapterText.length, 16000, "chapter payload is bounded");
assert.throws(() => prepareChapterAnalysisRequest({ scope: { userIdentityId: "identity-b", bookId: book.id }, chapterId: "analysis-chapter-1", chapterText: "越权" }), /找不到|不属于/);
saveAnalysisEntity({ ...scope, id: "reading-entity-identity-a-analysis-book-character-主角", kind: "character", name: "主角", aliases: [], summary: "核心人物", chapterIds: ["analysis-chapter-1"], attributes: {}, confidence: 0.9, analysisVersion: "v1", createdAt: 8, updatedAt: 8 });
assert.equal(listReadingAnalysisEntities(scope, "character").length, 1);
saveBookBible({ ...scope, id: "bible-a", version: 1, analysisVersion: "v1", premise: "一个关于选择的故事", worldRules: ["规则一"], storyLines: [], coreCharacterIds: ["entity-char"], keyLocationIds: [], keyFactionIds: [], timeline: [], isUserEdited: true, createdAt: 9, updatedAt: 9 });
assert.equal(getReadingBookBible(scope)?.premise, "一个关于选择的故事");
const otherScope = { userIdentityId: "identity-b", bookId: book.id };
assert.equal(listReadingAnalysisTasks(otherScope).length, 0);
assert.equal(loadReadingAnalysisStore().value.tasks.length, 1);
const prompt = buildReadingChapterAnalysisPrompt({ scope, chapterId: "analysis-chapter-1", chapterTitle: "第一章", chapterText: "章节正文", previousSummary: "前文摘要" });
assert.doesNotMatch(prompt.system, /identity-a|analysis-book/);
assert.equal(prompt.chapterTextLength, 4);
const validated = validateReadingChapterAnalysisResponse({ summary: "本章摘要", keyPoints: ["关键点"], entities: [{ kind: "character", name: "主角", aliases: ["他"], summary: "人物出现", attributes: { role: "视角人物" }, confidence: 0.8 }], premise: "故事 premise", worldRules: ["规则"] });
assert.equal(validated.ok, true);
if (!validated.ok) throw new Error("expected valid analysis response");
const commitTask = createReadingAnalysisTask({ scope, type: "entity_index", inputVersion: "hash-v1", chapterIds: ["analysis-chapter-1"], now: 10 });
startReadingAnalysisTask(scope, commitTask.id, 11);
const committed = commitReadingChapterAnalysisResult({ scope, taskId: commitTask.id, chapterId: "analysis-chapter-1", sourceHash: "chapter-hash", analysisVersion: "analysis-v1", result: validated.value, now: 12 });
assert.equal(committed.task.status, "completed");
assert.equal(getReadingBookBible(scope)?.premise, "故事 premise");
assert.equal(listReadingAnalysisEntities(scope, "character").length, 1);
assert.equal(validateReadingChapterAnalysisResponse({ summary: "", entities: [] }).ok, false);
console.log("reading analysis task, checkpoint and scope tests passed");
