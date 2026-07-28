import type { ForumGenerationTask, ForumReply, ForumShare, ForumThread } from "../../../types";
import { sanitizeStoredForumContent } from "../../../domain/forum/forumContentSafety";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isPublicAuthor = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const author = value as Record<string, unknown>;
  const validKinds = new Set(["user", "anonymous-user", "ai-character", "anonymous-ai", "virtual"]);
  return typeof author.displayName === "string"
    && typeof author.kind === "string"
    && validKinds.has(author.kind)
    && typeof author.isAnonymous === "boolean"
    && (author.avatar === undefined || typeof author.avatar === "string");
};

const isForumThread = (value: unknown): value is ForumThread => {
  if (!value || typeof value !== "object") return false;
  const thread = value as Record<string, unknown>;
  return typeof thread.id === "string"
    && typeof thread.ownerIdentityId === "string"
    && isPublicAuthor(thread.publicAuthor)
    && typeof thread.title === "string"
    && typeof thread.body === "string"
    && ["user", "user-anonymous", "ai-character", "ai-character-anonymous", "ai-virtual", "virtual"].includes(String(thread.source))
    && typeof thread.occurredAt === "number"
    && typeof thread.baseLikeCount === "number"
    && isStringArray(thread.likedByIdentityIds)
    && typeof thread.replyCount === "number"
    && typeof thread.createdAt === "number"
    && typeof thread.updatedAt === "number";
};

const isForumReply = (value: unknown): value is ForumReply => {
  if (!value || typeof value !== "object") return false;
  const reply = value as Record<string, unknown>;
  return typeof reply.id === "string"
    && typeof reply.threadId === "string"
    && typeof reply.ownerIdentityId === "string"
    && typeof reply.floor === "number"
    && Number.isInteger(reply.floor)
    && reply.floor >= 2
    && (reply.kind === undefined || reply.kind === "reply" || reply.kind === "author-update")
    && isPublicAuthor(reply.publicAuthor)
    && typeof reply.body === "string"
    && ["user", "user-anonymous", "ai-character", "ai-character-anonymous", "ai-virtual"].includes(String(reply.source))
    && typeof reply.occurredAt === "number"
    && typeof reply.baseLikeCount === "number"
    && isStringArray(reply.likedByIdentityIds)
    && typeof reply.createdAt === "number"
    && typeof reply.updatedAt === "number"
    && (reply.replyToReplyId === undefined || typeof reply.replyToReplyId === "string")
    && (reply.replyToFloor === undefined || typeof reply.replyToFloor === "number")
    && (reply.replyToAuthorName === undefined || typeof reply.replyToAuthorName === "string")
    && (reply.quotedText === undefined || typeof reply.quotedText === "string")
    && (reply.isDeleted === undefined || typeof reply.isDeleted === "boolean")
    && (reply.deletedAt === undefined || typeof reply.deletedAt === "number");
};

const filterLoaded = <T>(
  loaded: StorageResult<unknown[]>,
  predicate: (value: unknown) => value is T,
): StorageResult<T[]> => ({
  ...loaded,
  value: loaded.value.filter(predicate),
});

export const loadForumThreads = (
  validRelationIds?: ReadonlySet<string>,
): StorageResult<ForumThread[]> => {
  const loaded = filterLoaded(readArray<unknown>(storageKeys.forumThreads, []), isForumThread);
  return {
    ...loaded,
    value: loaded.value.map((thread) => {
      const {
        privateAuthorRelationId,
        privateAuthorCharacterId,
        ...publicAndPersistedFields
      } = thread;
      const validPrivateRelation = typeof privateAuthorRelationId === "string"
        && (!validRelationIds || validRelationIds.has(privateAuthorRelationId));
      return {
        ...publicAndPersistedFields,
        ...(validPrivateRelation ? {
          privateAuthorRelationId,
          ...(typeof privateAuthorCharacterId === "string" ? { privateAuthorCharacterId } : {}),
        } : {}),
      };
    }),
  };
};

export const saveForumThreads = (threads: ForumThread[]): StorageWriteResult =>
  writeArray(storageKeys.forumThreads, threads);

export const loadForumReplies = (): StorageResult<ForumReply[]> =>
  filterLoaded(readArray<unknown>(storageKeys.forumReplies, []), isForumReply);

export const saveForumReplies = (replies: ForumReply[]): StorageWriteResult =>
  writeArray(storageKeys.forumReplies, replies);

const isForumShare = (value: unknown): value is ForumShare => {
  if (!value || typeof value !== "object") return false;
  const share = value as Record<string, unknown>;
  const snapshot = share.publicSnapshot;
  if (!snapshot || typeof snapshot !== "object") return false;
  const publicSnapshot = snapshot as Record<string, unknown>;
  return typeof share.id === "string"
    && typeof share.ownerIdentityId === "string"
    && typeof share.threadId === "string"
    && typeof share.targetRelationId === "string"
    && typeof share.conversationId === "string"
    && typeof share.sourceMessageId === "string"
    && typeof share.createdAt === "number"
    && typeof publicSnapshot.threadId === "string"
    && typeof publicSnapshot.title === "string"
    && typeof publicSnapshot.body === "string"
    && isPublicAuthor(publicSnapshot.publicAuthor)
    && typeof publicSnapshot.occurredAt === "number"
    && typeof publicSnapshot.replyCount === "number"
    && Array.isArray(publicSnapshot.replies)
    && publicSnapshot.replies.every((item) => {
      if (!item || typeof item !== "object") return false;
      const reply = item as Record<string, unknown>;
      return typeof reply.id === "string"
        && typeof reply.floor === "number"
        && (reply.kind === undefined || reply.kind === "reply" || reply.kind === "author-update")
        && typeof reply.body === "string"
        && isPublicAuthor(reply.publicAuthor)
        && typeof reply.occurredAt === "number";
    });
};

export const loadForumShares = (): StorageResult<ForumShare[]> =>
  (() => {
    const loaded = readArray<unknown>(storageKeys.forumShares, []);
    return {
      ...loaded,
      value: loaded.value.filter(isForumShare).map((share) => ({
        id: share.id,
        ownerIdentityId: share.ownerIdentityId,
        threadId: share.threadId,
        targetRelationId: share.targetRelationId,
        conversationId: share.conversationId,
        sourceMessageId: share.sourceMessageId,
        publicSnapshot: {
          threadId: share.publicSnapshot.threadId,
          title: share.publicSnapshot.title,
          body: share.publicSnapshot.body,
          publicAuthor: {
            displayName: share.publicSnapshot.publicAuthor.displayName,
            ...(share.publicSnapshot.publicAuthor.avatar ? { avatar: share.publicSnapshot.publicAuthor.avatar } : {}),
            kind: share.publicSnapshot.publicAuthor.kind,
            isAnonymous: share.publicSnapshot.publicAuthor.isAnonymous,
          },
          occurredAt: share.publicSnapshot.occurredAt,
          replyCount: share.publicSnapshot.replyCount,
          replies: share.publicSnapshot.replies.map((reply) => ({
            id: reply.id,
            floor: reply.floor,
            ...(reply.kind ? { kind: reply.kind } : {}),
            body: reply.body,
            publicAuthor: {
              displayName: reply.publicAuthor.displayName,
              ...(reply.publicAuthor.avatar ? { avatar: reply.publicAuthor.avatar } : {}),
              kind: reply.publicAuthor.kind,
              isAnonymous: reply.publicAuthor.isAnonymous,
            },
            ...(reply.replyToFloor !== undefined ? { replyToFloor: reply.replyToFloor } : {}),
            ...(reply.replyToAuthorName ? { replyToAuthorName: reply.replyToAuthorName } : {}),
            ...(reply.quotedText ? { quotedText: reply.quotedText } : {}),
            occurredAt: reply.occurredAt,
          })),
        },
        createdAt: share.createdAt,
      })),
    };
  })();

export const saveForumShares = (shares: ForumShare[]): StorageWriteResult =>
  writeArray(storageKeys.forumShares, shares);

const FORUM_TASK_STALE_MS = 10 * 60 * 1000;

const isForumGenerationTask = (value: unknown): value is ForumGenerationTask => {
  if (!value || typeof value !== "object") return false;
  const task = value as Record<string, unknown>;
  return typeof task.id === "string"
    && typeof task.taskKey === "string"
    && typeof task.ownerIdentityId === "string"
    && ["refresh", "initial-replies", "lazy", "like-engagement", "manual-thread-refresh"].includes(String(task.trigger))
    && ["running", "succeeded", "failed", "stale"].includes(String(task.status))
    && typeof task.startedAt === "number"
    && typeof task.createdAt === "number"
    && typeof task.updatedAt === "number"
    && (task.relationId === undefined || typeof task.relationId === "string")
    && (task.characterId === undefined || typeof task.characterId === "string")
    && (task.threadId === undefined || typeof task.threadId === "string")
    && (task.completedAt === undefined || typeof task.completedAt === "number")
    && (task.retryAfter === undefined || typeof task.retryAfter === "number");
};

export const loadForumGenerationTasks = (
  validRelationIds?: ReadonlySet<string>,
  now = Date.now(),
): StorageResult<ForumGenerationTask[]> => {
  const loaded = readArray<unknown>(storageKeys.forumGenerationTasks, []);
  return {
    ...loaded,
    value: loaded.value
      .filter(isForumGenerationTask)
      .filter((task) => !task.relationId || !validRelationIds || validRelationIds.has(task.relationId))
      .map((task) => ({
        id: task.id,
        taskKey: task.taskKey,
        ownerIdentityId: task.ownerIdentityId,
        ...(task.relationId ? { relationId: task.relationId } : {}),
        ...(task.characterId ? { characterId: task.characterId } : {}),
        ...(task.threadId ? { threadId: task.threadId } : {}),
        trigger: task.trigger,
        status: task.status === "running" && now - task.updatedAt >= FORUM_TASK_STALE_MS ? "stale" : task.status,
        startedAt: task.startedAt,
        ...(task.completedAt !== undefined ? { completedAt: task.completedAt } : {}),
        ...(task.retryAfter !== undefined ? { retryAfter: task.retryAfter } : {}),
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      })),
  };
};

export const saveForumGenerationTasks = (tasks: ForumGenerationTask[]): StorageWriteResult =>
  writeArray(storageKeys.forumGenerationTasks, tasks);

export const saveForumData = (
  threads: ForumThread[],
  replies: ForumReply[],
): { threads: StorageWriteResult; replies: StorageWriteResult; success: boolean } => {
  const threadResult = saveForumThreads(threads);
  const replyResult = saveForumReplies(replies);
  return {
    threads: threadResult,
    replies: replyResult,
    success: threadResult.success && replyResult.success,
  };
};

export const saveForumDataAtomically = (
  threads: ForumThread[],
  replies: ForumReply[],
): { success: boolean } => {
  const previousThreads = loadForumThreads().value;
  const previousReplies = loadForumReplies().value;
  const threadResult = saveForumThreads(threads);
  if (!threadResult.success) return { success: false };
  const replyResult = saveForumReplies(replies);
  if (replyResult.success) return { success: true };
  saveForumThreads(previousThreads);
  saveForumReplies(previousReplies);
  return { success: false };
};

export const loadForumDataSafely = (input: {
  validRelationIds?: ReadonlySet<string>;
  protectedNames: readonly string[];
}): { threads: ForumThread[]; replies: ForumReply[]; sanitized: boolean } => {
  const loadedThreads = loadForumThreads(input.validRelationIds).value;
  const loadedReplies = loadForumReplies().value;
  const safe = sanitizeStoredForumContent({
    threads: loadedThreads,
    replies: loadedReplies,
    protectedNames: input.protectedNames,
  });
  if (safe.changed) saveForumDataAtomically(safe.threads, safe.replies);
  return {
    threads: safe.threads,
    replies: safe.replies,
    sanitized: safe.changed,
  };
};
