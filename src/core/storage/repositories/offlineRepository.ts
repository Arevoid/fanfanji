import type { OfflineStory } from "../../../types";
import { storageKeys } from "../storageKeys";
import { readArray, writeArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export const loadOfflineStories = (fallback: OfflineStory[]): StorageResult<OfflineStory[]> => readArray(storageKeys.offlineStories, fallback);
export const saveOfflineStories = (stories: OfflineStory[]): StorageWriteResult => writeArray(storageKeys.offlineStories, stories);

// The app hydrates IndexedDB stories once. Source validation must use that live
// snapshot rather than the obsolete localStorage copy after storage migration.
let sourceReader: (() => readonly OfflineStory[] | undefined) | undefined;
export function installOfflineSourceReader(reader: () => readonly OfflineStory[] | undefined) {
  sourceReader = reader;
  return () => { if (sourceReader === reader) sourceReader = undefined; };
}
export const readOfflineSourceStories = () => sourceReader?.();

export function mergeOfflineStoryCollections(
  localStories: readonly OfflineStory[],
  durableStories: readonly OfflineStory[],
): OfflineStory[] {
  const merged = new Map<string, OfflineStory>();
  [...localStories, ...durableStories].forEach((story) => {
    const current = merged.get(story.id);
    if (!current
      || story.updatedAt > current.updatedAt
      || (story.updatedAt === current.updatedAt && story.messages.length > current.messages.length)) {
      merged.set(story.id, story);
    }
  });
  return Array.from(merged.values()).sort((left, right) => right.updatedAt - left.updatedAt);
}
