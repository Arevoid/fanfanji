import type { MemoryItem, MemoryVaultSettings } from "../../../types";
import { storageKeys } from "../storageKeys";
import { readArray, readObject, writeArray } from "./repositoryUtils";
import { writeJson } from "../storageAdapter";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { decompressMemoryContent, compressMemoriesForStorage, MEMORY_COMPRESSION_PREFIX, type MemoryCompressionResult } from "../memoryCompression";

export const loadMemories = (fallback: MemoryItem[]): StorageResult<MemoryItem[]> => {
  const result = readArray<MemoryItem>(storageKeys.memoryVaultItems, fallback);
  return {
    ...result,
    value: result.value.map((memory) => ({
      ...memory,
      content: typeof memory.content === "string" ? decompressMemoryContent(memory.content) : memory.content,
    })),
  };
};
export const saveMemories = (memories: MemoryItem[]): StorageWriteResult =>
  writeArray(storageKeys.memoryVaultItems, compressMemoriesForStorage(memories).records);
export const compressStoredMemories = (now = Date.now()): { result: MemoryCompressionResult; write: StorageWriteResult } => {
  const raw = readArray<MemoryItem>(storageKeys.memoryVaultItems, []);
  const alreadyCompressedIds = new Set(raw.value
    .filter((memory) => typeof memory?.content === "string" && memory.content.startsWith(MEMORY_COMPRESSION_PREFIX))
    .map((memory) => memory.id)
    .filter((id): id is string => typeof id === "string"));
  const loaded = {
    ...raw,
    value: raw.value.map((memory) => ({
      ...memory,
      content: typeof memory.content === "string" ? decompressMemoryContent(memory.content) : memory.content,
    })),
  };
  const prepared = compressMemoriesForStorage(loaded.value, now);
  const result: MemoryCompressionResult = {
    ...prepared.result,
    processed: Math.max(0, prepared.result.processed - alreadyCompressedIds.size),
    compressed: Math.max(0, prepared.result.compressed - alreadyCompressedIds.size),
  };
  const write = result.compressed > 0
    ? writeArray(storageKeys.memoryVaultItems, prepared.records)
    : { success: true as const };
  return { result, write };
};
export const loadMemorySettings = (fallback: MemoryVaultSettings): StorageResult<MemoryVaultSettings> => readObject(storageKeys.memoryVaultSettings, fallback);
export const saveMemorySettings = (settings: MemoryVaultSettings): StorageWriteResult => writeJson(storageKeys.memoryVaultSettings, settings);
