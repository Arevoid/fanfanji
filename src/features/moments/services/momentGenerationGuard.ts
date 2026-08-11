import type { Moment } from "../../../types";
import {
  loadMomentGenerationTasks,
  saveMomentGenerationTasks,
  type MomentGenerationTask,
} from "../../../core/storage/repositories/momentGenerationRepository";

const inFlightTaskKeys = new Set<string>();
export const BLOCKED_MOMENT_RETRY_COOLDOWN_MS = 3 * 60 * 60 * 1000;

export const getLocalMomentGenerationDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getCharacterMomentTaskKey = (characterId: string, date: Date, relationId?: string): string =>
  relationId
    ? `character-moment:relation:${relationId}:${getLocalMomentGenerationDate(date)}`
    : `character-moment:${characterId}:${getLocalMomentGenerationDate(date)}`;

export function claimCharacterMomentGeneration(characterId: string, now: Date, relationId?: string): string | undefined {
  const taskKey = getCharacterMomentTaskKey(characterId, now, relationId);
  const tasks = loadMomentGenerationTasks().value;
  const existing = tasks[taskKey];
  const blockedCooldownExpired = existing?.status === "blocked"
    && now.getTime() - existing.updatedAt >= BLOCKED_MOMENT_RETRY_COOLDOWN_MS;
  if ((existing && !blockedCooldownExpired) || inFlightTaskKeys.has(taskKey)) return undefined;

  inFlightTaskKeys.add(taskKey);
  return taskKey;
}

export function completeBlockedCharacterMomentGeneration(
  taskKey: string,
  characterId: string,
  relationId: string | undefined,
  now: Date,
): boolean {
  const tasks = loadMomentGenerationTasks().value;
  const task: MomentGenerationTask = {
    taskKey,
    characterId,
    relationId,
    date: getLocalMomentGenerationDate(now),
    type: "character-moment",
    status: "blocked",
    blockedReason: "prohibited-content",
    updatedAt: now.getTime(),
  };
  const result = saveMomentGenerationTasks({ ...tasks, [taskKey]: task });
  inFlightTaskKeys.delete(taskKey);
  return result.success;
}

export function completeCharacterMomentGeneration(taskKey: string, moment: Moment, now: Date): boolean {
  const tasks = loadMomentGenerationTasks().value;
  const task: MomentGenerationTask = {
    taskKey,
    characterId: moment.characterId || "",
    relationId: moment.relationId,
    date: getLocalMomentGenerationDate(now),
    type: "character-moment",
    status: "generated",
    momentId: moment.id,
    updatedAt: now.getTime(),
  };
  const result = saveMomentGenerationTasks({ ...tasks, [taskKey]: task });
  inFlightTaskKeys.delete(taskKey);
  return result.success;
}

export function completeSkippedCharacterMomentGeneration(
  taskKey: string,
  characterId: string,
  relationId: string | undefined,
  now: Date,
): boolean {
  const tasks = loadMomentGenerationTasks().value;
  const task: MomentGenerationTask = {
    taskKey,
    characterId,
    relationId,
    date: getLocalMomentGenerationDate(now),
    type: "character-moment",
    status: "skipped",
    updatedAt: now.getTime(),
  };
  const result = saveMomentGenerationTasks({ ...tasks, [taskKey]: task });
  inFlightTaskKeys.delete(taskKey);
  return result.success;
}

export function releaseCharacterMomentGeneration(taskKey: string): void {
  inFlightTaskKeys.delete(taskKey);
}

export function recordDeletedCharacterMoment(moment: Moment, now = new Date()): boolean {
  if (!moment.characterId) return true;

  const date = new Date(moment.timestamp);
  const taskKey = getCharacterMomentTaskKey(moment.characterId, date, moment.relationId);
  const tasks = loadMomentGenerationTasks().value;
  const existing = tasks[taskKey];
  const task: MomentGenerationTask = {
    taskKey,
    characterId: moment.characterId,
    relationId: moment.relationId,
    date: getLocalMomentGenerationDate(date),
    type: "character-moment",
    status: "deleted",
    momentId: moment.id,
    updatedAt: now.getTime(),
  };
  const result = saveMomentGenerationTasks({ ...tasks, [taskKey]: { ...existing, ...task } });
  inFlightTaskKeys.delete(taskKey);
  return result.success;
}

export function resetMomentGenerationRuntimeForTests(): void {
  inFlightTaskKeys.clear();
}
