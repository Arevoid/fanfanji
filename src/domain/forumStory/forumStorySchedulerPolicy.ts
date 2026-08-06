import type {
  ForumStory,
  ForumStoryExecutionLog,
} from "./forumStoryTypes";

export interface ForumStorySchedulerPolicyOptions {
  /** Do not re-check a story shortly after a successful execution. */
  readonly successCooldownMs?: number;
  /** Delay before retrying a failed execution. */
  readonly failureRetryDelayMs?: number;
  /** Running/pending executions older than this are considered stale. */
  readonly runningLeaseMs?: number;
}

export interface ForumStorySchedulerPolicyInput {
  readonly stories: readonly ForumStory[];
  readonly now: number;
  readonly executionLogs: readonly ForumStoryExecutionLog[];
  readonly policy?: ForumStorySchedulerPolicyOptions;
}

export interface ForumStoryCheckCandidate {
  readonly storyId: string;
  readonly reason: string;
}

export const DEFAULT_FORUM_STORY_SCHEDULER_POLICY: Required<ForumStorySchedulerPolicyOptions> = {
  successCooldownMs: 15 * 60 * 1000,
  failureRetryDelayMs: 5 * 60 * 1000,
  runningLeaseMs: 10 * 60 * 1000,
};

const eventTime = (log: ForumStoryExecutionLog): number => log.finishedAt ?? log.startedAt;

const isRecent = (timestamp: number, now: number, windowMs: number): boolean =>
  Number.isFinite(timestamp) && now - timestamp < windowMs;

const validOptions = (options: Required<ForumStorySchedulerPolicyOptions>): boolean =>
  Number.isFinite(options.successCooldownMs) && options.successCooldownMs >= 0
    && Number.isFinite(options.failureRetryDelayMs) && options.failureRetryDelayMs >= 0
    && Number.isFinite(options.runningLeaseMs) && options.runningLeaseMs >= 0;

const latestLog = (
  logs: readonly ForumStoryExecutionLog[],
  statuses: readonly ForumStoryExecutionLog["status"][],
): ForumStoryExecutionLog | undefined => logs
  .filter((log) => statuses.includes(log.status)
    && Number.isFinite(log.startedAt)
    && Number.isFinite(eventTime(log)))
  .sort((left, right) => eventTime(right) - eventTime(left))[0];

/**
 * Purely selects story IDs that are eligible for a future scheduler check.
 * This function never starts work and never reads storage or private context.
 */
export const selectForumStoriesForCheck = (
  input: ForumStorySchedulerPolicyInput,
): ForumStoryCheckCandidate[] => {
  if (!Number.isFinite(input.now)) return [];
  const options = { ...DEFAULT_FORUM_STORY_SCHEDULER_POLICY, ...input.policy };
  if (!validOptions(options)) return [];

  const seen = new Set<string>();
  const candidates: ForumStoryCheckCandidate[] = [];
  for (const story of input.stories) {
    if (story.status !== "active" || (story.status as string) === "archived") continue;
    if (seen.has(story.id)) continue;
    seen.add(story.id);

    const storyLogs = input.executionLogs.filter((log) => log.storyId === story.id);
    const latestRunning = latestLog(storyLogs, ["running", "pending"]);
    if (latestRunning && isRecent(latestRunning.startedAt, input.now, options.runningLeaseMs)) continue;

    const latestSuccess = latestLog(storyLogs, ["success"]);
    if (latestSuccess && isRecent(eventTime(latestSuccess), input.now, options.successCooldownMs)) continue;

    const latestFailure = latestLog(storyLogs, ["failed"]);
    if (latestFailure && isRecent(eventTime(latestFailure), input.now, options.failureRetryDelayMs)) continue;

    if (latestFailure) {
      candidates.push({ storyId: story.id, reason: "Retrying after the failure retry delay" });
    } else if (latestRunning) {
      candidates.push({ storyId: story.id, reason: "Previous execution is stale; checking again" });
    } else if (latestSuccess) {
      candidates.push({ storyId: story.id, reason: "Successful execution cooldown elapsed" });
    } else {
      candidates.push({ storyId: story.id, reason: "Active story has not been checked" });
    }
  }
  return candidates;
};

export const ForumStorySchedulerPolicy = {
  select: selectForumStoriesForCheck,
};

export const forumStorySchedulerPolicy = ForumStorySchedulerPolicy;
