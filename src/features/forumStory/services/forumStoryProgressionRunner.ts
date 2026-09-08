import type {
  StoryUpdateTriggerReason,
  ForumStoryExecutionLog,
} from "../../../domain/forumStory/forumStoryTypes";
import type {
  ForumStoryProgressionTriggerContext,
} from "./forumStoryProgressionExecutor";
import {
  executeForumStoryProgression,
  type ForumStoryProgressionAction,
} from "./forumStoryProgressionExecutor";
import { createId as createApplicationId } from "../../../core/id/createId";
import {
  ForumStoryCommentService,
  type ForumStoryCommentAiCall,
  type ForumStoryCommentGenerationResult,
  type ForumStoryCommentGenerationSettings,
} from "./forumStoryCommentService";
import {
  ForumStoryUpdateService,
  type ForumStoryUpdateAiCall,
  type ForumStoryUpdateGenerationResult,
  type ForumStoryUpdateGenerationSettings,
} from "./forumStoryUpdateService";
import { ForumStoryRepository } from "../forumStoryRepository";
import { ForumStoryExecutionLogRepository } from "../forumStoryExecutionLogRepository";
import { StoryThreadRepository } from "../storyThreadRepository";

export interface ForumStoryProgressionRunnerTriggerContext extends ForumStoryProgressionTriggerContext {
  /** Shared settings can be used for either generated action. */
  readonly settings?: ForumStoryUpdateGenerationSettings | ForumStoryCommentGenerationSettings;
  readonly updateSettings?: ForumStoryUpdateGenerationSettings;
  readonly commentSettings?: ForumStoryCommentGenerationSettings;
  readonly updateAiCall?: ForumStoryUpdateAiCall;
  readonly commentAiCall?: ForumStoryCommentAiCall;
  readonly commentCount?: number;
  readonly triggerReason?: StoryUpdateTriggerReason;
}

export type ForumStoryProgressionRunnerResult =
  | {
    readonly success: true;
    readonly action: "none";
    readonly result?: undefined;
    readonly error?: undefined;
  }
  | {
    readonly success: true;
    readonly action: "generate_update";
    readonly result: ForumStoryUpdateGenerationResult;
    readonly error?: undefined;
  }
  | {
    readonly success: true;
    readonly action: "generate_comment_reaction";
    readonly result: ForumStoryCommentGenerationResult;
    readonly error?: undefined;
  }
  | {
    readonly success: false;
    readonly action: Exclude<ForumStoryProgressionAction, "none"> | "none";
    readonly result?: undefined;
    readonly error: string;
  };

const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : "ForumStory progression execution failed").slice(0, 1000);

const makeExecutionLogId = (storyId: string, _startedAt: number): string => `${storyId}:execution:${createApplicationId("run")}`;

const safeTimestamp = (candidate: number | undefined): number =>
  candidate !== undefined && Number.isFinite(candidate) ? candidate : Date.now();

const finishExecutionLog = (
  storyId: string,
  logId: string,
  status: "success" | "failed",
  finishedAt: number,
  error?: string,
): boolean => ForumStoryExecutionLogRepository.updateLog(storyId, logId, {
  status,
  finishedAt,
  ...(error ? { error } : {}),
}).success;

const resolveThread = (storyId: string, requestedThreadId: string | undefined) => {
  const story = ForumStoryRepository.getStory(storyId);
  if (!story) return undefined;
  const threadId = requestedThreadId || story.mainThreadId || StoryThreadRepository.listThreads(storyId)[0]?.id;
  return threadId ? StoryThreadRepository.getThread(storyId, threadId) : undefined;
};

/**
 * Executes the action selected by the progression executor. Generation
 * services remain responsible for Prompt Adapter and Output Validator checks;
 * this layer only wires their already-approved service entry points together.
 */
export const runForumStoryProgression = async (
  storyId: string,
  triggerContext: ForumStoryProgressionRunnerTriggerContext = {},
): Promise<ForumStoryProgressionRunnerResult> => {
  const plan = executeForumStoryProgression(storyId, triggerContext);
  const story = ForumStoryRepository.getStory(storyId);
  /** A missing story cannot have a valid story-scope execution log. */
  if (!story) return { success: true, action: "none" };

  const startedAt = safeTimestamp(triggerContext.now);
  const executionLog: ForumStoryExecutionLog = {
    id: makeExecutionLogId(storyId, startedAt),
    storyId,
    action: plan.action,
    trigger: plan.trigger,
    status: "running",
    startedAt,
  };
  if (!ForumStoryExecutionLogRepository.createLog(executionLog).success) {
    return { success: false, action: plan.action, error: "ForumStory execution log creation failed" };
  }

  if (plan.action === "none") {
    if (!finishExecutionLog(storyId, executionLog.id, "success", startedAt)) {
      return { success: false, action: "none", error: "ForumStory execution log update failed" };
    }
    return { success: true, action: "none" };
  }

  const thread = resolveThread(storyId, triggerContext.threadId);
  if (!story || !thread) {
    const error = "ForumStory state changed before progression execution";
    finishExecutionLog(storyId, executionLog.id, "failed", startedAt, error);
    return { success: false, action: plan.action, error };
  }

  const storySnapshot = story;
  try {
    if (plan.action === "generate_update") {
      const settings = triggerContext.updateSettings || triggerContext.settings;
      if (!settings) throw new Error("ForumStory update generation settings are required");
      const result = await ForumStoryUpdateService.generateStoryUpdate({
        storyId,
        story,
        thread,
        settings,
        triggerReason: triggerContext.triggerReason || "manual",
        now: triggerContext.now,
        aiCall: triggerContext.updateAiCall,
      });
      if (!finishExecutionLog(storyId, executionLog.id, "success", safeTimestamp(triggerContext.now))) {
        return { success: false, action: plan.action, error: "ForumStory execution log update failed" };
      }
      return { success: true, action: plan.action, result };
    }

    const settings = triggerContext.commentSettings || triggerContext.settings;
    if (!settings) throw new Error("ForumStory comment generation settings are required");
    const result = await ForumStoryCommentService.generateStoryComments({
      storyId,
      story,
      thread,
      settings,
      count: triggerContext.commentCount,
      now: triggerContext.now,
      aiCall: triggerContext.commentAiCall,
    });
    if (!finishExecutionLog(storyId, executionLog.id, "success", safeTimestamp(triggerContext.now))) {
      return { success: false, action: plan.action, error: "ForumStory execution log update failed" };
    }
    return { success: true, action: plan.action, result };
  } catch (error) {
    /**
     * Generation services validate before their writes. If a service fails
     * after changing the story state, restore the pre-run story snapshot so a
     * failed runner cannot leave an invalid lifecycle status behind.
     */
    const currentStory = ForumStoryRepository.getStory(storyId);
    if (currentStory && JSON.stringify(currentStory) !== JSON.stringify(storySnapshot)) {
      ForumStoryRepository.updateStory(storyId, storySnapshot);
    }
    const message = errorMessage(error);
    finishExecutionLog(storyId, executionLog.id, "failed", safeTimestamp(triggerContext.now), message);
    return { success: false, action: plan.action, error: message };
  }
};

export const ForumStoryProgressionRunner = {
  run: runForumStoryProgression,
};

export const forumStoryProgressionRunner = ForumStoryProgressionRunner;
