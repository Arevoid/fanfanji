import type { CharacterLifeScope } from "../../../domain/characterLife/characterLifeTypes";
import {
  EMPTY_CHARACTER_SCHEDULE_STORE,
  listCharacterSchedule,
  normalizeCharacterScheduleStore,
  type CharacterScheduleEntry,
  type CharacterScheduleStore,
} from "../../../domain/characterLife/scheduleRuntime";
import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

const sameScope = (left: CharacterLifeScope, right: CharacterLifeScope): boolean =>
  left.relationId === right.relationId && left.characterId === right.characterId && left.userIdentityId === right.userIdentityId;

export const loadCharacterScheduleStore = (): StorageResult<CharacterScheduleStore> => {
  const result = readJson<unknown>(storageKeys.characterSchedule, EMPTY_CHARACTER_SCHEDULE_STORE);
  return { ...result, value: normalizeCharacterScheduleStore(result.value) };
};

export const saveCharacterScheduleStore = (store: CharacterScheduleStore): StorageWriteResult =>
  writeJson(storageKeys.characterSchedule, normalizeCharacterScheduleStore(store));

export const saveCharacterScheduleEntry = (entry: CharacterScheduleEntry): StorageWriteResult => {
  const current = loadCharacterScheduleStore().value;
  const existing = current.entries.find((item) => item.id === entry.id);
  if (existing && !sameScope(existing, entry)) return { success: false, error: "validation" };
  return saveCharacterScheduleStore({
    ...current,
    entries: existing
      ? current.entries.map((item) => item.id === entry.id ? entry : item)
      : [...current.entries, entry],
  });
};

export const listCharacterScheduleByScope = (scope: CharacterLifeScope): CharacterScheduleEntry[] =>
  listCharacterSchedule(loadCharacterScheduleStore().value.entries, scope);

export const removeCharacterScheduleForRelations = (relationIds: readonly string[]): StorageWriteResult => {
  const ids = new Set(relationIds.filter(Boolean));
  if (ids.size === 0) return { success: true };
  const current = loadCharacterScheduleStore().value;
  return saveCharacterScheduleStore({
    ...current,
    entries: current.entries.filter((entry) => !ids.has(entry.relationId)),
  });
};

export const characterScheduleRepository = {
  load: loadCharacterScheduleStore,
  save: saveCharacterScheduleStore,
  saveEntry: saveCharacterScheduleEntry,
  listByScope: listCharacterScheduleByScope,
  removeForRelations: removeCharacterScheduleForRelations,
};
