import type { OfflineStory } from "../../../types";
import { storageKeys } from "../storageKeys";
import { readArray, writeArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export const loadOfflineStories = (fallback: OfflineStory[]): StorageResult<OfflineStory[]> => readArray(storageKeys.offlineStories, fallback);
export const saveOfflineStories = (stories: OfflineStory[]): StorageWriteResult => writeArray(storageKeys.offlineStories, stories);
