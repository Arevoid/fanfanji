import type { DiaryDraft, DiaryEntry, DiaryGenerationTask, DiaryShare, DiaryTranslation } from "../../../types";
import { isValidDiaryEntry } from "../../../domain/diary/diaryValidation";
import { createDiaryContentHash } from "../../../domain/diary/diaryData";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
let stopStorageSync: (() => void) | undefined;
const isString = (value: unknown): value is string => typeof value === "string";
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validShare = (value: unknown): value is DiaryShare => Boolean(value && typeof value === "object" && (() => {
  const item = value as Record<string, unknown>; const snapshot = item.snapshot as Record<string, unknown> | undefined;
  return isString(item.id) && isString(item.diaryEntryId) && isString(item.ownerIdentityId) && isString(item.targetRelationId) && isString(item.conversationId) && isString(item.messageId) && isFiniteNumber(item.createdAt)
    && snapshot && (snapshot.authorType === "user" || snapshot.authorType === "character") && isString(snapshot.authorName) && isString(snapshot.body) && isFiniteNumber(snapshot.occurredAt);
})());
const validTask = (value: unknown): value is DiaryGenerationTask => Boolean(value && typeof value === "object" && (() => {
  const item = value as Record<string, unknown>;
  return isString(item.id) && isString(item.ownerIdentityId) && isString(item.relationId) && isString(item.taskKey) && (item.trigger === "lazy" || item.trigger === "manual") && ["running", "completed", "failed"].includes(String(item.status)) && isFiniteNumber(item.startedAt) && isFiniteNumber(item.updatedAt);
})());
const validTranslation = (value: unknown): value is DiaryTranslation => Boolean(value && typeof value === "object" && (() => {
  const item = value as Record<string, unknown>;
  return isString(item.id) && isString(item.ownerIdentityId) && isString(item.diaryEntryId) && isString(item.sourceContentHash) && isString(item.targetLanguage) && isString(item.translatedBody) && isFiniteNumber(item.createdAt) && isFiniteNumber(item.lastAccessedAt);
})());
const validDraft = (value: unknown): value is DiaryDraft => Boolean(value && typeof value === "object" && (() => {
  const item = value as Record<string, unknown>;
  return isString(item.id) && isString(item.ownerIdentityId) && isString(item.body) && Array.isArray(item.tags) && item.tags.every(isString) && isFiniteNumber(item.occurredAt) && isFiniteNumber(item.updatedAt);
})());
const load = <T>(key: string, predicate: (value: unknown) => value is T): StorageResult<T[]> => {
  const value = readArray<unknown>(key, []); return { ...value, value: value.value.filter(predicate) };
};
const save = <T>(key: string, value: T[]): StorageWriteResult => { const result = writeArray(key, value); if (result.success) emit(); return result; };

export const subscribeDiaryState = (listener: () => void): (() => void) => {
  listeners.add(listener);
  if (!stopStorageSync && typeof window !== "undefined") {
    const keys = new Set<string>(Object.values(storageKeys).filter((key) => typeof key === "string") as string[]);
    const onStorage = (event: StorageEvent) => { if (event.key && keys.has(event.key)) emit(); };
    window.addEventListener("storage", onStorage);
    stopStorageSync = () => window.removeEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) { stopStorageSync?.(); stopStorageSync = undefined; }
  };
};
export const loadDiaryEntries = (): StorageResult<DiaryEntry[]> => load(storageKeys.diaryEntries, isValidDiaryEntry);
export const saveDiaryEntries = (entries: DiaryEntry[]): StorageWriteResult => save(storageKeys.diaryEntries, entries);
export const loadDiaryShares = (): StorageResult<DiaryShare[]> => load(storageKeys.diaryShares, validShare);
export const saveDiaryShares = (shares: DiaryShare[]): StorageWriteResult => save(storageKeys.diaryShares, shares);
export const loadDiaryGenerationTasks = (): StorageResult<DiaryGenerationTask[]> => load(storageKeys.diaryGenerationTasks, validTask);
export const saveDiaryGenerationTasks = (tasks: DiaryGenerationTask[]): StorageWriteResult => save(storageKeys.diaryGenerationTasks, tasks);
export const loadDiaryTranslations = (): StorageResult<DiaryTranslation[]> => load(storageKeys.diaryTranslations, validTranslation);
export const saveDiaryTranslations = (translations: DiaryTranslation[]): StorageWriteResult => save(storageKeys.diaryTranslations, translations);
export const loadDiaryDrafts = (): StorageResult<DiaryDraft[]> => load(storageKeys.diaryDrafts, validDraft);
export const saveDiaryDrafts = (drafts: DiaryDraft[]): StorageWriteResult => save(storageKeys.diaryDrafts, drafts);

export const getDiaryTranslation = (entry: DiaryEntry, targetLanguage: string): DiaryTranslation | undefined => {
  const hash = createDiaryContentHash(entry);
  return loadDiaryTranslations().value.find((item) => item.ownerIdentityId === entry.ownerIdentityId && item.diaryEntryId === entry.id && item.sourceContentHash === hash && item.targetLanguage === targetLanguage);
};
export const upsertDiaryTranslation = (translation: DiaryTranslation): StorageWriteResult => saveDiaryTranslations([
  translation,
  ...loadDiaryTranslations().value.filter((item) => !(item.ownerIdentityId === translation.ownerIdentityId && item.diaryEntryId === translation.diaryEntryId && item.sourceContentHash === translation.sourceContentHash && item.targetLanguage === translation.targetLanguage)),
].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt).slice(0, 500));
export const removeDiaryEntryArtifacts = (entryId: string): void => {
  saveDiaryTranslations(loadDiaryTranslations().value.filter((item) => item.diaryEntryId !== entryId));
  saveDiaryDrafts(loadDiaryDrafts().value.filter((item) => item.entryId !== entryId));
};
