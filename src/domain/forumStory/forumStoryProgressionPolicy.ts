import type {
  ForumStory,
  StoryEvent,
} from "./forumStoryTypes";

/** The conditions that may authorize one story progression decision. */
export type ForumStoryProgressionTrigger =
  | "time"
  | "comment_activity"
  | "hot_discussion"
  | "manual";

/**
 * Aggregates derived from one story thread. The policy consumes statistics,
 * rather than repositories, so it cannot accidentally read another story.
 */
export interface ForumStoryThreadStats {
  readonly storyId: string;
  readonly threadId: string;
  readonly commentCount: number;
  readonly lastCommentAt?: number;
}

/**
 * Engagement aggregates are already story/thread scoped. `hotReplyCount`
 * means replies that have already been classified as hot by the engagement
 * layer; `maxHotScore` is the highest score in that classification.
 */
export interface ForumStoryEngagementStats {
  readonly storyId: string;
  readonly threadId: string;
  readonly viewCount?: number;
  readonly likeCount?: number;
  readonly hotReplyCount?: number;
  readonly maxHotScore?: number;
}

export interface ForumStoryProgressionPolicyOptions {
  /** Fallback delay when the story has no explicit nextUpdateAt. */
  readonly minimumIntervalMs?: number;
  /** Number of comments required to activate comment_activity. */
  readonly commentThreshold?: number;
  /** Number of pre-classified hot replies required to activate hot_discussion. */
  readonly hotReplyThreshold?: number;
  /** Highest hot score required to activate hot_discussion. */
  readonly hotScoreThreshold?: number;
}

export interface ForumStoryProgressionInput {
  readonly story?: ForumStory | null;
  readonly events: readonly StoryEvent[];
  readonly threadStats?: ForumStoryThreadStats | null;
  readonly engagement?: ForumStoryEngagementStats | null;
  readonly now: number;
  /** Explicit user/system request; this is still evaluated only for active stories. */
  readonly manual?: boolean;
  readonly policy?: ForumStoryProgressionPolicyOptions;
}

export interface ForumStoryProgressionDecision {
  readonly canProgress: boolean;
  readonly reason: string;
  readonly trigger: ForumStoryProgressionTrigger;
}

export const DEFAULT_FORUM_STORY_PROGRESSION_POLICY: Required<ForumStoryProgressionPolicyOptions> = {
  minimumIntervalMs: 24 * 60 * 60 * 1000,
  commentThreshold: 3,
  hotReplyThreshold: 1,
  hotScoreThreshold: 10,
};

const invalidNonNegativeNumber = (value: number | undefined): boolean =>
  value !== undefined && (!Number.isFinite(value) || value < 0);

const isStoryScopeConsistent = (input: ForumStoryProgressionInput, storyId: string): boolean => {
  if (!input.threadStats || input.threadStats.storyId !== storyId) return false;
  if (input.engagement && (
    input.engagement.storyId !== storyId
      || input.engagement.threadId !== input.threadStats.threadId
  )) return false;
  return input.events.every((event) => event.storyId === storyId);
};

const invalidInput = (input: ForumStoryProgressionInput): boolean => {
  if (!Number.isFinite(input.now)) return true;
  if (!input.story || !input.threadStats) return false;
  if (!Number.isFinite(input.threadStats.commentCount) || input.threadStats.commentCount < 0) return true;
  if (invalidNonNegativeNumber(input.threadStats.lastCommentAt)) return true;
  if (!input.engagement) return false;
  return invalidNonNegativeNumber(input.engagement.viewCount)
    || invalidNonNegativeNumber(input.engagement.likeCount)
    || invalidNonNegativeNumber(input.engagement.hotReplyCount)
    || invalidNonNegativeNumber(input.engagement.maxHotScore);
};

const isTimeReady = (
  story: ForumStory,
  now: number,
  minimumIntervalMs: number,
): boolean => {
  if (story.nextUpdateAt !== undefined) return now >= story.nextUpdateAt;
  return now - story.updatedAt >= minimumIntervalMs;
};

/**
 * Pure progression decision function.
 *
 * The function only evaluates supplied story-scope values. It never reads
 * storage, calls AI, or mutates the story/event timeline. A decision is made
 * only for an active story; callers remain responsible for executing it.
 */
export const evaluateForumStoryProgression = (
  input: ForumStoryProgressionInput,
): ForumStoryProgressionDecision => {
  const manualTrigger: ForumStoryProgressionDecision = {
    canProgress: false,
    reason: "Manual progression requires an active story",
    trigger: "manual",
  };
  if (!input.story) {
    return { canProgress: false, reason: "No ForumStory was supplied", trigger: "manual" };
  }
  if (input.story.status !== "active") return manualTrigger;
  if (invalidInput(input)) {
    return { canProgress: false, reason: "Progression input contains invalid statistics", trigger: "manual" };
  }
  if (!isStoryScopeConsistent(input, input.story.id)) {
    return { canProgress: false, reason: "Progression input crosses ForumStory scope", trigger: "manual" };
  }

  const options = {
    ...DEFAULT_FORUM_STORY_PROGRESSION_POLICY,
    ...input.policy,
  };
  if (!Number.isFinite(options.minimumIntervalMs) || options.minimumIntervalMs < 0
    || !Number.isInteger(options.commentThreshold) || options.commentThreshold < 1
    || !Number.isInteger(options.hotReplyThreshold) || options.hotReplyThreshold < 1
    || !Number.isFinite(options.hotScoreThreshold) || options.hotScoreThreshold < 0) {
    return { canProgress: false, reason: "Progression policy thresholds are invalid", trigger: "manual" };
  }

  if (input.manual) {
    return { canProgress: true, reason: "Manual progression requested", trigger: "manual" };
  }

  const engagement = input.engagement;
  if (engagement && (
    (engagement.hotReplyCount ?? 0) >= options.hotReplyThreshold
      || (engagement.maxHotScore ?? 0) >= options.hotScoreThreshold
  )) {
    return { canProgress: true, reason: "Hot discussion threshold reached", trigger: "hot_discussion" };
  }

  if (input.threadStats!.commentCount >= options.commentThreshold) {
    return { canProgress: true, reason: "Comment activity threshold reached", trigger: "comment_activity" };
  }

  if (isTimeReady(input.story, input.now, options.minimumIntervalMs)) {
    return { canProgress: true, reason: "Story update time reached", trigger: "time" };
  }

  return { canProgress: false, reason: "No progression trigger is ready", trigger: "time" };
};

/** Friendly aliases for callers that prefer a verb or a policy object. */
export const canProgressForumStory = evaluateForumStoryProgression;
export const ForumStoryProgressionPolicy = {
  evaluate: evaluateForumStoryProgression,
};

