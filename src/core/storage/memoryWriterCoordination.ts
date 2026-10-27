import { storageKeys } from "./storageKeys";
type WriterState = "uninitialized" | "pending" | "writer" | "readonly" | "unsupported";
// Eager App imports must not write before main acquires the origin-wide lock.
let state: WriterState = typeof window !== "undefined" && typeof document !== "undefined" ? "pending" : "uninitialized";
let release: (() => void) | undefined;
let started: Promise<WriterState> | undefined;
const protectedKeys = new Set<string>([
  storageKeys.messages, storageKeys.legacyMessages, storageKeys.characters, storageKeys.legacyCharacters,
  storageKeys.characterRelationships, storageKeys.characterKnowledgeClaims, storageKeys.conversationSummaries,
  storageKeys.behaviorCorrections, storageKeys.memoryVaultItems, storageKeys.memoryVaultSettings,
  storageKeys.offlineStories, storageKeys.diaryEntries, storageKeys.diaryShares,
  storageKeys.moments, storageKeys.forumShares, storageKeys.readingCoReadingStore,
  storageKeys.relationshipNetworkNpcs, storageKeys.relationshipNetworkSocialLinks,
  storageKeys.smsStore,
]);
export const getMemoryWriterState = () => state;
export function canWriteMemoryStorage(key: string): boolean {
  return !protectedKeys.has(key) && !key.startsWith("phone_memory_") && !key.startsWith("phone_character_memory_")
    || state === "writer" || state === "uninitialized";
}
/** One writer per origin for synchronous legacy repositories. Other windows are
 * explicitly read-only; a per-request lock cannot protect synchronous UI edits. */
export function initializeMemoryWriterCoordination(): Promise<WriterState> {
  if (started) return started;
  state = "pending";
  started = new Promise(resolve => {
    if (typeof navigator === "undefined" || !navigator.locks?.request) { state = "unsupported"; resolve(state); return; }
    void navigator.locks.request("fanfanji:memory-storage-writer:v1", { ifAvailable: true }, async lock => {
      if (!lock) { state = "readonly"; resolve(state); return; }
      state = "writer"; resolve(state);
      await new Promise<void>(done => { release = done; });
      state = "readonly";
    }).catch(() => { state = "readonly"; resolve(state); });
  });
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => release?.(), { once: true });
    window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });
  }
  return started;
}
