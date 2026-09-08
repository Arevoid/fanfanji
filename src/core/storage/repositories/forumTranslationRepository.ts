import type { ForumTranslation } from "../../../types";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

const MAX_FORUM_TRANSLATIONS = 500;
const FORUM_TRANSLATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const isForumTranslation = (value: unknown): value is ForumTranslation => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string"
    && typeof entry.ownerIdentityId === "string"
    && (entry.contentType === "thread" || entry.contentType === "reply")
    && typeof entry.contentId === "string"
    && typeof entry.sourceContentHash === "string"
    && typeof entry.targetLanguage === "string"
    && (entry.translatedTitle === undefined || typeof entry.translatedTitle === "string")
    && typeof entry.translatedBody === "string"
    && typeof entry.createdAt === "number"
    && typeof entry.lastAccessedAt === "number";
};

export const loadForumTranslations = (): StorageResult<ForumTranslation[]> => {
  const loaded = readArray<unknown>(storageKeys.forumTranslations, []);
  return { ...loaded, value: loaded.value.filter(isForumTranslation) };
};

export const saveForumTranslations = (translations: ForumTranslation[]): StorageWriteResult =>
  writeArray(storageKeys.forumTranslations, translations);

export const getForumTranslation = (input: Pick<ForumTranslation,
  "ownerIdentityId" | "contentType" | "contentId" | "sourceContentHash" | "targetLanguage">,
): ForumTranslation | undefined => loadForumTranslations().value.find((entry) =>
  entry.ownerIdentityId === input.ownerIdentityId
  && entry.contentType === input.contentType
  && entry.contentId === input.contentId
  && entry.sourceContentHash === input.sourceContentHash
  && entry.targetLanguage === input.targetLanguage);

export const upsertForumTranslation = (entry: ForumTranslation): StorageWriteResult => {
  const existing = loadForumTranslations().value;
  const next = [
    entry,
    ...existing.filter((item) => !(item.ownerIdentityId === entry.ownerIdentityId
      && item.contentType === entry.contentType
      && item.contentId === entry.contentId
      && item.sourceContentHash === entry.sourceContentHash
      && item.targetLanguage === entry.targetLanguage)),
  ];
  return saveForumTranslations(pruneForumTranslationCache(next, entry.lastAccessedAt));
};

export const touchForumTranslation = (entry: ForumTranslation, now = Date.now()): StorageWriteResult =>
  upsertForumTranslation({ ...entry, lastAccessedAt: now });

export const deleteForumTranslationsForThread = (
  ownerIdentityId: string,
  threadId: string,
  replyIds: readonly string[] = [],
): StorageWriteResult => {
  const removedReplyIds = new Set(replyIds);
  const remaining = loadForumTranslations().value.filter((entry) => {
    const belongsToRemovedContent = entry.contentId === threadId || removedReplyIds.has(entry.contentId);
    return !(entry.ownerIdentityId === ownerIdentityId && belongsToRemovedContent);
  });
  return saveForumTranslations(remaining);
};

export const deleteForumTranslationForReply = (ownerIdentityId: string, replyId: string): StorageWriteResult =>
  saveForumTranslations(loadForumTranslations().value.filter((entry) =>
    !(entry.ownerIdentityId === ownerIdentityId && entry.contentType === "reply" && entry.contentId === replyId)));

export const clearForumTranslationsByIdentity = (ownerIdentityId: string): StorageWriteResult =>
  saveForumTranslations(loadForumTranslations().value.filter((entry) => entry.ownerIdentityId !== ownerIdentityId));

export const pruneForumTranslationCache = (
  translations: readonly ForumTranslation[],
  now = Date.now(),
): ForumTranslation[] => translations
  .filter((entry) => now - entry.lastAccessedAt <= FORUM_TRANSLATION_MAX_AGE_MS)
  .sort((left, right) => right.lastAccessedAt - left.lastAccessedAt)
  .slice(0, MAX_FORUM_TRANSLATIONS);

export const createForumTranslationHash = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${value.length}:${(hash >>> 0).toString(36)}`;
};
