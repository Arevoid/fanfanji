import type { ForumReply } from "../../types";
import { storageKeys } from "../../core/storage/storageKeys";
import { readArray } from "../../core/storage/repositories/repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../../core/storage/storageTypes";
import { containsForbiddenStoryScopeKey, failedStoryWrite, saveStoryCollection } from "./storyStorageUtils";

/**
 * A ForumReply-shaped record kept in the isolated ForumStory scope.
 * It intentionally lives under a different storage key from the live Forum
 * replies table, so story NPCs can never become real Forum users.
 */
export type StoryForumReply = ForumReply & {
  storyId: string;
  /** Story-thread floor; assigned by the repository and never renumbered. */
  floorNumber?: number;
  /** Parent reply in the same story thread. */
  parentReplyId?: string;
  /** Story-scoped author identity being addressed. */
  replyToUserId?: string;
  /** Public quote excerpt from the parent reply. */
  quoteContent?: string;
  /** Stable author reference inside this story scope only. */
  storyAuthorType?: "story_character" | "forum_user";
  storyAuthorId?: string;
  /** Snapshot of the StoryForumUser voice used for this comment. */
  storyForumUserStyle?: string;
  /** Story-scope simulated likes and derived hot score. */
  likeCount?: number;
  hotScore?: number;
  storyCommentStyle: "ordinary" | "gossip" | "rational" | "question" | "supplement";
  storyCommentLabel: string;
};

/** Short domain alias used by story-level callers. */
export type StoryReply = StoryForumReply;

/** Input accepted by appendReply; floor values are assigned by the repository. */
export type StoryForumReplyInput = Omit<StoryForumReply, "floor" | "floorNumber"> &
  Partial<Pick<StoryForumReply, "floor" | "floorNumber">>;

export interface StoryForumReplyAppendResult extends StorageWriteResult {
  reply?: StoryForumReply;
  floorNumber?: number;
}

export type StoryForumReplyEngagementPatch = Pick<StoryForumReply, "likeCount" | "hotScore">;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export const isStoryForumReplyRecord = (value: unknown): value is StoryForumReply => {
  if (!isRecord(value) || containsForbiddenStoryScopeKey(value) || "privateActor" in value) return false;
  const author = value.publicAuthor;
  const storyAuthorId = typeof value.storyAuthorId === "string" ? value.storyAuthorId : undefined;
  if (value.storyAuthorType !== undefined && !storyAuthorId) return false;
  if (storyAuthorId && storyAuthorId.includes(":") && !storyAuthorId.startsWith(`${String(value.storyId)}:`)) return false;
  return typeof value.storyId === "string"
    && (value.floorNumber === undefined || (typeof value.floorNumber === "number" && Number.isInteger(value.floorNumber) && value.floorNumber >= 2))
    && (value.floorNumber === undefined || value.floorNumber === value.floor)
    && (value.parentReplyId === undefined || (typeof value.parentReplyId === "string" && value.parentReplyId.length > 0))
    && (value.replyToUserId === undefined || (typeof value.replyToUserId === "string" && value.replyToUserId.length > 0))
    && (value.quoteContent === undefined || (typeof value.quoteContent === "string" && value.quoteContent.trim().length > 0 && value.quoteContent.length <= 500))
    && (value.storyAuthorType === undefined || value.storyAuthorType === "story_character" || value.storyAuthorType === "forum_user")
    && (value.storyAuthorId === undefined || typeof value.storyAuthorId === "string")
    && (value.storyForumUserStyle === undefined || typeof value.storyForumUserStyle === "string")
    && (value.likeCount === undefined || (typeof value.likeCount === "number" && Number.isInteger(value.likeCount) && value.likeCount >= 0))
    && (value.hotScore === undefined || (typeof value.hotScore === "number" && Number.isFinite(value.hotScore) && value.hotScore >= 0))
    && typeof value.id === "string"
    && typeof value.threadId === "string"
    && typeof value.ownerIdentityId === "string"
    && value.ownerIdentityId === `story-scope:${value.storyId}`
    && typeof value.floor === "number"
    && Number.isInteger(value.floor)
    && value.floor >= 2
    && isRecord(author)
    && typeof author.displayName === "string"
    && (author.avatar === undefined || typeof author.avatar === "string")
    && author.kind === "virtual"
    && author.isAnonymous === false
    && typeof value.body === "string"
    && value.source === "ai-virtual"
    && typeof value.occurredAt === "number"
    && Number.isFinite(value.occurredAt)
    && value.baseLikeCount === 0
    && Array.isArray(value.likedByIdentityIds)
    && value.likedByIdentityIds.length === 0
    && typeof value.createdAt === "number"
    && Number.isFinite(value.createdAt)
    && typeof value.updatedAt === "number"
    && Number.isFinite(value.updatedAt)
    && ["ordinary", "gossip", "rational", "question", "supplement"].includes(String(value.storyCommentStyle))
    && typeof value.storyCommentLabel === "string";
};

export const loadStoryReplies = (): StorageResult<StoryForumReply[]> => {
  const loaded = readArray<unknown>(storageKeys.forumStoryReplies, []);
  return {
    ...loaded,
    value: loaded.value.filter(isStoryForumReplyRecord),
  };
};

export const listStoryReplies = (storyId: string, threadId?: string): StoryForumReply[] =>
  loadStoryReplies().value
    .filter((reply) => reply.storyId === storyId && (!threadId || reply.threadId === threadId))
    .sort((left, right) => (left.floorNumber ?? left.floor) - (right.floorNumber ?? right.floor)
      || left.occurredAt - right.occurredAt);

const normalizeBody = (body: string): string => body.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

/** Appends an immutable story reply and assigns the next thread-local floor. */
export const appendStoryReply = (reply: StoryForumReplyInput): StoryForumReplyAppendResult => {
  const current = loadStoryReplies().value;
  const duplicate = current.some((item) =>
    item.storyId === reply.storyId
      && item.threadId === reply.threadId
      && (item.id === reply.id || normalizeBody(item.body) === normalizeBody(reply.body)),
  );
  if (duplicate) return failedStoryWrite();

  const threadReplies = current.filter((item) => item.storyId === reply.storyId && item.threadId === reply.threadId);
  const nextFloor = threadReplies.reduce((max, item) => Math.max(max, item.floorNumber ?? item.floor), 1) + 1;
  if (reply.floor !== undefined && (!Number.isInteger(reply.floor) || reply.floor < 2)) return failedStoryWrite();
  if (reply.floorNumber !== undefined && reply.floorNumber !== nextFloor) return failedStoryWrite();

  const parent = reply.parentReplyId
    ? threadReplies.find((item) => item.id === reply.parentReplyId)
    : undefined;
  if (reply.parentReplyId && (!parent || parent.id === reply.id)) return failedStoryWrite();
  if (reply.replyToUserId && (!parent || !parent.storyAuthorId || parent.storyAuthorId !== reply.replyToUserId)) {
    return failedStoryWrite();
  }
  if (reply.quoteContent !== undefined && !parent) return failedStoryWrite();

  const normalizedReply: StoryForumReply = {
    ...reply,
    floor: nextFloor,
    floorNumber: nextFloor,
    likeCount: reply.likeCount ?? 0,
    hotScore: reply.hotScore ?? 0,
  };
  if (!isStoryForumReplyRecord(normalizedReply)) return failedStoryWrite();
  const write = saveStoryCollection(storageKeys.forumStoryReplies, [...current, normalizedReply]);
  return write.success ? { ...write, reply: normalizedReply, floorNumber: nextFloor } : write;
};

/** Updates only simulated engagement metadata; content and threading fields stay immutable. */
export const updateReplyEngagement = (
  storyId: string,
  threadId: string,
  replyId: string,
  patch: StoryForumReplyEngagementPatch,
): StorageWriteResult => {
  const current = loadStoryReplies().value;
  const index = current.findIndex((reply) => reply.storyId === storyId && reply.threadId === threadId && reply.id === replyId);
  if (index < 0) return failedStoryWrite();
  const nextReply: StoryForumReply = {
    ...current[index],
    ...(patch.likeCount !== undefined ? { likeCount: patch.likeCount } : {}),
    ...(patch.hotScore !== undefined ? { hotScore: patch.hotScore } : {}),
  };
  if (!isStoryForumReplyRecord(nextReply)) return failedStoryWrite();
  const next = [...current];
  next[index] = nextReply;
  return saveStoryCollection(storageKeys.forumStoryReplies, next);
};

export const StoryForumReplyRepository = {
  load: loadStoryReplies,
  listReplies: listStoryReplies,
  appendReply: appendStoryReply,
  updateReplyEngagement,
};

export const StoryReplyRepository = StoryForumReplyRepository;

export const storyForumReplyRepository = StoryForumReplyRepository;
