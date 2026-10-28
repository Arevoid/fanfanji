import { storageKeys } from "./storageKeys";
import { createId } from "../id/createId";
import { MEMORY_WRITER_LEASE_MS, openMemoryWriterLease, updateMemoryWriterLease } from "./memoryWriterLease";
type WriterState = "uninitialized" | "pending" | "writer" | "readonly" | "unsupported" | "expired";
// Eager App imports must not write before main acquires the origin-wide lock.
let state: WriterState = typeof window !== "undefined" && typeof document !== "undefined" ? "pending" : "uninitialized";
let release: (() => void) | undefined;
let started: Promise<WriterState> | undefined;
let releasing: Promise<void> = Promise.resolve();
let deadline = 0;
let monotonicDeadline = 0;
let heartbeat: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const setState = (next: WriterState) => { state = next; listeners.forEach(listener => listener()); };
export const subscribeMemoryWriterState = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const leaseIsLive = () => Date.now() < deadline && performance.now() < monotonicDeadline;
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
export async function releaseMemoryWriterForReload(): Promise<void> { release?.(); await releasing; }
export function invalidateMemoryWriter(): void { if (state === "writer") { setState("expired"); release?.(); } }
export function canWriteMemoryStorage(key: string): boolean {
  if (state === "writer" && !leaseIsLive()) {
    setState("expired");
    release?.();
  }
  return !protectedKeys.has(key) && !key.startsWith("phone_memory_") && !key.startsWith("phone_character_memory_")
    || state === "writer" || state === "uninitialized";
}
/** One writer per origin for synchronous legacy repositories. Other windows are
 * explicitly read-only; a per-request lock cannot protect synchronous UI edits. */
export function initializeMemoryWriterCoordination(): Promise<WriterState> {
  if (started) return started;
  state = "pending";
  started = new Promise(resolve => {
    const acquireLease = async () => {
      let db: IDBDatabase;
      try { db = await openMemoryWriterLease(indexedDB); }
      catch { setState("unsupported"); resolve(state); return; }
      const owner = createId("memory-writer");
      try {
        // Both native-lock and fallback clients use this lease, so they cannot
        // independently become writers in a mixed-capability browser context.
        const expiresAt = await updateMemoryWriterLease(db, owner, "acquire");
        if (!expiresAt) { db.close(); setState("readonly"); resolve(state); return; }
        const renewDeadline = (expires: number) => {
          deadline = expires;
          monotonicDeadline = performance.now() + Math.max(0, Math.min(MEMORY_WRITER_LEASE_MS, expires - Date.now()));
        };
        renewDeadline(expiresAt);
        let done!: () => void;
        const held = new Promise<void>(finish => { done = finish; });
        release = () => {
          clearInterval(heartbeat); deadline = 0; monotonicDeadline = 0;
          if (state === "writer") setState("expired");
          release = undefined;
          releasing = updateMemoryWriterLease(db, owner, "release").then(() => {}).catch(() => {}).finally(() => { db.close(); done(); });
        };
        let renewing = false;
        heartbeat = setInterval(async () => {
          if (state !== "writer" || !leaseIsLive()) { setState("expired"); release?.(); return; }
          if (renewing) return;
          renewing = true;
          try {
            const expires = await updateMemoryWriterLease(db, owner, "renew");
            if (state !== "writer") return;
            if (!expires || !leaseIsLive()) { setState("expired"); release?.(); }
            else renewDeadline(expires);
          } catch { setState("expired"); release?.(); }
          finally { renewing = false; }
        }, 5_000);
        setState("writer"); resolve(state);
        await held;
      } catch { db.close(); setState("unsupported"); resolve(state); }
    };
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      let entered = false;
      void Promise.resolve().then(() => navigator.locks.request("fanfanji:memory-storage-writer:v1", { ifAvailable: true }, async lock => {
        entered = true;
        if (!lock) { setState("readonly"); resolve(state); return; }
        await acquireLease();
      })).catch(() => {
        if (!entered) void acquireLease();
        else { setState("unsupported"); resolve(state); }
      });
    } else void acquireLease();
  });
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => release?.(), { once: true });
    window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });
  }
  return started;
}
