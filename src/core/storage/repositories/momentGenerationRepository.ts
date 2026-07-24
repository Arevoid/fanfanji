import { storageKeys } from "../storageKeys";
import { readObject } from "./repositoryUtils";
import { writeJson } from "../storageAdapter";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export type MomentGenerationTaskStatus = "generated" | "deleted";

export interface MomentGenerationTask {
  taskKey: string;
  characterId: string;
  date: string;
  type: "character-moment";
  status: MomentGenerationTaskStatus;
  momentId?: string;
  updatedAt: number;
}

export type MomentGenerationTaskMap = Record<string, MomentGenerationTask>;

export const loadMomentGenerationTasks = (): StorageResult<MomentGenerationTaskMap> =>
  readObject<MomentGenerationTaskMap>(storageKeys.momentGenerationTasks, {});

export const saveMomentGenerationTasks = (tasks: MomentGenerationTaskMap): StorageWriteResult =>
  writeJson(storageKeys.momentGenerationTasks, tasks);
