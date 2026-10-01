import {
  EMPTY_PERIOD_STORE,
  normalizePeriodRecord,
  normalizePeriodStore,
  type PeriodRecord,
  type PeriodStore,
} from "../../../domain/schedule/calendarTypes";
import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export const loadPeriodStore = (): StorageResult<PeriodStore> => {
  const result = readJson<unknown>(storageKeys.periodRecords, EMPTY_PERIOD_STORE);
  return { ...result, value: normalizePeriodStore(result.value) };
};

export const savePeriodStore = (store: PeriodStore): StorageWriteResult =>
  writeJson(storageKeys.periodRecords, normalizePeriodStore(store));

export const savePeriodRecord = (record: PeriodRecord): StorageWriteResult => {
  const normalized = normalizePeriodRecord(record);
  if (!normalized) return { success: false, error: "validation" };
  const current = loadPeriodStore().value;
  const existing = current.records.find((candidate) => candidate.id === normalized.id);
  if (existing && existing.userIdentityId !== normalized.userIdentityId) return { success: false, error: "validation" };
  return savePeriodStore({
    ...current,
    records: existing
      ? current.records.map((candidate) => candidate.id === normalized.id ? normalized : candidate)
      : [...current.records, normalized],
  });
};

export const removePeriodRecordById = (recordId: string, userIdentityId?: string): StorageWriteResult => {
  const current = loadPeriodStore().value;
  const nextRecords = current.records.filter((record) => !(record.id === recordId && (!userIdentityId || record.userIdentityId === userIdentityId)));
  if (nextRecords.length === current.records.length) return { success: false, error: "missing" };
  return savePeriodStore({ ...current, records: nextRecords });
};

export const periodRepository = {
  load: loadPeriodStore,
  save: savePeriodStore,
  saveRecord: savePeriodRecord,
  removeById: removePeriodRecordById,
};
