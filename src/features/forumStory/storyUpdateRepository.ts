import type { StoryUpdate } from "../../domain/forumStory/forumStoryTypes";
import { storageKeys } from "../../core/storage/storageKeys";
import type { StorageResult, StorageWriteResult } from "../../core/storage/storageTypes";
import {
  failedStoryWrite,
  isStoryUpdateRecord,
  loadStoryCollection,
  saveStoryCollection,
} from "./storyStorageUtils";

export const loadUpdates = (): StorageResult<StoryUpdate[]> =>
  loadStoryCollection(storageKeys.forumStoryUpdates, isStoryUpdateRecord);

export const listUpdates = (storyId: string): StoryUpdate[] =>
  loadUpdates().value
    .filter((update) => update.storyId === storyId)
    .sort((left, right) => left.updatedAt - right.updatedAt);

export const appendUpdate = (update: StoryUpdate): StorageWriteResult => {
  if (!isStoryUpdateRecord(update)) return failedStoryWrite();
  const current = loadUpdates().value;
  if (current.some((item) => item.storyId === update.storyId && item.id === update.id)) return failedStoryWrite();
  return saveStoryCollection(storageKeys.forumStoryUpdates, [...current, update]);
};

export const StoryUpdateRepository = {
  load: loadUpdates,
  appendUpdate,
  listUpdates,
};

export const storyUpdateRepository = StoryUpdateRepository;
