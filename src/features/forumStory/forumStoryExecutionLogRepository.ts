import type { ForumStoryExecutionLog } from "../../domain/forumStory/forumStoryTypes";
import { storageKeys } from "../../core/storage/storageKeys";
import type { StorageResult, StorageWriteResult } from "../../core/storage/storageTypes";
import {
  failedStoryWrite,
  isForumStoryExecutionLogRecord,
  loadStoryCollection,
  saveStoryCollection,
} from "./storyStorageUtils";

export type ForumStoryExecutionLogPatch = Partial<Omit<ForumStoryExecutionLog, "id" | "storyId">>;

export const loadExecutionLogs = (): StorageResult<ForumStoryExecutionLog[]> =>
  loadStoryCollection(storageKeys.forumStoryExecutionLogs, isForumStoryExecutionLogRecord);

export const getLogsByStoryId = (storyId: string): ForumStoryExecutionLog[] =>
  loadExecutionLogs().value
    .filter((log) => log.storyId === storyId)
    .sort((left, right) => left.startedAt - right.startedAt);

export const createLog = (log: ForumStoryExecutionLog): StorageWriteResult => {
  if (!isForumStoryExecutionLogRecord(log)) return failedStoryWrite();
  const current = loadExecutionLogs().value;
  if (current.some((item) => item.storyId === log.storyId && item.id === log.id)) return failedStoryWrite();
  return saveStoryCollection(storageKeys.forumStoryExecutionLogs, [...current, log]);
};

export const updateLog = (
  storyId: string,
  logId: string,
  patch: ForumStoryExecutionLogPatch,
): StorageWriteResult => {
  const current = loadExecutionLogs().value;
  const index = current.findIndex((log) => log.storyId === storyId && log.id === logId);
  if (index < 0) return failedStoryWrite();

  const nextLog: ForumStoryExecutionLog = {
    ...current[index],
    ...patch,
    id: logId,
    storyId,
  };
  if (!isForumStoryExecutionLogRecord(nextLog)) return failedStoryWrite();

  const next = [...current];
  next[index] = nextLog;
  return saveStoryCollection(storageKeys.forumStoryExecutionLogs, next);
};

export const ForumStoryExecutionLogRepository = {
  load: loadExecutionLogs,
  createLog,
  updateLog,
  getLogsByStoryId,
};

export const forumStoryExecutionLogRepository = ForumStoryExecutionLogRepository;

