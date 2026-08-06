import type { StoryThread } from "../../domain/forumStory/forumStoryTypes";
import { storageKeys } from "../../core/storage/storageKeys";
import type { StorageResult, StorageWriteResult } from "../../core/storage/storageTypes";
import {
  failedStoryWrite,
  isStoryThreadRecord,
  loadStoryCollection,
  saveStoryCollection,
} from "./storyStorageUtils";

export type StoryThreadPatch = Partial<Omit<StoryThread, "id" | "storyId">>;

export const loadThreads = (): StorageResult<StoryThread[]> =>
  loadStoryCollection(storageKeys.forumStoryThreads, isStoryThreadRecord);

export const listThreads = (storyId: string): StoryThread[] =>
  loadThreads().value.filter((thread) => thread.storyId === storyId);

export const getThread = (storyId: string, threadId: string): StoryThread | undefined =>
  listThreads(storyId).find((thread) => thread.id === threadId);

export const createThread = (thread: StoryThread): StorageWriteResult => {
  const normalizedThread: StoryThread = {
    ...thread,
    viewCount: thread.viewCount ?? 0,
    likeCount: thread.likeCount ?? 0,
  };
  if (!isStoryThreadRecord(normalizedThread)) return failedStoryWrite();
  const current = loadThreads().value;
  if (current.some((item) => item.storyId === normalizedThread.storyId && item.id === normalizedThread.id)) return failedStoryWrite();
  return saveStoryCollection(storageKeys.forumStoryThreads, [...current, normalizedThread]);
};

export const updateThread = (storyId: string, threadId: string, patch: StoryThreadPatch): StorageWriteResult => {
  const current = loadThreads().value;
  const index = current.findIndex((thread) => thread.storyId === storyId && thread.id === threadId);
  if (index < 0) return failedStoryWrite();

  const nextThread: StoryThread = {
    ...current[index],
    ...patch,
    id: threadId,
    storyId,
    updatedAt: patch.updatedAt ?? Date.now(),
  };
  if (!isStoryThreadRecord(nextThread)) return failedStoryWrite();

  const next = [...current];
  next[index] = nextThread;
  return saveStoryCollection(storageKeys.forumStoryThreads, next);
};

export const StoryThreadRepository = {
  load: loadThreads,
  createThread,
  getThread,
  updateThread,
  listThreads,
};

export const storyThreadRepository = StoryThreadRepository;
