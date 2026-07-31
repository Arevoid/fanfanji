import type {
  ForumActivityTask,
  ForumDmConversation,
  ForumDmMessage,
  ForumDmTask,
  ForumActorRef,
  ForumActorState,
  ForumGenerationTask,
  ForumLikeHistoryRecord,
  ForumMutationEvent,
  ForumNotification,
  ForumPendingActivityEvent,
  ForumReply,
  ForumShare,
  ForumThread,
  ForumUserProfile,
  ForumVisitHistory,
} from "../../../types";
import { sanitizeStoredForumContent } from "../../../domain/forum/forumContentSafety";
import { compactForumState, estimateForumStorageUsage } from "../../../domain/forum/forumCapacity";
import { normalizeForumThreadEngagement } from "../../../domain/forum/forumData";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

export interface ForumStateSnapshot {
  revision: number;
  threads: ForumThread[];
  replies: ForumReply[];
  shares: ForumShare[];
  generationTasks: ForumGenerationTask[];
  actorStates: ForumActorState[];
  activityTasks: ForumActivityTask[];
  profiles: ForumUserProfile[];
  visitHistory: ForumVisitHistory[];
  likeHistory: ForumLikeHistoryRecord[];
  notifications: ForumNotification[];
  dmConversations: ForumDmConversation[];
  dmMessages: ForumDmMessage[];
  dmTasks: ForumDmTask[];
}

export interface ForumIdentitySnapshot extends ForumStateSnapshot {
  ownerIdentityId: string;
}

export type ForumStateMutation = Partial<Pick<ForumStateSnapshot,
  "threads" | "replies" | "shares" | "generationTasks" | "actorStates" | "activityTasks" | "profiles" | "visitHistory" | "likeHistory" | "notifications" | "dmConversations" | "dmMessages" | "dmTasks">>;

const forumListeners = new Set<() => void>();
const forumMutationListeners = new Set<(event: ForumMutationEvent) => void>();
const identitySnapshotCache = new Map<string, { revision: number; snapshot: ForumIdentitySnapshot }>();
let forumSnapshot: ForumStateSnapshot | null = null;
let forumRawFingerprint = "";
let forumRevision = 0;
let storageListenerAttached = false;
const forumStorageKeyValues: readonly string[] = [
  storageKeys.forumThreads,
  storageKeys.forumReplies,
  storageKeys.forumShares,
  storageKeys.forumGenerationTasks,
  storageKeys.forumActorStates,
  storageKeys.forumActivityTasks,
  storageKeys.forumProfiles,
  storageKeys.forumVisitHistory,
  storageKeys.forumLikeHistory,
  storageKeys.forumNotifications,
  storageKeys.forumDmConversations,
  storageKeys.forumDmMessages,
  storageKeys.forumDmTasks,
];

const getRawForumFingerprint = (): string => {
  if (typeof localStorage === "undefined") return "memory";
  return [
    storageKeys.forumThreads,
    storageKeys.forumReplies,
    storageKeys.forumShares,
    storageKeys.forumGenerationTasks,
    storageKeys.forumActorStates,
    storageKeys.forumActivityTasks,
    storageKeys.forumProfiles,
    storageKeys.forumVisitHistory,
    storageKeys.forumLikeHistory,
    storageKeys.forumNotifications,
    storageKeys.forumDmConversations,
    storageKeys.forumDmMessages,
    storageKeys.forumDmTasks,
  ].map((key) => localStorage.getItem(key) || "").join("\u0001");
};

const emitForumStateChanged = (): void => {
  identitySnapshotCache.clear();
  forumListeners.forEach((listener) => listener());
};

const attachStorageListener = (): void => {
  if (storageListenerAttached || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  storageListenerAttached = true;
  window.addEventListener("storage", (event) => {
    if (!event.key || !forumStorageKeyValues.includes(event.key)) return;
    forumSnapshot = null;
    forumRawFingerprint = "";
    forumRevision += 1;
    emitForumStateChanged();
  });
};

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

const isForumStoryArc = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const arc = value as Record<string, unknown>;
  return ["emotion", "campus", "mystery", "mild-horror", "fantasy", "urban-legend", "help", "rant", "encounter", "other"].includes(String(arc.category))
    && ["open", "resolved", "abandoned"].includes(String(arc.status))
    && Number.isInteger(arc.episode) && Number(arc.episode) >= 1
    && typeof arc.continuationProbability === "number"
    && (arc.lastUpdateAt === undefined || typeof arc.lastUpdateAt === "number")
    && (arc.nextUpdateAfter === undefined || typeof arc.nextUpdateAfter === "number")
    && (arc.publicRecap === undefined || typeof arc.publicRecap === "string");
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
    && typeof thread.updatedAt === "number"
    && (thread.lastActivityAt === undefined || typeof thread.lastActivityAt === "number")
    && (thread.storyArc === undefined || isForumStoryArc(thread.storyArc));
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
    && (reply.deletedAt === undefined || typeof reply.deletedAt === "number")
    && (reply.privateActor === undefined || isForumActorRef(reply.privateActor));
};

const isForumActorRef = (value: unknown): value is ForumActorRef => {
  if (!value || typeof value !== "object") return false;
  const actor = value as Record<string, unknown>;
  return (actor.kind === "relationship"
    && typeof actor.relationId === "string"
    && typeof actor.characterId === "string")
    || (actor.kind === "virtual" && typeof actor.virtualProfileId === "string");
};

const isForumActorState = (value: unknown): value is ForumActorState => {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return typeof state.ownerIdentityId === "string"
    && typeof state.threadId === "string"
    && typeof state.actorKey === "string"
    && isForumActorRef(state.actor)
    && isStringArray(state.recentReplyIds)
    && isStringArray(state.recentTopicFingerprints)
    && Array.isArray(state.hourlyReplyTimestamps)
    && state.hourlyReplyTimestamps.every((item) => typeof item === "number")
    && typeof state.updatedAt === "number";
};

const isPendingActivityEvent = (value: unknown): value is ForumPendingActivityEvent => {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  const target = event.replyTarget as Record<string, unknown> | undefined;
  const validTarget = target?.type === "thread"
    || (target?.type === "floor" && Number.isInteger(target.floor))
    || (target?.type === "batch" && typeof target.localId === "string");
  return typeof event.id === "string"
    && typeof event.ownerIdentityId === "string"
    && typeof event.threadId === "string"
    && typeof event.batchId === "string"
    && typeof event.localId === "string"
    && event.actorSlotSnapshot !== null
    && typeof event.actorSlotSnapshot === "object"
    && isForumActorRef((event.actorSlotSnapshot as Record<string, unknown>).actor)
    && (event.kind === "reply" || event.kind === "author-update")
    && typeof event.body === "string"
    && validTarget
    && typeof event.scheduledAt === "number"
    && ["pending", "released", "skipped"].includes(String(event.status))
    && typeof event.createdAt === "number"
    && typeof event.updatedAt === "number";
};

const isForumActivityTask = (value: unknown): value is ForumActivityTask => {
  if (!value || typeof value !== "object") return false;
  const task = value as Record<string, unknown>;
  return typeof task.id === "string"
    && typeof task.ownerIdentityId === "string"
    && typeof task.threadId === "string"
    && ["automatic", "manual-thread-refresh", "initial-replies", "like-engagement"].includes(String(task.trigger))
    && ["running", "succeeded", "failed", "blocked"].includes(String(task.status))
    && typeof task.startedAt === "number"
    && Array.isArray(task.pendingEvents)
    && task.pendingEvents.every(isPendingActivityEvent)
    && typeof task.createdAt === "number"
    && typeof task.updatedAt === "number";
};

const isForumUserProfile = (value: unknown): value is ForumUserProfile => {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.ownerIdentityId === "string"
    && typeof profile.displayName === "string"
    && (profile.avatar === undefined || typeof profile.avatar === "string")
    && (profile.avatarAssetId === undefined || typeof profile.avatarAssetId === "string")
    && (profile.bio === undefined || typeof profile.bio === "string")
    && typeof profile.createdAt === "number"
    && typeof profile.updatedAt === "number";
};

const isPublicThreadSnapshot = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return typeof snapshot.threadId === "string"
    && typeof snapshot.title === "string"
    && typeof snapshot.body === "string"
    && isPublicAuthor(snapshot.publicAuthor)
    && typeof snapshot.occurredAt === "number"
    && typeof snapshot.replyCount === "number"
    && Array.isArray(snapshot.replies);
};

const isForumVisitHistory = (value: unknown): value is ForumVisitHistory => {
  if (!value || typeof value !== "object") return false;
  const history = value as Record<string, unknown>;
  return typeof history.id === "string" && typeof history.ownerIdentityId === "string"
    && typeof history.threadId === "string" && typeof history.lastVisitedAt === "number"
    && typeof history.visitCount === "number" && isPublicThreadSnapshot(history.publicSnapshot);
};

const isForumLikeHistory = (value: unknown): value is ForumLikeHistoryRecord => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const snapshot = record.publicSnapshot as Record<string, unknown> | undefined;
  return typeof record.id === "string" && typeof record.ownerIdentityId === "string"
    && (record.targetType === "thread" || record.targetType === "reply")
    && typeof record.threadId === "string" && (record.replyId === undefined || typeof record.replyId === "string")
    && typeof record.likedAt === "number" && isPublicThreadSnapshot(snapshot?.thread)
    && (snapshot?.reply === undefined || typeof snapshot.reply === "object");
};

const isForumNotification = (value: unknown): value is ForumNotification => {
  if (!value || typeof value !== "object") return false;
  const notification = value as Record<string, unknown>;
  return typeof notification.id === "string" && typeof notification.eventKey === "string"
    && typeof notification.ownerIdentityId === "string"
    && (notification.type === "thread-reply" || notification.type === "reply-reply" || notification.type === "direct-message")
    && isPublicAuthor(notification.actorPublicSnapshot)
    && typeof notification.threadId === "string" && typeof notification.replyId === "string"
    && (notification.targetReplyId === undefined || typeof notification.targetReplyId === "string")
    && typeof notification.preview === "string" && typeof notification.occurredAt === "number"
    && (notification.readAt === undefined || typeof notification.readAt === "number")
    && (notification.conversationId === undefined || typeof notification.conversationId === "string");
};

const isForumDmActor = (value: unknown): boolean => Boolean(value && typeof value === "object" && ((value as Record<string, unknown>).kind === "virtual" && typeof (value as Record<string, unknown>).virtualProfileId === "string" || (value as Record<string, unknown>).kind === "relationship" && typeof (value as Record<string, unknown>).relationId === "string" && typeof (value as Record<string, unknown>).characterId === "string"));
const isForumDmConversation = (value: unknown): value is ForumDmConversation => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.ownerIdentityId === "string" && isForumDmActor(item.participant) && isPublicAuthor(item.participantPublicSnapshot) && typeof item.lastMessageAt === "number" && typeof item.unreadCount === "number" && typeof item.createdAt === "number" && typeof item.updatedAt === "number";
};
const isForumDmMessage = (value: unknown): value is ForumDmMessage => Boolean(value && typeof value === "object" && typeof (value as Record<string, unknown>).id === "string" && typeof (value as Record<string, unknown>).conversationId === "string" && typeof (value as Record<string, unknown>).ownerIdentityId === "string" && ["user", "participant"].includes(String((value as Record<string, unknown>).sender)) && typeof (value as Record<string, unknown>).body === "string" && typeof (value as Record<string, unknown>).occurredAt === "number" && typeof (value as Record<string, unknown>).createdAt === "number");
const isForumDmTask = (value: unknown): value is ForumDmTask => Boolean(value && typeof value === "object" && typeof (value as Record<string, unknown>).id === "string" && typeof (value as Record<string, unknown>).taskKey === "string" && typeof (value as Record<string, unknown>).ownerIdentityId === "string" && typeof (value as Record<string, unknown>).conversationId === "string" && ["running", "succeeded", "failed", "stale"].includes(String((value as Record<string, unknown>).status)) && typeof (value as Record<string, unknown>).startedAt === "number");

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

export const loadForumReplies = (): StorageResult<ForumReply[]> =>
  filterLoaded(readArray<unknown>(storageKeys.forumReplies, []), isForumReply);

/** Private local scheduling data. It is deliberately excluded from system backup. */
export const loadForumActorStates = (): StorageResult<ForumActorState[]> =>
  filterLoaded(readArray<unknown>(storageKeys.forumActorStates, []), isForumActorState);

export const loadForumActivityTasks = (): StorageResult<ForumActivityTask[]> =>
  filterLoaded(readArray<unknown>(storageKeys.forumActivityTasks, []), isForumActivityTask);

export const loadForumProfiles = (): StorageResult<ForumUserProfile[]> =>
  filterLoaded(readArray<unknown>(storageKeys.forumProfiles, []), isForumUserProfile);

export const loadForumVisitHistory = (): StorageResult<ForumVisitHistory[]> =>
  filterLoaded(readArray<unknown>(storageKeys.forumVisitHistory, []), isForumVisitHistory);

export const loadForumLikeHistory = (): StorageResult<ForumLikeHistoryRecord[]> =>
  filterLoaded(readArray<unknown>(storageKeys.forumLikeHistory, []), isForumLikeHistory);

export const loadForumNotifications = (): StorageResult<ForumNotification[]> =>
  filterLoaded(readArray<unknown>(storageKeys.forumNotifications, []), isForumNotification);
export const loadForumDmConversations = (): StorageResult<ForumDmConversation[]> => filterLoaded(readArray<unknown>(storageKeys.forumDmConversations, []), isForumDmConversation);
export const loadForumDmMessages = (): StorageResult<ForumDmMessage[]> => filterLoaded(readArray<unknown>(storageKeys.forumDmMessages, []), isForumDmMessage);
export const loadForumDmTasks = (): StorageResult<ForumDmTask[]> => filterLoaded(readArray<unknown>(storageKeys.forumDmTasks, []), isForumDmTask);

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

const buildForumSnapshot = (): ForumStateSnapshot => {
  const replies = loadForumReplies().value;
  const threads = normalizeForumThreadEngagement(loadForumThreads().value, replies);
  return {
  revision: forumRevision,
  threads,
  replies,
  shares: loadForumShares().value,
  generationTasks: loadForumGenerationTasks().value,
  actorStates: loadForumActorStates().value,
  activityTasks: loadForumActivityTasks().value,
  profiles: loadForumProfiles().value,
  visitHistory: loadForumVisitHistory().value,
  likeHistory: loadForumLikeHistory().value,
  notifications: loadForumNotifications().value,
  dmConversations: loadForumDmConversations().value,
  dmMessages: loadForumDmMessages().value,
  dmTasks: loadForumDmTasks().value,
  };
};

/** Returns a stable object until forum storage actually changes. */
export const getForumStateSnapshot = (): ForumStateSnapshot => {
  attachStorageListener();
  const fingerprint = getRawForumFingerprint();
  if (forumSnapshot && forumRawFingerprint === fingerprint) return forumSnapshot;
  forumRevision += 1;
  forumRawFingerprint = fingerprint;
  forumSnapshot = buildForumSnapshot();
  identitySnapshotCache.clear();
  return forumSnapshot;
};

export const getForumSnapshotForIdentity = (ownerIdentityId: string): ForumIdentitySnapshot => {
  const snapshot = getForumStateSnapshot();
  const cached = identitySnapshotCache.get(ownerIdentityId);
  if (cached && cached.revision === snapshot.revision) return cached.snapshot;
  const identitySnapshot: ForumIdentitySnapshot = {
    ...snapshot,
    ownerIdentityId,
    threads: snapshot.threads.filter((thread) => thread.ownerIdentityId === ownerIdentityId),
    replies: snapshot.replies.filter((reply) => reply.ownerIdentityId === ownerIdentityId),
    shares: snapshot.shares.filter((share) => share.ownerIdentityId === ownerIdentityId),
    generationTasks: snapshot.generationTasks.filter((task) => task.ownerIdentityId === ownerIdentityId),
    actorStates: snapshot.actorStates.filter((state) => state.ownerIdentityId === ownerIdentityId),
    activityTasks: snapshot.activityTasks.filter((task) => task.ownerIdentityId === ownerIdentityId),
    profiles: snapshot.profiles.filter((profile) => profile.ownerIdentityId === ownerIdentityId),
    visitHistory: snapshot.visitHistory.filter((entry) => entry.ownerIdentityId === ownerIdentityId),
    likeHistory: snapshot.likeHistory.filter((entry) => entry.ownerIdentityId === ownerIdentityId),
    notifications: snapshot.notifications.filter((entry) => entry.ownerIdentityId === ownerIdentityId),
    dmConversations: snapshot.dmConversations.filter((entry) => entry.ownerIdentityId === ownerIdentityId),
    dmMessages: snapshot.dmMessages.filter((entry) => entry.ownerIdentityId === ownerIdentityId),
    dmTasks: snapshot.dmTasks.filter((entry) => entry.ownerIdentityId === ownerIdentityId),
  };
  identitySnapshotCache.set(ownerIdentityId, { revision: snapshot.revision, snapshot: identitySnapshot });
  return identitySnapshot;
};

export const subscribeForumState = (listener: () => void): (() => void) => {
  attachStorageListener();
  forumListeners.add(listener);
  return () => forumListeners.delete(listener);
};

/** Public-safe events for future notification consumers. No private actor data is emitted. */
export const subscribeForumMutation = (listener: (event: ForumMutationEvent) => void): (() => void) => {
  forumMutationListeners.add(listener);
  return () => forumMutationListeners.delete(listener);
};

/** Explicitly refreshes subscribers after an external restore has changed localStorage. */
export const notifyForumStateChanged = (): ForumStateSnapshot => {
  forumSnapshot = null;
  forumRawFingerprint = "";
  const snapshot = getForumStateSnapshot();
  emitForumStateChanged();
  return snapshot;
};

/**
 * Writes every supplied collection as one logical mutation. Subscribers only
 * observe a new revision after every storage write has succeeded.
 */
export const commitForumMutation = (mutation: ForumStateMutation, events: readonly ForumMutationEvent[] = []): {
  success: boolean;
  snapshot?: ForumStateSnapshot;
  error?: StorageWriteResult["error"];
} => {
  const current = getForumStateSnapshot();
  const next: ForumStateMutation = {
    ...(mutation.threads ? { threads: mutation.threads } : {}),
    ...(mutation.replies ? { replies: mutation.replies } : {}),
    ...(mutation.shares ? { shares: mutation.shares } : {}),
    ...(mutation.generationTasks ? { generationTasks: mutation.generationTasks } : {}),
    ...(mutation.actorStates ? { actorStates: mutation.actorStates } : {}),
    ...(mutation.activityTasks ? { activityTasks: mutation.activityTasks } : {}),
    ...(mutation.profiles ? { profiles: mutation.profiles } : {}),
    ...(mutation.visitHistory ? { visitHistory: mutation.visitHistory } : {}),
    ...(mutation.likeHistory ? { likeHistory: mutation.likeHistory } : {}),
    ...(mutation.notifications ? { notifications: mutation.notifications } : {}),
    ...(mutation.dmConversations ? { dmConversations: mutation.dmConversations } : {}),
    ...(mutation.dmMessages ? { dmMessages: mutation.dmMessages } : {}),
    ...(mutation.dmTasks ? { dmTasks: mutation.dmTasks } : {}),
  };
  const previous: ForumStateMutation = {
    ...(next.threads ? { threads: current.threads } : {}),
    ...(next.replies ? { replies: current.replies } : {}),
    ...(next.shares ? { shares: current.shares } : {}),
    ...(next.generationTasks ? { generationTasks: current.generationTasks } : {}),
    ...(next.actorStates ? { actorStates: current.actorStates } : {}),
    ...(next.activityTasks ? { activityTasks: current.activityTasks } : {}),
    ...(next.profiles ? { profiles: current.profiles } : {}),
    ...(next.visitHistory ? { visitHistory: current.visitHistory } : {}),
    ...(next.likeHistory ? { likeHistory: current.likeHistory } : {}),
    ...(next.notifications ? { notifications: current.notifications } : {}),
    ...(next.dmConversations ? { dmConversations: current.dmConversations } : {}),
    ...(next.dmMessages ? { dmMessages: current.dmMessages } : {}),
    ...(next.dmTasks ? { dmTasks: current.dmTasks } : {}),
  };
  const writers: Array<() => StorageWriteResult> = [];
  if (next.threads) writers.push(() => writeArray(storageKeys.forumThreads, next.threads!));
  if (next.replies) writers.push(() => writeArray(storageKeys.forumReplies, next.replies!));
  if (next.shares) writers.push(() => writeArray(storageKeys.forumShares, next.shares!));
  if (next.generationTasks) writers.push(() => writeArray(storageKeys.forumGenerationTasks, next.generationTasks!));
  if (next.actorStates) writers.push(() => writeArray(storageKeys.forumActorStates, next.actorStates!));
  if (next.activityTasks) writers.push(() => writeArray(storageKeys.forumActivityTasks, next.activityTasks!));
  if (next.profiles) writers.push(() => writeArray(storageKeys.forumProfiles, next.profiles!));
  if (next.visitHistory) writers.push(() => writeArray(storageKeys.forumVisitHistory, next.visitHistory!));
  if (next.likeHistory) writers.push(() => writeArray(storageKeys.forumLikeHistory, next.likeHistory!));
  if (next.notifications) writers.push(() => writeArray(storageKeys.forumNotifications, next.notifications!));
  if (next.dmConversations) writers.push(() => writeArray(storageKeys.forumDmConversations, next.dmConversations!));
  if (next.dmMessages) writers.push(() => writeArray(storageKeys.forumDmMessages, next.dmMessages!));
  if (next.dmTasks) writers.push(() => writeArray(storageKeys.forumDmTasks, next.dmTasks!));
  for (const write of writers) {
    const result = write();
    if (!result.success) {
      if (previous.threads) writeArray(storageKeys.forumThreads, previous.threads);
      if (previous.replies) writeArray(storageKeys.forumReplies, previous.replies);
      if (previous.shares) writeArray(storageKeys.forumShares, previous.shares);
      if (previous.generationTasks) writeArray(storageKeys.forumGenerationTasks, previous.generationTasks);
      if (previous.actorStates) writeArray(storageKeys.forumActorStates, previous.actorStates);
      if (previous.activityTasks) writeArray(storageKeys.forumActivityTasks, previous.activityTasks);
      if (previous.profiles) writeArray(storageKeys.forumProfiles, previous.profiles);
      if (previous.visitHistory) writeArray(storageKeys.forumVisitHistory, previous.visitHistory);
      if (previous.likeHistory) writeArray(storageKeys.forumLikeHistory, previous.likeHistory);
      if (previous.notifications) writeArray(storageKeys.forumNotifications, previous.notifications);
      if (previous.dmConversations) writeArray(storageKeys.forumDmConversations, previous.dmConversations);
      if (previous.dmMessages) writeArray(storageKeys.forumDmMessages, previous.dmMessages);
      if (previous.dmTasks) writeArray(storageKeys.forumDmTasks, previous.dmTasks);
      return { success: false, ...(result.error ? { error: result.error } : {}) };
    }
  }
  forumRevision += 1;
  forumRawFingerprint = getRawForumFingerprint();
  forumSnapshot = {
    revision: forumRevision,
    threads: next.threads || current.threads,
    replies: next.replies || current.replies,
    shares: next.shares || current.shares,
    generationTasks: next.generationTasks || current.generationTasks,
    actorStates: next.actorStates || current.actorStates,
    activityTasks: next.activityTasks || current.activityTasks,
    profiles: next.profiles || current.profiles,
    visitHistory: next.visitHistory || current.visitHistory,
    likeHistory: next.likeHistory || current.likeHistory,
    notifications: next.notifications || current.notifications,
    dmConversations: next.dmConversations || current.dmConversations,
    dmMessages: next.dmMessages || current.dmMessages,
    dmTasks: next.dmTasks || current.dmTasks,
  };
  emitForumStateChanged();
  events.forEach((event) => forumMutationListeners.forEach((listener) => listener(event)));
  return { success: true, snapshot: forumSnapshot };
};

export const saveForumThreads = (threads: ForumThread[]): StorageWriteResult => {
  const result = commitForumMutation({ threads });
  return { success: result.success, ...(result.error ? { error: result.error } : {}) };
};

export const saveForumReplies = (replies: ForumReply[]): StorageWriteResult => {
  const result = commitForumMutation({ replies });
  return { success: result.success, ...(result.error ? { error: result.error } : {}) };
};

export const saveForumShares = (shares: ForumShare[]): StorageWriteResult => {
  const result = commitForumMutation({ shares });
  return { success: result.success, ...(result.error ? { error: result.error } : {}) };
};

/** Removes one identity's forum-owned public state without affecting other identities. */
export const cleanupForumIdentityData = (ownerIdentityId: string): StorageWriteResult => {
  const current = getForumStateSnapshot();
  const result = commitForumMutation({
    threads: current.threads.filter((item) => item.ownerIdentityId !== ownerIdentityId),
    replies: current.replies.filter((item) => item.ownerIdentityId !== ownerIdentityId),
    shares: current.shares.filter((item) => item.ownerIdentityId !== ownerIdentityId),
    generationTasks: current.generationTasks.filter((item) => item.ownerIdentityId !== ownerIdentityId),
    actorStates: current.actorStates.filter((item) => item.ownerIdentityId !== ownerIdentityId),
    activityTasks: current.activityTasks.filter((item) => item.ownerIdentityId !== ownerIdentityId),
    profiles: current.profiles.filter((item) => item.ownerIdentityId !== ownerIdentityId),
    visitHistory: current.visitHistory.filter((item) => item.ownerIdentityId !== ownerIdentityId),
    likeHistory: current.likeHistory.filter((item) => item.ownerIdentityId !== ownerIdentityId),
    notifications: current.notifications.filter((item) => item.ownerIdentityId !== ownerIdentityId),
    dmConversations: current.dmConversations.filter((item) => item.ownerIdentityId !== ownerIdentityId),
    dmMessages: current.dmMessages.filter((item) => item.ownerIdentityId !== ownerIdentityId),
    dmTasks: current.dmTasks.filter((item) => item.ownerIdentityId !== ownerIdentityId),
  });
  return { success: result.success, ...(result.error ? { error: result.error } : {}) };
};

/** Relation-scoped DM cleanup; public forum content and virtual/NPC conversations remain intact. */
export const cleanupForumDmForRelations = (relationIds: readonly string[]): StorageWriteResult => {
  const removed = new Set(relationIds); const current = getForumStateSnapshot();
  const ids = new Set(current.dmConversations.filter((item) => item.participant.kind === "relationship" && removed.has(item.participant.relationId)).map((item) => item.id));
  const result = commitForumMutation({
    dmConversations: current.dmConversations.filter((item) => !ids.has(item.id)),
    dmMessages: current.dmMessages.filter((item) => !ids.has(item.conversationId)),
    dmTasks: current.dmTasks.filter((item) => !ids.has(item.conversationId)),
    notifications: current.notifications.filter((item) => !item.conversationId || !ids.has(item.conversationId)),
  });
  return { success: result.success, ...(result.error ? { error: result.error } : {}) };
};

/** Explicit, idempotent capacity maintenance. It never removes user-authored forum posts or replies. */
export const compactPersistedForumState = (now = Date.now()): { success: boolean; beforeBytes: number; afterBytes: number; error?: StorageWriteResult["error"] } => {
  const current = getForumStateSnapshot();
  const beforeBytes = estimateForumStorageUsage(current).bytes;
  const compacted = compactForumState({ ...current, now });
  const result = commitForumMutation(compacted);
  return { success: result.success, beforeBytes, afterBytes: result.success ? estimateForumStorageUsage(result.snapshot).bytes : beforeBytes, ...(result.error ? { error: result.error } : {}) };
};

/** Deterministic hydration repair for duplicate IDs and dangling references. Public history is retained where possible. */
export const repairForumState = (): StorageWriteResult => {
  const current = getForumStateSnapshot();
  const unique = <T>(items: readonly T[], key: (item: T) => string) => [...new Map(items.map((item) => [key(item), item])).values()];
  const threads = unique(current.threads, (item) => item.id);
  const threadIds = new Set(threads.map((item) => item.id));
  const replies = unique(current.replies, (item) => item.id).filter((item) => threadIds.has(item.threadId)).sort((a, b) => a.floor - b.floor);
  const conversationIds = new Set(unique(current.dmConversations, (item) => item.id).map((item) => item.id));
  const result = commitForumMutation({
    threads,
    replies,
    shares: unique(current.shares, (item) => item.id),
    generationTasks: unique(current.generationTasks, (item) => item.id),
    actorStates: unique(current.actorStates, (item) => `${item.ownerIdentityId}:${item.threadId}:${item.actorKey}`).filter((item) => threadIds.has(item.threadId)),
    activityTasks: unique(current.activityTasks, (item) => item.id).filter((item) => threadIds.has(item.threadId)),
    profiles: unique(current.profiles, (item) => item.ownerIdentityId),
    visitHistory: unique(current.visitHistory, (item) => item.id),
    likeHistory: unique(current.likeHistory, (item) => item.id),
    notifications: unique(current.notifications, (item) => item.eventKey),
    dmConversations: unique(current.dmConversations, (item) => item.id),
    dmMessages: unique(current.dmMessages, (item) => item.id).filter((item) => conversationIds.has(item.conversationId)),
    dmTasks: unique(current.dmTasks, (item) => item.id).filter((item) => conversationIds.has(item.conversationId)),
  });
  return { success: result.success, ...(result.error ? { error: result.error } : {}) };
};

export const saveForumGenerationTasks = (tasks: ForumGenerationTask[]): StorageWriteResult => {
  const result = commitForumMutation({ generationTasks: tasks });
  return { success: result.success, ...(result.error ? { error: result.error } : {}) };
};

export const saveForumData = (threads: ForumThread[], replies: ForumReply[]): {
  threads: StorageWriteResult;
  replies: StorageWriteResult;
  success: boolean;
} => {
  const result = commitForumMutation({ threads, replies });
  const writeResult: StorageWriteResult = { success: result.success, ...(result.error ? { error: result.error } : {}) };
  return { threads: writeResult, replies: writeResult, success: result.success };
};

export const saveForumDataAtomically = (threads: ForumThread[], replies: ForumReply[]): { success: boolean } =>
  ({ success: commitForumMutation({ threads, replies }).success });

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
