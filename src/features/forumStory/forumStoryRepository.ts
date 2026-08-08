import type { ForumStory } from "../../domain/forumStory/forumStoryTypes";
import { storageKeys } from "../../core/storage/storageKeys";
import type { StorageResult, StorageWriteResult } from "../../core/storage/storageTypes";
import {
  failedStoryWrite,
  isForumStoryRecord,
  loadStoryCollection,
  saveStoryCollection,
} from "./storyStorageUtils";

export type ForumStoryPatch = Partial<Omit<ForumStory, "id">>;

export const loadStories = (): StorageResult<ForumStory[]> =>
  loadStoryCollection(storageKeys.forumStories, isForumStoryRecord);

export const listStories = (): ForumStory[] => loadStories().value;

export const getStory = (storyId: string): ForumStory | undefined =>
  listStories().find((story) => story.id === storyId);

export const createStory = (story: ForumStory): StorageWriteResult => {
  if (!isForumStoryRecord(story)) return failedStoryWrite();
  const current = listStories();
  if (current.some((item) => item.id === story.id)) return failedStoryWrite();
  return saveStoryCollection(storageKeys.forumStories, [...current, story]);
};

export const updateStory = (storyId: string, patch: ForumStoryPatch): StorageWriteResult => {
  const current = listStories();
  const index = current.findIndex((story) => story.id === storyId);
  if (index < 0) return failedStoryWrite();

  const nextStory: ForumStory = {
    ...current[index],
    ...patch,
    id: storyId,
    updatedAt: patch.updatedAt ?? Date.now(),
  };
  if (!isForumStoryRecord(nextStory)) return failedStoryWrite();

  const next = [...current];
  next[index] = nextStory;
  return saveStoryCollection(storageKeys.forumStories, next);
};

/** Removes only the story root from the readable story list. Dependent
 * append-only records remain isolated and unreachable, preserving their audit
 * history instead of mutating historical events or replies. */
export const deleteStory = (storyId: string): StorageWriteResult => {
  const current = listStories();
  if (!current.some((story) => story.id === storyId)) return failedStoryWrite();
  return saveStoryCollection(storageKeys.forumStories, current.filter((story) => story.id !== storyId));
};

export const ForumStoryRepository = {
  load: loadStories,
  createStory,
  getStory,
  updateStory,
  deleteStory,
  listStories,
};

export const forumStoryRepository = ForumStoryRepository;
