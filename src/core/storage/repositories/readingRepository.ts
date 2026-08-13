import { normalizeReadingStore } from "../../../domain/reading/normalization";
import { createEmptyReadingStore, type ReadingStore } from "../../../domain/reading/types";
import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export function loadReadingStore(): StorageResult<ReadingStore> {
  const loaded = readJson<unknown>(storageKeys.readingStore, createEmptyReadingStore());
  return {
    ...loaded,
    value: normalizeReadingStore(loaded.value),
  };
}

export function saveReadingStore(store: ReadingStore): StorageWriteResult {
  return writeJson(storageKeys.readingStore, normalizeReadingStore(store));
}
