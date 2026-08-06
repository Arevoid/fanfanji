import type {
  ForumStoryProgressionDecision,
  ForumStoryProgressionPolicyOptions,
  ForumStoryProgressionInput,
  ForumStoryEngagementStats,
  ForumStoryThreadStats,
  ForumStoryProgressionTrigger,
} from "../../../domain/forumStory/forumStoryProgressionPolicy";
import { evaluateForumStoryProgression } from "../../../domain/forumStory/forumStoryProgressionPolicy";
import { ForumStoryRepository } from "../forumStoryRepository";
import { StoryEventRepository } from "../storyEventRepository";
import { StoryForumReplyRepository } from "../storyReplyRepository";
import { StoryThreadRepository } from "../storyThreadRepository";

export type ForumStoryProgressionAction = "generate_update" | "generate_comment_reaction" | "none";

export interface ForumStoryProgressionPlan {
  readonly action: ForumStoryProgressionAction;
  readonly reason: string;
  readonly trigger: ForumStoryProgressionTrigger;
}

export interface ForumStoryProgressionTriggerContext {
  readonly now?: number;
  readonly manual?: boolean;
  /** Optional thread selector; it must belong to the requested story. */
  readonly threadId?: string;
  readonly policy?: ForumStoryProgressionPolicyOptions;
}

const noAction = (reason: string, trigger: ForumStoryProgressionTrigger = "manual"): ForumStoryProgressionPlan => ({
  action: "none",
  reason,
  trigger,
});

const getThreadId = (storyId: string, mainThreadId: string | undefined, requestedThreadId: string | undefined): string | undefined => {
  if (requestedThreadId) return requestedThreadId;
  if (mainThreadId) return mainThreadId;
  return StoryThreadRepository.listThreads(storyId)[0]?.id;
};

const buildThreadStats = (storyId: string, threadId: string): ForumStoryThreadStats => {
  const replies = StoryForumReplyRepository.listReplies(storyId, threadId);
  const lastCommentAt = replies.reduce<number | undefined>(
    (latest, reply) => latest === undefined ? reply.occurredAt : Math.max(latest, reply.occurredAt),
    undefined,
  );
  return {
    storyId,
    threadId,
    commentCount: replies.length,
    ...(lastCommentAt === undefined ? {} : { lastCommentAt }),
  };
};

const buildEngagementStats = (
  storyId: string,
  threadId: string,
  viewCount: number | undefined,
  likeCount: number | undefined,
  hotScoreThreshold: number,
): ForumStoryEngagementStats => {
  const replies = StoryForumReplyRepository.listReplies(storyId, threadId);
  const hotScores = replies
    .map((reply) => reply.hotScore ?? 0)
    .filter((score) => Number.isFinite(score));
  return {
    storyId,
    threadId,
    viewCount: viewCount ?? 0,
    likeCount: likeCount ?? 0,
    hotReplyCount: hotScores.filter((score) => score >= hotScoreThreshold).length,
    maxHotScore: hotScores.length > 0 ? Math.max(...hotScores) : 0,
  };
};

const chooseAction = (decision: ForumStoryProgressionDecision): ForumStoryProgressionAction => {
  if (!decision.canProgress) return "none";
  return decision.trigger === "hot_discussion" ? "generate_comment_reaction" : "generate_update";
};

/**
 * Reads story-scope state, delegates the decision to the pure progression
 * policy, and returns an action plan. It deliberately does not call AI or
 * mutate any repository.
 */
export const executeForumStoryProgression = (
  storyId: string,
  triggerContext: ForumStoryProgressionTriggerContext = {},
): ForumStoryProgressionPlan => {
  const story = ForumStoryRepository.getStory(storyId);
  if (!story) return noAction("ForumStory was not found");

  const threadId = getThreadId(storyId, story.mainThreadId, triggerContext.threadId);
  const thread = threadId ? StoryThreadRepository.getThread(storyId, threadId) : undefined;
  if (!thread) return noAction("ForumStory thread was not found");

  const policy = triggerContext.policy;
  const hotScoreThreshold = policy?.hotScoreThreshold ?? 10;
  const input: ForumStoryProgressionInput = {
    story,
    events: StoryEventRepository.listEvents(storyId),
    threadStats: buildThreadStats(storyId, thread.id),
    engagement: buildEngagementStats(
      storyId,
      thread.id,
      thread.viewCount,
      thread.likeCount,
      hotScoreThreshold,
    ),
    now: triggerContext.now ?? Date.now(),
    ...(triggerContext.manual === undefined ? {} : { manual: triggerContext.manual }),
    ...(policy === undefined ? {} : { policy }),
  };
  const decision = evaluateForumStoryProgression(input);
  return { action: chooseAction(decision), reason: decision.reason, trigger: decision.trigger };
};

export const ForumStoryProgressionExecutor = {
  execute: executeForumStoryProgression,
};

export const forumStoryProgressionExecutor = ForumStoryProgressionExecutor;
