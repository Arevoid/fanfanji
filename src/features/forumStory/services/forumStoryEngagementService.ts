import type { StoryThread } from "../../../domain/forumStory/forumStoryTypes";
import type { StorageWriteResult } from "../../../core/storage/storageTypes";
import { StoryThreadRepository } from "../storyThreadRepository";
import {
  StoryForumReplyRepository,
  type StoryForumReply,
} from "../storyReplyRepository";

export interface ForumStoryEngagementTargetInput {
  storyId: string;
  threadId: string;
  /** Positive simulated increment; defaults to one. */
  amount?: number;
}

export interface RecordForumStoryViewInput extends ForumStoryEngagementTargetInput {}

export interface AddForumStoryLikeInput extends ForumStoryEngagementTargetInput {
  /** When omitted, the story thread itself receives the like. */
  replyId?: string;
  /**
   * Opaque reader token used only to prevent duplicate likes in one story
   * scope. It is never sent to a prompt or linked to a relationship.
   */
  readerToken?: string;
  /** A story-scope aggregate signal; it never records a real user identity. */
  markReaderInterest?: boolean;
}

export interface CalculateForumStoryHotRepliesInput {
  storyId: string;
  threadId: string;
  now?: number;
  /** Exponential-decay half-life; defaults to one day. */
  halfLifeMs?: number;
  limit?: number;
}

export interface ForumStoryHotReply extends StoryForumReply {
  hotScore: number;
}

const DEFAULT_HALF_LIFE_MS = 24 * 60 * 60 * 1000;

const normalizeAmount = (amount: number | undefined): number => {
  const value = amount ?? 1;
  if (!Number.isInteger(value) || value <= 0 || value > 1_000_000) {
    throw new Error("ForumStory engagement amount must be a positive integer");
  }
  return value;
};

const normalizeReaderToken = (readerToken: string | undefined): string | undefined => {
  if (readerToken === undefined) return undefined;
  const token = readerToken.trim();
  if (!token || token.length > 256) throw new Error("ForumStory reader token is invalid");
  return token;
};

const ensureWrite = (result: StorageWriteResult, label: string): void => {
  if (!result.success) throw new Error(`ForumStory ${label} save failed`);
};

const getThreadOrThrow = (storyId: string, threadId: string): StoryThread => {
  const thread = StoryThreadRepository.getThread(storyId, threadId);
  if (!thread) throw new Error("ForumStory thread does not exist");
  return thread;
};

const updateThreadEngagement = (
  storyId: string,
  threadId: string,
  patch: Pick<StoryThread, "viewCount" | "likeCount"> & Partial<Pick<StoryThread, "readerInterest" | "likedByIdentityIds">>,
): StoryThread => {
  const thread = getThreadOrThrow(storyId, threadId);
  ensureWrite(StoryThreadRepository.updateThread(storyId, threadId, {
    ...patch,
    /** Counters must not alter the story's narrative timestamp. */
    updatedAt: thread.updatedAt,
  }), "thread engagement");
  const updated = StoryThreadRepository.getThread(storyId, threadId);
  if (!updated) throw new Error("ForumStory thread read failed after engagement update");
  return updated;
};

/** Records a purely story-scoped simulated view. No identity or user data is read. */
export const recordView = (input: RecordForumStoryViewInput): StoryThread => {
  const amount = normalizeAmount(input.amount);
  const thread = getThreadOrThrow(input.storyId, input.threadId);
  return updateThreadEngagement(input.storyId, input.threadId, {
    viewCount: (thread.viewCount ?? 0) + amount,
  });
};

/** Adds a simulated like to either the story thread or one of its replies. */
export const addLike = (input: AddForumStoryLikeInput): StoryThread | StoryForumReply => {
  const amount = normalizeAmount(input.amount);
  const readerToken = normalizeReaderToken(input.readerToken);
  if (!input.replyId) {
    const thread = getThreadOrThrow(input.storyId, input.threadId);
    const likedByIdentityIds = thread.likedByIdentityIds ?? [];
    if (readerToken && likedByIdentityIds.includes(readerToken)) return thread;
    return updateThreadEngagement(input.storyId, input.threadId, {
      likeCount: (thread.likeCount ?? 0) + amount,
      ...(readerToken ? { likedByIdentityIds: [...likedByIdentityIds, readerToken] } : {}),
      ...(input.markReaderInterest ? { readerInterest: true } : {}),
    });
  }

  const reply = StoryForumReplyRepository.listReplies(input.storyId, input.threadId)
    .find((candidate) => candidate.id === input.replyId);
  if (!reply) throw new Error("ForumStory reply does not exist");
  const likedByIdentityIds = reply.likedByIdentityIds ?? [];
  if (readerToken && likedByIdentityIds.includes(readerToken)) return reply;
  ensureWrite(StoryForumReplyRepository.updateReplyEngagement(
    input.storyId,
    input.threadId,
    reply.id,
    {
      likeCount: (reply.likeCount ?? 0) + amount,
      ...(readerToken ? { likedByIdentityIds: [...likedByIdentityIds, readerToken] } : {}),
    },
  ), "reply engagement");
  const updated = StoryForumReplyRepository.listReplies(input.storyId, input.threadId)
    .find((candidate) => candidate.id === reply.id);
  if (!updated) throw new Error("ForumStory reply read failed after engagement update");
  return updated;
};

/**
 * Calculates and persists hot scores for replies in one story thread.
 * Score = likes × 3 + direct replies × 2 + exponential time decay.
 */
export const calculateHotReplyScore = (input: {
  reply: StoryForumReply;
  directReplyCount: number;
  now: number;
  halfLifeMs: number;
}): number => {
  const age = Math.max(0, input.now - input.reply.occurredAt);
  const decay = Math.exp(-age / input.halfLifeMs);
  return (input.reply.likeCount ?? 0) * 3 + input.directReplyCount * 2 + decay;
};

export const calculateHotReplies = (input: CalculateForumStoryHotRepliesInput): ForumStoryHotReply[] => {
  getThreadOrThrow(input.storyId, input.threadId);
  const now = input.now ?? Date.now();
  const halfLifeMs = input.halfLifeMs ?? DEFAULT_HALF_LIFE_MS;
  if (!Number.isFinite(now) || !Number.isFinite(halfLifeMs) || halfLifeMs <= 0) {
    throw new Error("ForumStory hot-score time configuration is invalid");
  }
  const limit = input.limit === undefined
    ? undefined
    : Math.max(0, Math.min(100, Math.trunc(input.limit)));
  const replies = StoryForumReplyRepository.listReplies(input.storyId, input.threadId);
  const directReplyCounts = new Map<string, number>();
  for (const reply of replies) {
    if (reply.parentReplyId) directReplyCounts.set(reply.parentReplyId, (directReplyCounts.get(reply.parentReplyId) ?? 0) + 1);
  }

  const scored = replies.map((reply) => ({
    reply,
    hotScore: calculateHotReplyScore({
      reply,
      directReplyCount: directReplyCounts.get(reply.id) ?? 0,
      now,
      halfLifeMs,
    }),
  }));
  for (const item of scored) {
    ensureWrite(StoryForumReplyRepository.updateReplyEngagement(
      input.storyId,
      input.threadId,
      item.reply.id,
      { likeCount: item.reply.likeCount ?? 0, hotScore: item.hotScore },
    ), "reply hot score");
  }

  return scored
    .map((item) => ({ ...item.reply, likeCount: item.reply.likeCount ?? 0, hotScore: item.hotScore }))
    .sort((left, right) => right.hotScore - left.hotScore
      || (left.floorNumber ?? left.floor) - (right.floorNumber ?? right.floor))
    .slice(0, limit);
};

export const ForumStoryEngagementService = {
  recordView,
  addLike,
  calculateHotReplies,
  calculateHotReplyScore,
};

export const forumStoryEngagementService = ForumStoryEngagementService;
