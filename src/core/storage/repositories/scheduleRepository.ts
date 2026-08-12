import { EMPTY_SCHEDULE_STORE, SCHEDULE_SCHEMA_VERSION, type ScheduleEntry, type ScheduleStore } from "../../../domain/schedule/scheduleTypes";
import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const ENTRY_STATUSES = new Set(["negotiating", "confirmed", "preparing", "in_progress", "completed", "cancelled", "expired"]);

const isScheduleEntry = (value: unknown): value is ScheduleEntry => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<ScheduleEntry>;
  return entry.schemaVersion === SCHEDULE_SCHEMA_VERSION
    && entry.category === "appointment"
    && isNonEmptyString(entry.id)
    && isNonEmptyString(entry.title)
    && typeof entry.status === "string"
    && ENTRY_STATUSES.has(entry.status)
    && isNonEmptyString(entry.relationId)
    && isNonEmptyString(entry.characterId)
    && isNonEmptyString(entry.userIdentityId)
    && typeof entry.createdAt === "number"
    && typeof entry.updatedAt === "number";
};

export const loadScheduleStore = (): StorageResult<ScheduleStore> => {
  const result = readJson<unknown>(storageKeys.scheduleStore, EMPTY_SCHEDULE_STORE);
  if (!result.found || !result.valid) return { ...result, value: EMPTY_SCHEDULE_STORE };
  if (!result.value || typeof result.value !== "object" || Array.isArray(result.value)) {
    return { value: EMPTY_SCHEDULE_STORE, found: true, valid: false, error: "parse" };
  }
  const store = result.value as Partial<ScheduleStore>;
  if (store.schemaVersion !== SCHEDULE_SCHEMA_VERSION || !Array.isArray(store.entries) || !store.entries.every(isScheduleEntry)) {
    return { value: EMPTY_SCHEDULE_STORE, found: true, valid: false, error: "parse" };
  }
  return { value: store as ScheduleStore, found: true, valid: true };
};

export const saveScheduleStore = (store: ScheduleStore): StorageWriteResult => {
  if (store.schemaVersion !== SCHEDULE_SCHEMA_VERSION || !Array.isArray(store.entries) || !store.entries.every(isScheduleEntry)) {
    return { success: false, error: "validation" };
  }
  return writeJson(storageKeys.scheduleStore, store);
};
