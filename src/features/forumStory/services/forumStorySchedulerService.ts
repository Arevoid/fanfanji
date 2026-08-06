import {
  selectForumStoriesForCheck,
  type ForumStoryCheckCandidate,
  type ForumStorySchedulerPolicyOptions,
} from "../../../domain/forumStory/forumStorySchedulerPolicy";
import { ForumStoryRepository } from "../forumStoryRepository";
import { ForumStoryExecutionLogRepository } from "../forumStoryExecutionLogRepository";
import {
  runForumStoryProgression,
  type ForumStoryProgressionRunnerResult,
  type ForumStoryProgressionRunnerTriggerContext,
} from "./forumStoryProgressionRunner";
import type { ForumStoryCommentGenerationResult } from "./forumStoryCommentService";
import type { ForumStoryUpdateGenerationResult } from "./forumStoryUpdateService";

/** Context forwarded to each Runner invocation, without scheduler-specific timing or thread selection. */
export type ForumStorySchedulerRunnerContext = Omit<
  ForumStoryProgressionRunnerTriggerContext,
  "now" | "threadId" | "policy"
>;

export interface ForumStorySchedulerTickInput {
  readonly now: number;
  readonly policy?: ForumStorySchedulerPolicyOptions;
  readonly runnerContext?: ForumStorySchedulerRunnerContext;
}

export interface ForumStorySchedulerStoryResult {
  readonly storyId: string;
  readonly reason: string;
  readonly success: boolean;
  readonly action: ForumStoryProgressionRunnerResult["action"];
  readonly result?: ForumStoryCommentGenerationResult | ForumStoryUpdateGenerationResult;
  readonly error?: string;
}

export interface ForumStorySchedulerTickResult {
  /** Number of story records inspected by this tick. */
  readonly checked: number;
  /** Number of non-noop Runner actions that completed successfully. */
  readonly executed: number;
  /** Stories rejected by policy or resolved as a Runner no-op. */
  readonly skipped: number;
  /** Runner failures or unexpected per-story exceptions. */
  readonly failed: number;
  readonly results: readonly ForumStorySchedulerStoryResult[];
}

const messageFromError = (error: unknown): string =>
  (error instanceof Error ? error.message : "ForumStory scheduler execution failed").slice(0, 1000);

const resultPayload = (result: ForumStoryProgressionRunnerResult): ForumStorySchedulerStoryResult["result"] =>
  "result" in result ? result.result : undefined;

const asStoryResult = (
  candidate: ForumStoryCheckCandidate,
  runnerResult: ForumStoryProgressionRunnerResult,
): ForumStorySchedulerStoryResult => ({
  storyId: candidate.storyId,
  reason: candidate.reason,
  success: runnerResult.success,
  action: runnerResult.action,
  ...(resultPayload(runnerResult) === undefined ? {} : { result: resultPayload(runnerResult) }),
  ...(runnerResult.error ? { error: runnerResult.error } : {}),
});

/**
 * Executes one scheduler tick. This is an explicit one-shot service call;
 * it does not create timers, workers, or background jobs.
 */
export const runForumStorySchedulerTick = async (
  input: ForumStorySchedulerTickInput,
): Promise<ForumStorySchedulerTickResult> => {
  const stories = ForumStoryRepository.listStories();
  const executionLogs = ForumStoryExecutionLogRepository.load().value;
  const candidates = selectForumStoriesForCheck({
    stories,
    now: input.now,
    executionLogs,
    policy: input.policy,
  });

  let executed = 0;
  let skipped = Math.max(0, stories.length - candidates.length);
  let failed = 0;
  const results: ForumStorySchedulerStoryResult[] = [];

  for (const candidate of candidates) {
    let runnerResult: ForumStoryProgressionRunnerResult;
    try {
      runnerResult = await runForumStoryProgression(candidate.storyId, {
        ...input.runnerContext,
        now: input.now,
      });
    } catch (error) {
      runnerResult = {
        success: false,
        action: "none",
        error: messageFromError(error),
      };
    }

    results.push(asStoryResult(candidate, runnerResult));
    if (!runnerResult.success) {
      failed += 1;
    } else if (runnerResult.action === "none") {
      skipped += 1;
    } else {
      executed += 1;
    }
  }

  return {
    checked: stories.length,
    executed,
    skipped,
    failed,
    results,
  };
};

export const ForumStorySchedulerService = {
  tick: runForumStorySchedulerTick,
};

export const forumStorySchedulerService = ForumStorySchedulerService;
