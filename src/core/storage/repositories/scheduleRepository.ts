import { normalizeAppointment } from "../../../domain/schedule/appointmentPolicy";
import { isSameScheduleScope, listByScheduleScope } from "../../../domain/schedule/scheduleScope";
import {
  EMPTY_SCHEDULE_STORE,
  SCHEDULE_SCHEMA_VERSION,
  type Appointment,
  type ScheduleScope,
  type ScheduleStore,
} from "../../../domain/schedule/scheduleTypes";
import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

interface PersistedScheduleStore {
  schemaVersion: number;
  appointments?: unknown[];
  /** First-round empty foundation field; never treated as appointment truth. */
  entries?: unknown[];
}

const normalizeScheduleStore = (value: unknown): ScheduleStore | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const store = value as PersistedScheduleStore;
  if (store.schemaVersion !== SCHEDULE_SCHEMA_VERSION) return undefined;
  const rawAppointments = store.appointments ?? [];
  if (!Array.isArray(rawAppointments)) return undefined;
  const appointments = rawAppointments.map(normalizeAppointment);
  if (appointments.some((appointment) => appointment === undefined)) return undefined;
  const normalized = appointments as Appointment[];
  const seenIds = new Set<string>();
  for (const appointment of normalized) {
    if (seenIds.has(appointment.id)) return undefined;
    seenIds.add(appointment.id);
  }
  return { schemaVersion: SCHEDULE_SCHEMA_VERSION, appointments: normalized };
};

export const loadScheduleStore = (): StorageResult<ScheduleStore> => {
  const result = readJson<unknown>(storageKeys.scheduleStore, EMPTY_SCHEDULE_STORE);
  if (!result.found || !result.valid) return { ...result, value: EMPTY_SCHEDULE_STORE };
  const store = normalizeScheduleStore(result.value);
  if (!store) return { value: EMPTY_SCHEDULE_STORE, found: true, valid: false, error: "parse" };
  return { value: store, found: true, valid: true };
};

export const saveScheduleStore = (store: ScheduleStore): StorageWriteResult => {
  const normalized = normalizeScheduleStore(store);
  if (!normalized) return { success: false, error: "validation" };
  return writeJson(storageKeys.scheduleStore, normalized);
};

export const listAppointmentsByScope = (
  scope: ScheduleScope,
  store: ScheduleStore = loadScheduleStore().value,
): Appointment[] => listByScheduleScope(store.appointments, scope);

export type ScheduleMutationResult =
  | { success: true; store: ScheduleStore }
  | { success: false; store: ScheduleStore; reason: "invalid_appointment" | "scope_conflict" };

/** Prevents an existing appointment ID from being overwritten by another relationship scope. */
export const upsertAppointment = (store: ScheduleStore, input: Appointment): ScheduleMutationResult => {
  const appointment = normalizeAppointment(input);
  if (!appointment) return { success: false, store, reason: "invalid_appointment" };
  const existing = store.appointments.find((item) => item.id === appointment.id);
  if (existing && !isSameScheduleScope(existing, appointment)) {
    return { success: false, store, reason: "scope_conflict" };
  }
  return {
    success: true,
    store: {
      schemaVersion: SCHEDULE_SCHEMA_VERSION,
      appointments: existing
        ? store.appointments.map((item) => item.id === appointment.id ? appointment : item)
        : [...store.appointments, appointment],
    },
  };
};

export const saveAppointment = (appointment: Appointment): StorageWriteResult => {
  const current = loadScheduleStore().value;
  const result = upsertAppointment(current, appointment);
  if (!result.success) return { success: false, error: "validation" };
  return saveScheduleStore(result.store);
};

export const removeAppointmentsByRelations = (
  relationIds: readonly string[],
  store: ScheduleStore = loadScheduleStore().value,
): ScheduleStore => {
  const removed = new Set(relationIds.filter(Boolean));
  return {
    schemaVersion: SCHEDULE_SCHEMA_VERSION,
    appointments: store.appointments.filter((appointment) => !removed.has(appointment.relationId)),
  };
};
