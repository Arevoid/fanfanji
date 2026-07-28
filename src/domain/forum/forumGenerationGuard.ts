import type { ForumGenerationTask, ForumGenerationTrigger } from "../../types";

export const FORUM_LAZY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const FORUM_FAILED_RETRY_MS = 5 * 60 * 1000;
export const FORUM_THREAD_REFRESH_COOLDOWN_MS = 60 * 1000;
export const FORUM_LIKE_ENGAGEMENT_PROBABILITY = 0.3;
export const FORUM_MANUAL_REFRESH_PROBABILITY = 0.6;

const inFlightTaskKeys = new Set<string>();

export const buildForumGenerationTaskKey = (input: {
  ownerIdentityId: string;
  trigger: ForumGenerationTrigger;
  relationId?: string;
  threadId?: string;
  windowKey?: string;
}): string => [
  input.ownerIdentityId,
  input.trigger,
  input.relationId || "virtual",
  input.threadId || "forum",
  input.windowKey || "once",
].join(":");

export const canStartForumGenerationTask = (
  tasks: readonly ForumGenerationTask[],
  taskKey: string,
  now: number,
): boolean => {
  if (inFlightTaskKeys.has(taskKey)) return false;
  const latest = [...tasks]
    .filter((task) => task.taskKey === taskKey)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  if (!latest) return true;
  if (latest.status === "running") return false;
  if (latest.status === "succeeded") return false;
  return !latest.retryAfter || latest.retryAfter <= now;
};

export const beginForumGenerationTask = (input: {
  tasks: readonly ForumGenerationTask[];
  id: string;
  taskKey: string;
  ownerIdentityId: string;
  trigger: ForumGenerationTrigger;
  relationId?: string;
  characterId?: string;
  threadId?: string;
  now: number;
}): { tasks: ForumGenerationTask[]; task?: ForumGenerationTask } => {
  if (!canStartForumGenerationTask(input.tasks, input.taskKey, input.now)) {
    return { tasks: [...input.tasks] };
  }
  inFlightTaskKeys.add(input.taskKey);
  const task: ForumGenerationTask = {
    id: input.id,
    taskKey: input.taskKey,
    ownerIdentityId: input.ownerIdentityId,
    ...(input.relationId ? { relationId: input.relationId } : {}),
    ...(input.characterId ? { characterId: input.characterId } : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
    trigger: input.trigger,
    status: "running",
    startedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  };
  return { tasks: [...input.tasks, task], task };
};

export const finishForumGenerationTask = (
  tasks: readonly ForumGenerationTask[],
  taskId: string,
  status: "succeeded" | "failed",
  now: number,
): ForumGenerationTask[] => tasks.map((task) => {
  if (task.id !== taskId) return task;
  inFlightTaskKeys.delete(task.taskKey);
  return {
    ...task,
    status,
    completedAt: now,
    ...(status === "failed" ? { retryAfter: now + FORUM_FAILED_RETRY_MS } : {}),
    updatedAt: now,
  };
});

export const releaseForumGenerationTask = (taskKey: string): void => {
  inFlightTaskKeys.delete(taskKey);
};

export const removeForumGenerationTasksByRelation = (
  tasks: readonly ForumGenerationTask[],
  relationId: string,
): ForumGenerationTask[] => tasks.filter((task) => task.relationId !== relationId);

export const removeForumGenerationTasksByRelations = (
  tasks: readonly ForumGenerationTask[],
  relationIds: readonly string[],
): ForumGenerationTask[] => {
  const removed = new Set(relationIds);
  return tasks.filter((task) => !task.relationId || !removed.has(task.relationId));
};

export const removeForumGenerationTasksByThread = (
  tasks: readonly ForumGenerationTask[],
  threadId: string,
): ForumGenerationTask[] => tasks.filter((task) => task.threadId !== threadId);

export const clearForumGenerationTasksByIdentity = (
  tasks: readonly ForumGenerationTask[],
  ownerIdentityId: string,
): ForumGenerationTask[] => tasks.filter((task) => task.ownerIdentityId !== ownerIdentityId);

export const hasRecentSuccessfulLazyTask = (
  tasks: readonly ForumGenerationTask[],
  ownerIdentityId: string,
  relationId: string,
  now: number,
): boolean => tasks.some((task) =>
  task.ownerIdentityId === ownerIdentityId
  && task.relationId === relationId
  && task.trigger === "lazy"
  && task.status === "succeeded"
  && now - (task.completedAt || task.updatedAt) < FORUM_LAZY_COOLDOWN_MS);

export const shouldGenerateForumActivity = (
  random: () => number,
  probability: number,
): boolean => random() < Math.max(0, Math.min(1, probability));

export const hasEvaluatedLikeEngagement = (
  tasks: readonly ForumGenerationTask[],
  ownerIdentityId: string,
  threadId: string,
): boolean => tasks.some((task) =>
  task.ownerIdentityId === ownerIdentityId
  && task.threadId === threadId
  && task.trigger === "like-engagement");

export const getThreadRefreshCooldownRemaining = (
  tasks: readonly ForumGenerationTask[],
  ownerIdentityId: string,
  threadId: string,
  now: number,
): number => {
  const latest = [...tasks]
    .filter((task) =>
      task.ownerIdentityId === ownerIdentityId
      && task.threadId === threadId
      && task.trigger === "manual-thread-refresh")
    .sort((left, right) => right.startedAt - left.startedAt)[0];
  return latest
    ? Math.max(0, FORUM_THREAD_REFRESH_COOLDOWN_MS - (now - latest.startedAt))
    : 0;
};
