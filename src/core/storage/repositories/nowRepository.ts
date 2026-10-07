import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readArray, writeArray } from "./repositoryUtils";
import { storageKeys } from "../storageKeys";
import { isNowObservationThread, type NowObservationThread } from "../../../domain/now/nowTypes";

const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const loadNowObservationThreads = (): StorageResult<NowObservationThread[]> => {
  const result = readArray<unknown>(storageKeys.nowStore, []);
  return { ...result, value: result.value.filter(isNowObservationThread) };
};

export const saveNowObservationThreads = (threads: NowObservationThread[]): StorageWriteResult => {
  const result = writeArray(storageKeys.nowStore, threads);
  if (result.success) emit();
  return result;
};

export const subscribeNowObservationState = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

