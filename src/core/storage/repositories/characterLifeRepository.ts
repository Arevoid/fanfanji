import type { CharacterLifeScope } from "../../../domain/characterLife/characterLifeTypes";
import {
  CHARACTER_LIFE_STATE_SCHEMA_VERSION,
  createEmptyCharacterLifeState,
  normalizeCharacterLifeState,
  type CharacterLifeState,
} from "../../../domain/characterLife/lifeStateRuntime";
import {
  normalizeCharacterScheduleStore,
  type CharacterScheduleStore,
} from "../../../domain/characterLife/scheduleRuntime";
import {
  isProactiveIntentRecord,
  type ProactiveIntentRecord,
} from "../../../domain/characterLife/proactiveRuntime";
import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export const CHARACTER_LIFE_RUNTIME_SCHEMA_VERSION = 1 as const;

export interface CharacterLifeRuntimeStore {
  schemaVersion: typeof CHARACTER_LIFE_RUNTIME_SCHEMA_VERSION;
  states: CharacterLifeState[];
  proactiveIntents: ProactiveIntentRecord[];
}

const EMPTY_STORE: CharacterLifeRuntimeStore = {
  schemaVersion: CHARACTER_LIFE_RUNTIME_SCHEMA_VERSION,
  states: [],
  proactiveIntents: [],
};

const sameScope = (left: CharacterLifeScope, right: CharacterLifeScope): boolean =>
  left.relationId === right.relationId
  && left.characterId === right.characterId
  && left.userIdentityId === right.userIdentityId;

const normalizeStore = (value: unknown): CharacterLifeRuntimeStore => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_STORE };
  const candidate = value as Partial<CharacterLifeRuntimeStore>;
  const states = Array.isArray(candidate.states)
    ? candidate.states.map(normalizeCharacterLifeState).filter((state): state is CharacterLifeState => state !== undefined)
    : [];
  const intents = Array.isArray(candidate.proactiveIntents)
    ? candidate.proactiveIntents.filter(isProactiveIntentRecord)
    : [];
  return {
    schemaVersion: CHARACTER_LIFE_RUNTIME_SCHEMA_VERSION,
    states: states.filter((state, index, all) => all.findIndex((item) => sameScope(item, state)) === index),
    proactiveIntents: intents.slice(-256),
  };
};

export const loadCharacterLifeRuntimeStore = (): StorageResult<CharacterLifeRuntimeStore> => {
  const result = readJson<unknown>(storageKeys.characterLifeRuntime, EMPTY_STORE);
  return { ...result, value: normalizeStore(result.value) };
};

export const saveCharacterLifeRuntimeStore = (store: CharacterLifeRuntimeStore): StorageWriteResult =>
  writeJson(storageKeys.characterLifeRuntime, normalizeStore(store));

export const updateCharacterLifeRuntimeStore = (
  update: (store: CharacterLifeRuntimeStore) => CharacterLifeRuntimeStore,
): StorageWriteResult => saveCharacterLifeRuntimeStore(update(loadCharacterLifeRuntimeStore().value));

export const loadCharacterLifeState = (scope: CharacterLifeScope, now = Date.now()): CharacterLifeState =>
  loadCharacterLifeRuntimeStore().value.states.find((state) => sameScope(state, scope))
  || createEmptyCharacterLifeState(scope, now);

export const saveCharacterLifeState = (state: CharacterLifeState): StorageWriteResult =>
  updateCharacterLifeRuntimeStore((store) => ({
    ...store,
    states: [
      ...store.states.filter((candidate) => !sameScope(candidate, state)),
      state,
    ],
  }));

export const loadProactiveIntentRecords = (scope?: CharacterLifeScope): ProactiveIntentRecord[] => {
  const intents = loadCharacterLifeRuntimeStore().value.proactiveIntents;
  return scope ? intents.filter((intent) => sameScope(intent, scope)) : intents;
};

export const saveProactiveIntentRecord = (intent: ProactiveIntentRecord): StorageWriteResult =>
  updateCharacterLifeRuntimeStore((store) => ({
    ...store,
    proactiveIntents: [
      ...store.proactiveIntents.filter((candidate) => candidate.id !== intent.id),
      intent,
    ].slice(-256),
  }));

export const removeCharacterLifeRuntimeForRelations = (relationIds: readonly string[]): StorageWriteResult => {
  const ids = new Set(relationIds.filter(Boolean));
  if (ids.size === 0) return { success: true };
  return updateCharacterLifeRuntimeStore((store) => ({
    ...store,
    states: store.states.filter((state) => !ids.has(state.relationId)),
    proactiveIntents: store.proactiveIntents.filter((intent) => !ids.has(intent.relationId)),
  }));
};

export const characterLifeRepository = {
  load: loadCharacterLifeRuntimeStore,
  save: saveCharacterLifeRuntimeStore,
  update: updateCharacterLifeRuntimeStore,
  loadState: loadCharacterLifeState,
  saveState: saveCharacterLifeState,
  loadProactiveIntents: loadProactiveIntentRecords,
  saveProactiveIntent: saveProactiveIntentRecord,
  removeForRelations: removeCharacterLifeRuntimeForRelations,
};

// Keep the schema symbol reachable for migration/audit code without coupling
// the repository to a destructive migration.
export { CHARACTER_LIFE_STATE_SCHEMA_VERSION };
