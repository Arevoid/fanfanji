import type { ForumPublicAuthor, ForumReply, ForumThread, UserIdentity } from "../../types";

export interface ForumData {
  threads: ForumThread[];
  replies: ForumReply[];
}

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
): ForumThread[] => threads
  .filter((thread) => thread.ownerIdentityId === ownerIdentityId)
  .sort((left, right) => right.occurredAt - left.occurredAt);

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
      ? { ...thread, replyCount: thread.replyCount + 1, updatedAt: reply.createdAt }
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
