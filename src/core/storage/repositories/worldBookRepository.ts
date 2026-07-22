import type { WorldBookEntry } from "../../../types";
import { storageKeys } from "../storageKeys";
import { writeArray, readArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export function mergeDefaultWorldBookEntries(entries: WorldBookEntry[], defaults: WorldBookEntry[]): WorldBookEntry[] {
  const merged = [...entries];
  for (const entry of defaults) {
    if (!merged.some((saved) => saved.id === entry.id || saved.title === entry.title)) merged.push(entry);
  }
  return merged;
}

export function loadWorldBookEntries(defaults: WorldBookEntry[]): StorageResult<WorldBookEntry[]> {
  const result = readArray<WorldBookEntry>(storageKeys.worldBookEntries, defaults);
  if (!result.found || !result.valid) return { ...result, value: defaults };
  return { ...result, value: mergeDefaultWorldBookEntries(result.value, defaults) };
}

export const saveWorldBookEntries = (entries: WorldBookEntry[]): StorageWriteResult => writeArray(storageKeys.worldBookEntries, entries);
