import type { StoryEvent, StoryEventInput } from "../../domain/forumStory/forumStoryTypes";
import { storageKeys } from "../../core/storage/storageKeys";
import type { StorageResult, StorageWriteResult } from "../../core/storage/storageTypes";
import {
  failedStoryWrite,
  isStoryEventRecord,
  loadStoryCollection,
  saveStoryCollection,
} from "./storyStorageUtils";

export const loadEvents = (): StorageResult<StoryEvent[]> =>
  loadStoryCollection(storageKeys.forumStoryEvents, isStoryEventRecord);

export const listEvents = (storyId: string): StoryEvent[] =>
  loadEvents().value
    .filter((event) => event.storyId === storyId)
    .sort((left, right) => left.sequence - right.sequence);

export interface StoryEventAppendResult extends StorageWriteResult {
  /** The event with repository-assigned sequence after a successful append. */
  event?: StoryEvent;
}

/**
 * Events are append-only. Existing records are never replaced, even when the
 * caller submits the same ID with different content.
 */
export const appendEvent = (event: StoryEventInput): StoryEventAppendResult => {
  const current = loadEvents().value;
  const duplicateId = current.some((item) => item.storyId === event.storyId && item.id === event.id);
  const duplicateKey = event.idempotencyKey !== undefined
    && current.some((item) => item.storyId === event.storyId && item.idempotencyKey === event.idempotencyKey);
  if (duplicateId || duplicateKey) return failedStoryWrite();

  const storyEvents = current.filter((item) => item.storyId === event.storyId);
  const latestOccurredAt = storyEvents.reduce((latest, item) => Math.max(latest, item.occurredAt), Number.NEGATIVE_INFINITY);
  if (storyEvents.length > 0 && event.occurredAt < latestOccurredAt) return failedStoryWrite();

  const nextSequence = storyEvents.reduce((max, item) => Math.max(max, item.sequence), 0) + 1;
  const normalizedEvent: StoryEvent = { ...event, sequence: nextSequence };
  if (!isStoryEventRecord(normalizedEvent)) return failedStoryWrite();
  const write = saveStoryCollection(storageKeys.forumStoryEvents, [...current, normalizedEvent]);
  return write.success ? { ...write, event: normalizedEvent } : write;
};

export const StoryEventRepository = {
  load: loadEvents,
  appendEvent,
  listEvents,
};

export const storyEventRepository = StoryEventRepository;
