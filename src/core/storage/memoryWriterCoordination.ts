import { storageKeys } from "./storageKeys";
import { localSaveGuard } from "./localSaveGuard";
type WriterState = "uninitialized" | "pending" | "writer" | "readonly" | "unsupported" | "expired";
let state: WriterState = typeof window !== "undefined" && typeof document !== "undefined" ? "pending" : "uninitialized";
let started: Promise<WriterState> | undefined;
const listeners = new Set<() => void>();
const setState = (next: WriterState) => { state = next; listeners.forEach(listener => listener()); };
export const subscribeMemoryWriterState = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const protectedKeys = new Set<string>([
  storageKeys.messages, storageKeys.legacyMessages, storageKeys.characters, storageKeys.legacyCharacters,
  storageKeys.characterRelationships, storageKeys.characterKnowledgeClaims, storageKeys.conversationSummaries,
  storageKeys.behaviorCorrections, storageKeys.memoryVaultItems, storageKeys.memoryVaultSettings,
  storageKeys.offlineStories, storageKeys.diaryEntries, storageKeys.diaryShares,
  storageKeys.moments, storageKeys.forumShares, storageKeys.readingCoReadingStore,
  storageKeys.relationshipNetworkNpcs, storageKeys.relationshipNetworkSocialLinks,
  storageKeys.smsStore,
]);
export const isProtectedStorageKey = (key: string) => protectedKeys.has(key) || key.startsWith("phone_memory_") || key.startsWith("phone_character_memory_");
export const getMemoryWriterState = () => state;
export const usesPerSaveProtection = () => state === "writer";
export const flushMemoryWriterSaves = () => localSaveGuard.flush();
export async function releaseMemoryWriterForReload(): Promise<void> { await flushMemoryWriterSaves(); }
// A failed save is local to that operation, never a permanent page-wide lock.
export function invalidateMemoryWriter(): void { /* retained compatibility entry point */ }
export function canWriteMemoryStorage(key: string): boolean {
  return !isProtectedStorageKey(key) || state === "writer" || state === "uninitialized";
}
export function initializeMemoryWriterCoordination(): Promise<WriterState> {
  if (started) return started;
  started = (async () => {
    try { await localSaveGuard.initialize(indexedDB); setState("writer"); }
    catch { setState("unsupported"); }
    return state;
  })();
  return started;
}
