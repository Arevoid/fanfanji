import type { ForumPublicAuthor, ForumReply, ForumThread, UserIdentity } from "../../types";

export interface ForumData {
  threads: ForumThread[];
  replies: ForumReply[];
}

export interface ForumThreadMetrics {
  effectiveReplyCount: number;
  maxFloor: number;
  latestReplyAt?: number;
  latestAuthorUpdateAt?: number;
  hasAuthorUpdate: boolean;
  hasUnreadAuthorUpdate: boolean;
  updatedAt: number;
  lastReplyExcerpt?: string;
}

const AUTOMATIC_THREAD_SOURCES = new Set<ForumThread["source"]>([
  "ai-character",
  "ai-character-anonymous",
  "ai-virtual",
  "virtual",
]);

/**
 * Stable display-only likes for generated public posts.  The number is a
 * popularity signal, not a fabricated reply count; readable floors remain the
 * canonical reply collection.
 */
export const getForumBaselineLikeCount = (
  threadId: string,
  source: ForumThread["source"],
): number => {
  if (!AUTOMATIC_THREAD_SOURCES.has(source)) return 0;
  let hash = 2166136261;
  for (const character of threadId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 10_000;
};

const getLatestLiveReplyAt = (
  thread: ForumThread,
  replies: readonly ForumReply[],
): number => replies
  .filter((reply) => reply.threadId === thread.id
    && reply.ownerIdentityId === thread.ownerIdentityId
    && !reply.isDeleted)
  .reduce((latest, reply) => Math.max(latest, reply.occurredAt), 0);

export const getForumThreadActivityAt = (
  thread: ForumThread,
  replies: readonly ForumReply[],
): number => Math.max(thread.createdAt, getLatestLiveReplyAt(thread, replies));

/**
 * Derives fields introduced after the original forum schema. The function is
 * deterministic so refreshes and backups never change a user's layout or
 * social counts. The normalized result is persisted by the next forum write.
 */
export const normalizeForumThreadEngagement = (
  threads: readonly ForumThread[],
  replies: readonly ForumReply[],
): ForumThread[] => threads.map((thread) => {
  const latestReplyAt = getLatestLiveReplyAt(thread, replies);
  const lastActivityAt = Math.max(thread.createdAt, latestReplyAt);
  const baseLikeCount = thread.baseLikeCount > 0
    ? thread.baseLikeCount
    : getForumBaselineLikeCount(thread.id, thread.source);
  return {
    ...thread,
    baseLikeCount,
    ...(thread.lastActivityAt === lastActivityAt ? {} : { lastActivityAt }),
  };
});

/** Derives list-card values from the canonical thread/reply collections. */
export const selectForumThreadMetrics = (
  thread: ForumThread,
  replies: readonly ForumReply[],
  lastVisitedAt?: number,
): ForumThreadMetrics => {
  const threadReplies = replies
    .filter((reply) => reply.threadId === thread.id && reply.ownerIdentityId === thread.ownerIdentityId)
    .sort((left, right) => left.floor - right.floor);
  const liveReplies = threadReplies.filter((reply) => !reply.isDeleted);
  const latest = liveReplies.reduce<ForumReply | undefined>((current, reply) =>
    !current || reply.occurredAt > current.occurredAt ? reply : current, undefined);
  const latestAuthorUpdate = liveReplies.reduce<ForumReply | undefined>((current, reply) =>
    reply.kind !== "author-update" || (current && current.occurredAt >= reply.occurredAt)
      ? current
      : reply, undefined);
  const activityAt = Math.max(
    thread.lastActivityAt || thread.createdAt,
    latest?.occurredAt || 0,
  );
  return {
    effectiveReplyCount: liveReplies.length,
    maxFloor: Math.max(1, ...threadReplies.map((reply) => reply.floor)),
    ...(latest ? { latestReplyAt: latest.occurredAt } : {}),
    ...(latestAuthorUpdate ? { latestAuthorUpdateAt: latestAuthorUpdate.occurredAt } : {}),
    hasAuthorUpdate: Boolean(latestAuthorUpdate),
    hasUnreadAuthorUpdate: Boolean(latestAuthorUpdate && (lastVisitedAt === undefined || latestAuthorUpdate.occurredAt > lastVisitedAt)),
    updatedAt: activityAt,
    ...(latest ? { lastReplyExcerpt: latest.body.replace(/\s+/g, " ").trim().slice(0, 120) } : {}),
  };
};

export const createForumPublicAuthor = (
  identity: UserIdentity,
  anonymous: boolean,
): ForumPublicAuthor => anonymous
  ? {
      displayName: "匿名用户",
      kind: "anonymous-user",
      isAnonymous: true,
    }
  : {
      displayName: identity.name || "用户",
      avatar: identity.avatar || undefined,
      kind: "user",
      isAnonymous: false,
    };

export const createForumThread = (input: {
  id: string;
  identity: UserIdentity;
  title: string;
  body: string;
  anonymous: boolean;
  now: number;
}): ForumThread => ({
  id: input.id,
  ownerIdentityId: input.identity.id,
  ...(input.anonymous ? {} : { authorUserId: input.identity.id }),
  publicAuthor: createForumPublicAuthor(input.identity, input.anonymous),
  title: input.title.trim(),
  body: input.body.trim(),
  source: input.anonymous ? "user-anonymous" : "user",
  occurredAt: input.now,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  replyCount: 0,
  createdAt: input.now,
  updatedAt: input.now,
  lastActivityAt: input.now,
});

export const nextForumReplyFloor = (
  replies: readonly ForumReply[],
  threadId: string,
): number => Math.max(1, ...replies.filter((reply) => reply.threadId === threadId).map((reply) => reply.floor)) + 1;

export const createForumReply = (input: {
  id: string;
  thread: ForumThread;
  existingReplies: readonly ForumReply[];
  identity: UserIdentity;
  body: string;
  anonymous: boolean;
  now: number;
  replyTo?: ForumReply;
}): ForumReply => ({
  id: input.id,
  threadId: input.thread.id,
  ownerIdentityId: input.thread.ownerIdentityId,
  ...(input.anonymous ? {} : { authorUserId: input.identity.id }),
  floor: nextForumReplyFloor(input.existingReplies, input.thread.id),
  kind: "reply",
  publicAuthor: createForumPublicAuthor(input.identity, input.anonymous),
  body: input.body.trim(),
  ...(input.replyTo ? {
    replyToReplyId: input.replyTo.id,
    replyToFloor: input.replyTo.floor,
    replyToAuthorName: input.replyTo.publicAuthor.displayName,
    quotedText: input.replyTo.isDeleted ? "该回复已删除" : input.replyTo.body.slice(0, 120),
  } : {}),
  source: input.anonymous ? "user-anonymous" : "user",
  occurredAt: input.now,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  createdAt: input.now,
  updatedAt: input.now,
});

export const getForumLikeCount = (
  value: Pick<ForumThread | ForumReply, "baseLikeCount" | "likedByIdentityIds">,
): number => Math.max(0, value.baseLikeCount) + new Set(value.likedByIdentityIds).size;

const toggleIdentityLike = (likedByIdentityIds: readonly string[], identityId: string): string[] => {
  const unique = new Set(likedByIdentityIds);
  if (unique.has(identityId)) unique.delete(identityId);
  else unique.add(identityId);
  return [...unique];
};

export const toggleForumThreadLike = (
  threads: readonly ForumThread[],
  threadId: string,
  ownerIdentityId: string,
  now = Date.now(),
): ForumThread[] => threads.map((thread) =>
  thread.id === threadId && thread.ownerIdentityId === ownerIdentityId
    ? { ...thread, likedByIdentityIds: toggleIdentityLike(thread.likedByIdentityIds, ownerIdentityId), updatedAt: now }
    : thread);

export const toggleForumReplyLike = (
  replies: readonly ForumReply[],
  replyId: string,
  ownerIdentityId: string,
  now = Date.now(),
): ForumReply[] => replies.map((reply) =>
  reply.id === replyId && reply.ownerIdentityId === ownerIdentityId && !reply.isDeleted
    ? { ...reply, likedByIdentityIds: toggleIdentityLike(reply.likedByIdentityIds, ownerIdentityId), updatedAt: now }
    : reply);

export const listForumThreadsForIdentity = (
  threads: readonly ForumThread[],
  ownerIdentityId: string,
  replies: readonly ForumReply[] = [],
): ForumThread[] => threads
  .filter((thread) => thread.ownerIdentityId === ownerIdentityId)
  .sort((left, right) => {
    const leftActivity = Math.max(left.lastActivityAt || left.createdAt, getLatestLiveReplyAt(left, replies));
    const rightActivity = Math.max(right.lastActivityAt || right.createdAt, getLatestLiveReplyAt(right, replies));
    return rightActivity - leftActivity
      || right.occurredAt - left.occurredAt
      || left.id.localeCompare(right.id);
  });

export const listForumRepliesForThread = (
  replies: readonly ForumReply[],
  thread: Pick<ForumThread, "id" | "ownerIdentityId">,
): ForumReply[] => replies
  .filter((reply) => reply.threadId === thread.id && reply.ownerIdentityId === thread.ownerIdentityId)
  .sort((left, right) => left.floor - right.floor);

export const appendForumReply = (
  threads: readonly ForumThread[],
  replies: readonly ForumReply[],
  reply: ForumReply,
): ForumData => ({
  threads: threads.map((thread) =>
    thread.id === reply.threadId && thread.ownerIdentityId === reply.ownerIdentityId
      ? {
          ...thread,
          replyCount: thread.replyCount + 1,
          updatedAt: reply.createdAt,
          lastActivityAt: Math.max(thread.lastActivityAt || thread.createdAt, reply.occurredAt),
        }
      : thread),
  replies: [...replies, reply],
});

export const deleteForumThread = (
  threads: readonly ForumThread[],
  replies: readonly ForumReply[],
  threadId: string,
  ownerIdentityId: string,
): ForumData => ({
  threads: threads.filter((thread) => !(thread.id === threadId && thread.ownerIdentityId === ownerIdentityId)),
  replies: replies.filter((reply) => !(reply.threadId === threadId && reply.ownerIdentityId === ownerIdentityId)),
});

export const tombstoneForumReply = (
  replies: readonly ForumReply[],
  replyId: string,
  ownerIdentityId: string,
  now = Date.now(),
): ForumReply[] => replies.map((reply) =>
  reply.id === replyId && reply.ownerIdentityId === ownerIdentityId
    ? {
        ...reply,
        body: "该回复已删除",
        isDeleted: true,
        deletedAt: now,
        updatedAt: now,
        likedByIdentityIds: [],
      }
    : reply);

export const clearForumDataByIdentity = (
  threads: readonly ForumThread[],
  replies: readonly ForumReply[],
  ownerIdentityId: string,
): ForumData => ({
  threads: threads.filter((thread) => thread.ownerIdentityId !== ownerIdentityId),
  replies: replies.filter((reply) => reply.ownerIdentityId !== ownerIdentityId),
});
