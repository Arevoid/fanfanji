import type { OfflineStory } from "../../../types";
import { storageKeys } from "../storageKeys";
import { readString, remove, writeString } from "../storageAdapter";
import { readArray, writeArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export const loadOfflineStories = (fallback: OfflineStory[]): StorageResult<OfflineStory[]> => readArray(storageKeys.offlineStories, fallback);
export const saveOfflineStories = (stories: OfflineStory[]): StorageWriteResult => writeArray(storageKeys.offlineStories, stories);

/** Relation-scoped workspace markers keep same-character stories separate per identity. */
export const loadOfflineStorySessionId = (relationId: string) => readString(storageKeys.offlineStoryIdByRelation(relationId));
export const loadLegacyOfflineStorySessionId = (characterId: string) => readString(storageKeys.offlineStoryId(characterId));
export const saveOfflineStorySession = (relationId: string, storyId: string): StorageWriteResult => {
  const storyResult = writeString(storageKeys.offlineStoryIdByRelation(relationId), storyId);
  const modeResult = writeString(storageKeys.offlineModeActiveByRelation(relationId), "true");
  return !storyResult.success ? storyResult : modeResult;
};
export const clearOfflineStorySession = (relationId: string): StorageWriteResult => {
  const storyResult = remove(storageKeys.offlineStoryIdByRelation(relationId));
  const modeResult = writeString(storageKeys.offlineModeActiveByRelation(relationId), "false");
  return !storyResult.success ? storyResult : modeResult;
};
