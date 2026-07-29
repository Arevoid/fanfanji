import type { ForumLikeHistoryRecord, ForumNotification, ForumReply, ForumReplyPublicSnapshot, ForumThread, ForumThreadPublicSnapshot, ForumUserProfile, ForumVisitHistory, UserIdentity } from "../../types";

export const MAX_FORUM_VISITS = 200;
export const MAX_FORUM_LIKES = 300;
export const MAX_FORUM_NOTIFICATIONS = 300;

export const createForumProfile = (identity: UserIdentity, now = Date.now()): ForumUserProfile => ({
  ownerIdentityId: identity.id,
  displayName: identity.name || "用户",
  ...(identity.avatar ? { avatar: identity.avatar } : {}),
  bio: "",
  createdAt: now,
  updatedAt: now,
});

export const toPublicReplySnapshot = (reply: ForumReply): ForumReplyPublicSnapshot => ({
  id: reply.id,
  floor: reply.floor,
  body: reply.body,
  publicAuthor: reply.publicAuthor,
  occurredAt: reply.occurredAt,
  ...(reply.isDeleted ? { isDeleted: true } : {}),
});

export const toPublicThreadSnapshot = (thread: ForumThread, replies: readonly ForumReply[]): ForumThreadPublicSnapshot => ({
  threadId: thread.id,
  title: thread.title,
  body: thread.body,
  publicAuthor: thread.publicAuthor,
  occurredAt: thread.occurredAt,
  replyCount: replies.filter((reply) => reply.threadId === thread.id && !reply.isDeleted).length,
  replies: replies.filter((reply) => reply.threadId === thread.id).sort((a, b) => a.floor - b.floor).map((reply) => ({
    id: reply.id, floor: reply.floor, body: reply.body, publicAuthor: reply.publicAuthor, occurredAt: reply.occurredAt,
    ...(reply.replyToFloor ? { replyToFloor: reply.replyToFloor } : {}),
    ...(reply.replyToAuthorName ? { replyToAuthorName: reply.replyToAuthorName } : {}),
    ...(reply.quotedText ? { quotedText: reply.quotedText } : {}),
  })),
});

export const recordForumVisit = (items: readonly ForumVisitHistory[], ownerIdentityId: string, thread: ForumThread, replies: readonly ForumReply[], now = Date.now()): ForumVisitHistory[] => {
  const previous = items.find((item) => item.ownerIdentityId === ownerIdentityId && item.threadId === thread.id);
  const next: ForumVisitHistory = { id: previous?.id || `forum-visit-${ownerIdentityId}-${thread.id}`, ownerIdentityId, threadId: thread.id, lastVisitedAt: now, visitCount: (previous?.visitCount || 0) + 1, publicSnapshot: toPublicThreadSnapshot(thread, replies) };
  return [next, ...items.filter((item) => item !== previous)].sort((a, b) => b.lastVisitedAt - a.lastVisitedAt).slice(0, MAX_FORUM_VISITS);
};

export const updateForumLikeHistory = (items: readonly ForumLikeHistoryRecord[], input: { ownerIdentityId: string; thread: ForumThread; replies: readonly ForumReply[]; reply?: ForumReply; liked: boolean; now?: number }): ForumLikeHistoryRecord[] => {
  const targetType = input.reply ? "reply" : "thread";
  const exists = (item: ForumLikeHistoryRecord) => item.ownerIdentityId === input.ownerIdentityId && item.targetType === targetType && item.threadId === input.thread.id && item.replyId === input.reply?.id;
  if (!input.liked) return items.filter((item) => !exists(item));
  const record: ForumLikeHistoryRecord = { id: `forum-like-${input.ownerIdentityId}-${targetType}-${input.reply?.id || input.thread.id}`, ownerIdentityId: input.ownerIdentityId, targetType, threadId: input.thread.id, ...(input.reply ? { replyId: input.reply.id } : {}), likedAt: input.now || Date.now(), publicSnapshot: { thread: toPublicThreadSnapshot(input.thread, input.replies), ...(input.reply ? { reply: toPublicReplySnapshot(input.reply) } : {}) } };
  return [record, ...items.filter((item) => !exists(item))].sort((a, b) => b.likedAt - a.likedAt).slice(0, MAX_FORUM_LIKES);
};

export const createForumNotification = (input: { ownerIdentityId: string; thread: ForumThread; reply: ForumReply; targetReply?: ForumReply; now?: number }): ForumNotification | null => {
  if (input.reply.source === "user" || input.reply.source === "user-anonymous" || input.reply.isDeleted) return null;
  const replyToUser = input.targetReply && (input.targetReply.source === "user" || input.targetReply.source === "user-anonymous");
  const threadByUser = input.thread.source === "user" || input.thread.source === "user-anonymous";
  if (!replyToUser && !threadByUser) return null;
  return { id: `forum-notice-${input.ownerIdentityId}-${input.reply.id}`, eventKey: `reply-created:${input.reply.id}`, ownerIdentityId: input.ownerIdentityId, type: replyToUser ? "reply-reply" : "thread-reply", actorPublicSnapshot: input.reply.publicAuthor, threadId: input.thread.id, replyId: input.reply.id, ...(replyToUser ? { targetReplyId: input.targetReply!.id } : {}), preview: input.reply.body.replace(/\s+/g, " ").trim().slice(0, 120), occurredAt: input.now || input.reply.occurredAt };
};

export const appendForumNotification = (items: readonly ForumNotification[], notification: ForumNotification): ForumNotification[] =>
  [notification, ...items.filter((item) => item.eventKey !== notification.eventKey)].sort((a, b) => b.occurredAt - a.occurredAt).slice(0, MAX_FORUM_NOTIFICATIONS);
