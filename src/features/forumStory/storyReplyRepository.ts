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
  storyCommentStyle: "ordinary" | "gossip" | "rational" | "question" | "supplement";
  storyCommentLabel: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export const isStoryForumReplyRecord = (value: unknown): value is StoryForumReply => {
  if (!isRecord(value) || containsForbiddenStoryScopeKey(value) || "privateActor" in value) return false;
  const author = value.publicAuthor;
  return typeof value.storyId === "string"
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
    .sort((left, right) => left.floor - right.floor || left.occurredAt - right.occurredAt);

const normalizeBody = (body: string): string => body.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

/** Appends a story reply; exact duplicate bodies are ignored as idempotent writes. */
export const appendStoryReply = (reply: StoryForumReply): StorageWriteResult => {
  if (!isStoryForumReplyRecord(reply)) return failedStoryWrite();
  const current = loadStoryReplies().value;
  const duplicate = current.some((item) =>
    item.storyId === reply.storyId
      && item.threadId === reply.threadId
      && (item.id === reply.id || normalizeBody(item.body) === normalizeBody(reply.body)),
  );
  if (duplicate) return failedStoryWrite();
  return saveStoryCollection(storageKeys.forumStoryReplies, [...current, reply]);
};

export const StoryForumReplyRepository = {
  load: loadStoryReplies,
  listReplies: listStoryReplies,
  appendReply: appendStoryReply,
};

export const storyForumReplyRepository = StoryForumReplyRepository;
