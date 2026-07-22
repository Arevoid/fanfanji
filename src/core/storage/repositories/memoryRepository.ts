import type { MemoryItem, MemoryVaultSettings } from "../../../types";
import { storageKeys } from "../storageKeys";
import { readArray, readObject, writeArray } from "./repositoryUtils";
import { writeJson } from "../storageAdapter";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export const loadMemories = (fallback: MemoryItem[]): StorageResult<MemoryItem[]> => readArray(storageKeys.memoryVaultItems, fallback);
export const saveMemories = (memories: MemoryItem[]): StorageWriteResult => writeArray(storageKeys.memoryVaultItems, memories);
export const loadMemorySettings = (fallback: MemoryVaultSettings): StorageResult<MemoryVaultSettings> => readObject(storageKeys.memoryVaultSettings, fallback);
export const saveMemorySettings = (settings: MemoryVaultSettings): StorageWriteResult => writeJson(storageKeys.memoryVaultSettings, settings);
