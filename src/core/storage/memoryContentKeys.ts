import { storageKeys } from "./storageKeys";

export const MEMORY_CONTENT_DB_NAME = "FanfanjiMemoryContentDB";
export const LEGACY_MEMORY_TRANSACTION_KEY = "phone_memory_restore_transaction_v1";
const keys = new Set<string>([
  storageKeys.characterKnowledgeClaims, storageKeys.conversationSummaries,
  storageKeys.behaviorCorrections, storageKeys.memoryVaultItems, storageKeys.memoryVaultSettings,
  storageKeys.characterKnowledgeMigrationState, storageKeys.diaryEntries, storageKeys.diaryShares,
  storageKeys.diaryDrafts, storageKeys.diaryTranslations, storageKeys.diaryGenerationTasks,
  storageKeys.groupMemorySync,
  storageKeys.offlineStories,
]);
export function isMemoryContentKey(key: string): boolean {
  return key !== LEGACY_MEMORY_TRANSACTION_KEY && (keys.has(key)
    || key.startsWith("phone_memory_") || key.startsWith("phone_character_memory_")
    || key === "phone_diary_memory_attempts_v1");
}
