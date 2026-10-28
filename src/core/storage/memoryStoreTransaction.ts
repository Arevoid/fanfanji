import { readJson, readString, writeJson, writeString, remove, STORAGE_WRITE_FAILURE_EVENT } from "./storageAdapter";
import type { StorageWriteResult } from "./storageTypes";
import { storageKeys } from "./storageKeys";
import { memoryContentStore } from "./memoryContentStore";
import { canWriteMemoryStorage, invalidateMemoryWriter } from "./memoryWriterCoordination";

export async function initializeMemoryContentStorage(writable: boolean): Promise<StorageWriteResult> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return { success: false, error: "unavailable" };
  return memoryContentStore.initialize({ factory: indexedDB, legacy: window.localStorage, writable,
    canWrite: () => writable && canWriteMemoryStorage(storageKeys.characterKnowledgeClaims),
    onStatus: status => { if (status.phase === "failed" && status.failure) {
      invalidateMemoryWriter();
      window.dispatchEvent(new CustomEvent(STORAGE_WRITE_FAILURE_EVENT, { detail: { key: status.failure.key, error: status.failure.error, source: "memory-indexeddb" } }));
    } },
  });
}
export async function confirmMemoryPersistence<T extends StorageWriteResult>(result: T): Promise<T> {
  if (!result.success || !memoryContentStore.active) return result;
  const committed = result.durable ? await result.durable : await memoryContentStore.flush();
  return { ...result, ...committed, pending: false, durable: undefined };
}
export const flushMemoryContentStorage = () => memoryContentStore.active ? memoryContentStore.flush() : Promise.resolve({ success: true });
export const getMemoryContentStorageStatus = () => memoryContentStore.status;

const JOURNAL_KEY = "phone_memory_restore_transaction_v1";
const ALLOWED_KEYS = new Set<string>([
  storageKeys.characterKnowledgeClaims, storageKeys.conversationSummaries,
  storageKeys.offlineStories,
  storageKeys.behaviorCorrections, storageKeys.memoryVaultItems, storageKeys.memoryVaultSettings,
  "phone_character_memory_continuity_v1",
  "phone_memory_continuity_migration_v1", "phone_memory_continuity_legacy_snapshot_v1",
  "phone_memory_organization_v1",
  "phone_memory_index_cleanup_v1",
  "phone_memory_mentions_v1",
  "phone_memory_review_actions_v1",
  "phone_memory_source_mutation_v1",
  "phone_memory_system_v1",
]);
interface Journal { version: 1; status: "pending" | "committed"; before: Record<string, string | null> }

/** Recover before opening a second transaction. The snapshot is user data, not telemetry. */
export function recoverMemoryStoreTransaction(): StorageWriteResult {
  if (memoryContentStore.active) return memoryContentStore.status.phase === "ready" ? { success: true } : { success: false, error: "unavailable" };
  const result = readJson<Journal | undefined>(JOURNAL_KEY, undefined);
  if (!result.valid) return { success: false, error: result.error };
  if (!result.found) return { success: true };
  const journal = result.value;
  if (!journal || journal.version !== 1 || !["pending", "committed"].includes(journal.status)
    || !journal.before || Object.entries(journal.before).some(([key, value]) =>
      !ALLOWED_KEYS.has(key) || (value !== null && typeof value !== "string"))) {
    return { success: false, error: "validation" };
  }
  if (journal.status === "pending") {
    for (const [key, value] of Object.entries(journal.before)) {
      const write = value === null ? remove(key) : writeString(key, value);
      if (!write.success) return { success: false, error: "rollback" };
    }
  }
  return remove(JOURNAL_KEY);
}

/** Synchronous write-ahead recovery: no partially restored snapshot is reported successful. */
export function replaceMemoryStores(values: Readonly<Record<string, unknown>>): StorageWriteResult {
  if (Object.keys(values).some((key) => !ALLOWED_KEYS.has(key))) return { success: false, error: "validation" };
  if (memoryContentStore.active) {
    try { return memoryContentStore.stage(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]))); }
    catch { return { success: false, error: "serialize" }; }
  }
  const recovery = recoverMemoryStoreTransaction();
  if (!recovery.success) return recovery;
  const before: Record<string, string | null> = {};
  for (const key of Object.keys(values)) {
    const read = readString(key);
    if (!read.valid) return { success: false, error: read.error };
    before[key] = read.value;
  }
  const journal: Journal = { version: 1, status: "pending", before };
  const checkpoint = writeJson(JOURNAL_KEY, journal);
  if (!checkpoint.success) return checkpoint;
  for (const [key, value] of Object.entries(values)) {
    const write = writeJson(key, value);
    if (!write.success) {
      const restored = recoverMemoryStoreTransaction();
      return restored.success ? write : { success: false, error: "rollback" };
    }
  }
  const committed = writeJson(JOURNAL_KEY, { ...journal, status: "committed" });
  if (!committed.success) {
    const restored = recoverMemoryStoreTransaction();
    return restored.success ? committed : { success: false, error: "rollback" };
  }
  remove(JOURNAL_KEY); // A remaining committed journal never undoes successful writes.
  return { success: true };
}
