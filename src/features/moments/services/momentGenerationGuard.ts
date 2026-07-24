import type { Moment } from "../../../types";
import {
  loadMomentGenerationTasks,
  saveMomentGenerationTasks,
  type MomentGenerationTask,
} from "../../../core/storage/repositories/momentGenerationRepository";

const inFlightTaskKeys = new Set<string>();

export const getLocalMomentGenerationDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getCharacterMomentTaskKey = (characterId: string, date: Date): string =>
  `character-moment:${characterId}:${getLocalMomentGenerationDate(date)}`;

export function claimCharacterMomentGeneration(characterId: string, now: Date): string | undefined {
  const taskKey = getCharacterMomentTaskKey(characterId, now);
  const tasks = loadMomentGenerationTasks().value;
  if (tasks[taskKey] || inFlightTaskKeys.has(taskKey)) return undefined;

  inFlightTaskKeys.add(taskKey);
  return taskKey;
}

export function completeCharacterMomentGeneration(taskKey: string, moment: Moment, now: Date): boolean {
  const tasks = loadMomentGenerationTasks().value;
  const task: MomentGenerationTask = {
    taskKey,
    characterId: moment.characterId || "",
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

export function releaseCharacterMomentGeneration(taskKey: string): void {
  inFlightTaskKeys.delete(taskKey);
}

export function recordDeletedCharacterMoment(moment: Moment, now = new Date()): boolean {
  if (!moment.characterId) return true;

  const date = new Date(moment.timestamp);
  const taskKey = getCharacterMomentTaskKey(moment.characterId, date);
  const tasks = loadMomentGenerationTasks().value;
  const existing = tasks[taskKey];
  const task: MomentGenerationTask = {
    taskKey,
    characterId: moment.characterId,
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
