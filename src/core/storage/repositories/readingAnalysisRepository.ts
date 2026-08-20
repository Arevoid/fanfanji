import { normalizeReadingAnalysisStore } from "../../../domain/reading/analysisNormalization";
import { createEmptyReadingAnalysisStore, type ReadingAnalysisEntity, type ReadingAnalysisScope, type ReadingAnalysisStore, type ReadingAnalysisTask, type ReadingBookBible, type ReadingChapterSummary } from "../../../domain/reading/analysisTypes";
import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

const sameScope = (left: ReadingAnalysisScope, right: ReadingAnalysisScope): boolean => left.userIdentityId === right.userIdentityId && left.bookId === right.bookId;

export function loadReadingAnalysisStore(): StorageResult<ReadingAnalysisStore> {
  const loaded = readJson<unknown>(storageKeys.readingAnalysisStore, createEmptyReadingAnalysisStore());
  return { ...loaded, value: normalizeReadingAnalysisStore(loaded.value) };
}

export function saveReadingAnalysisStore(store: ReadingAnalysisStore): StorageWriteResult {
  return writeJson(storageKeys.readingAnalysisStore, normalizeReadingAnalysisStore(store));
}

export function listReadingAnalysisTasks(scope: ReadingAnalysisScope): ReadingAnalysisTask[] {
  return loadReadingAnalysisStore().value.tasks.filter((task) => sameScope(task, scope)).sort((left, right) => right.updatedAt - left.updatedAt);
}

export function getReadingAnalysisTask(scope: ReadingAnalysisScope, taskId: string): ReadingAnalysisTask | undefined {
  return listReadingAnalysisTasks(scope).find((task) => task.id === taskId);
}

export function saveReadingAnalysisTask(task: ReadingAnalysisTask): StorageWriteResult {
  const store = loadReadingAnalysisStore().value;
  return saveReadingAnalysisStore({ ...store, tasks: [...store.tasks.filter((candidate) => candidate.id !== task.id || !sameScope(candidate, task)), task] });
}

export function listReadingChapterSummaries(scope: ReadingAnalysisScope): ReadingChapterSummary[] {
  return loadReadingAnalysisStore().value.chapterSummaries.filter((summary) => sameScope(summary, scope)).sort((left, right) => left.chapterOrder - right.chapterOrder);
}

export function saveReadingChapterSummary(summary: ReadingChapterSummary): StorageWriteResult {
  const store = loadReadingAnalysisStore().value;
  return saveReadingAnalysisStore({ ...store, chapterSummaries: [...store.chapterSummaries.filter((candidate) => !(candidate.id === summary.id && sameScope(candidate, summary))), summary] });
}

export function listReadingAnalysisEntities(scope: ReadingAnalysisScope, kind?: ReadingAnalysisEntity["kind"]): ReadingAnalysisEntity[] {
  return loadReadingAnalysisStore().value.entities.filter((entity) => sameScope(entity, scope) && (!kind || entity.kind === kind)).sort((left, right) => left.name.localeCompare(right.name));
}

export function saveReadingAnalysisEntity(entity: ReadingAnalysisEntity): StorageWriteResult {
  const store = loadReadingAnalysisStore().value;
  return saveReadingAnalysisStore({ ...store, entities: [...store.entities.filter((candidate) => !(candidate.id === entity.id && sameScope(candidate, entity))), entity] });
}

export function getReadingBookBible(scope: ReadingAnalysisScope): ReadingBookBible | undefined {
  return loadReadingAnalysisStore().value.bookBibles.find((bible) => sameScope(bible, scope));
}

export function saveReadingBookBible(bible: ReadingBookBible): StorageWriteResult {
  const store = loadReadingAnalysisStore().value;
  return saveReadingAnalysisStore({ ...store, bookBibles: [...store.bookBibles.filter((candidate) => !sameScope(candidate, bible)), bible] });
}
