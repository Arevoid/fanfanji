import {
  EMPTY_USER_SCHEDULE_STORE,
  normalizeUserScheduleEntry,
  normalizeUserScheduleStore,
  type UserScheduleEntry,
  type UserScheduleStore,
} from "../../../domain/schedule/calendarTypes";
import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export const loadUserScheduleStore = (): StorageResult<UserScheduleStore> => {
  const result = readJson<unknown>(storageKeys.userSchedule, EMPTY_USER_SCHEDULE_STORE);
  return { ...result, value: normalizeUserScheduleStore(result.value) };
};

export const saveUserScheduleStore = (store: UserScheduleStore): StorageWriteResult =>
  writeJson(storageKeys.userSchedule, normalizeUserScheduleStore(store));

export const saveUserScheduleEntry = (entry: UserScheduleEntry): StorageWriteResult => {
  const normalized = normalizeUserScheduleEntry(entry);
  if (!normalized) return { success: false, error: "validation" };
  const current = loadUserScheduleStore().value;
  const existing = current.entries.find((candidate) => candidate.id === normalized.id);
  if (existing && existing.userIdentityId !== normalized.userIdentityId) return { success: false, error: "validation" };
  return saveUserScheduleStore({
    ...current,
    entries: existing
      ? current.entries.map((candidate) => candidate.id === normalized.id ? normalized : candidate)
      : [...current.entries, normalized],
  });
};

export const removeUserScheduleEntry = (id: string, userIdentityId: string): StorageWriteResult => {
  const current = loadUserScheduleStore().value;
  return saveUserScheduleStore({
    ...current,
    entries: current.entries.filter((entry) => !(entry.id === id && entry.userIdentityId === userIdentityId)),
  });
};

export const listUserScheduleByIdentity = (userIdentityId: string): UserScheduleEntry[] =>
  loadUserScheduleStore().value.entries.filter((entry) => entry.userIdentityId === userIdentityId);

export const userScheduleRepository = {
  load: loadUserScheduleStore,
  save: saveUserScheduleStore,
  saveEntry: saveUserScheduleEntry,
  removeEntry: removeUserScheduleEntry,
  listByIdentity: listUserScheduleByIdentity,
};
