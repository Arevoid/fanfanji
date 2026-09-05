import type { CharacterEvent, CharacterEventInput } from "../../../domain/characterLife/characterEventTypes";
import {
  appendCharacterEvents,
  deduplicateCharacterEvents,
  normalizeCharacterEvent,
  removeCharacterEventsByRelations,
} from "../../../domain/characterLife/eventPolicy";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";

const loadRawCharacterEvents = (): StorageResult<unknown[]> => readArray<unknown>(storageKeys.characterEvents, []);

/** Loads valid scoped events and upgrades safe legacy defaults in memory. */
export const loadCharacterEvents = (): StorageResult<CharacterEvent[]> => {
  const result = loadRawCharacterEvents();
  const events = result.value
    .map((event) => normalizeCharacterEvent(event))
    .filter((event): event is CharacterEvent => event !== undefined);
  return { ...result, value: deduplicateCharacterEvents(events) };
};

export const saveCharacterEvents = (events: readonly CharacterEvent[]): StorageWriteResult =>
  writeArray(storageKeys.characterEvents, deduplicateCharacterEvents(events));

export const listByRelation = (
  relationId: string,
  events: readonly CharacterEvent[] = loadCharacterEvents().value,
): CharacterEvent[] => events.filter((event) => event.relationId === relationId);

/** Source lookup may be narrowed to a relation; omitting it is an explicit cross-relation inspection. */
export const findBySource = (
  source: string,
  relationId?: string,
  events: readonly CharacterEvent[] = loadCharacterEvents().value,
): CharacterEvent[] => events.filter((event) => event.source === source && (relationId === undefined || event.relationId === relationId));

export const append = (event: CharacterEventInput): StorageWriteResult => {
  const current = loadCharacterEvents().value;
  return saveCharacterEvents(appendCharacterEvents(current, [event]));
};

export const appendMany = (events: readonly CharacterEventInput[]): StorageWriteResult => {
  const current = loadCharacterEvents().value;
  return saveCharacterEvents(appendCharacterEvents(current, events));
};

export const removeByRelations = (relationIds: readonly string[]): StorageWriteResult => {
  const current = loadCharacterEvents().value;
  return saveCharacterEvents(removeCharacterEventsByRelations(current, relationIds));
};
export const retractByOfflineStoryIds = (storyIds: readonly string[]): StorageWriteResult => {
  const ids = new Set(storyIds.filter(Boolean).map((storyId) => `offline_story:${storyId}:completed`));
  if (ids.size === 0) return { success: true };
  const current = loadCharacterEvents().value;
  return saveCharacterEvents(current.map((event) => ids.has(event.source)
    ? { ...event, status: "retracted" }
    : event));
};

export const characterEventRepository = {
  load: loadCharacterEvents,
  save: saveCharacterEvents,
  listByRelation,
  findBySource,
  append,
  appendMany,
  removeByRelations,
  retractByOfflineStoryIds,
};
