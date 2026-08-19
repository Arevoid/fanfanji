import { remove } from "./storageAdapter";

export interface LocalStorageUsageEntry {
  key: string;
  bytes: number;
}

export interface StorageDiagnostics {
  localStorageBytes: number;
  localStorageEntries: LocalStorageUsageEntry[];
  usage?: number;
  quota?: number;
  pressure: "normal" | "warning" | "critical" | "unknown";
}

export async function inspectStorage(): Promise<StorageDiagnostics> {
  const entries: LocalStorageUsageEntry[] = [];
  if (typeof window !== "undefined") {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      const value = localStorage.getItem(key) || "";
      entries.push({ key, bytes: (key.length + value.length) * 2 });
    }
  }
  entries.sort((left, right) => right.bytes - left.bytes);
  const localStorageBytes = entries.reduce((total, entry) => total + entry.bytes, 0);
  const estimate = typeof navigator !== "undefined" && navigator.storage?.estimate
    ? await navigator.storage.estimate()
    : {};
  const usage = estimate.usage;
  const quota = estimate.quota;
  const ratio = usage !== undefined && quota ? usage / quota : undefined;
  return {
    localStorageBytes,
    localStorageEntries: entries,
    usage,
    quota,
    pressure: ratio === undefined ? "unknown" : ratio >= 0.95 ? "critical" : ratio >= 0.8 ? "warning" : "normal",
  };
}

/** Removes only the explicitly migrated offline-story copy. */
export function removeMigratedStorageCopies(): string[] {
  // Characters, moments, and messages are cleaned by their own migration
  // paths after a successful IndexedDB write. Keep this manual action narrow
  // so the diagnostics page cannot remove an unverified fallback copy.
  const keys = ["phone_offline_stories"];
  const removed: string[] = [];
  keys.forEach((key) => {
    if (localStorage.getItem(key) !== null && remove(key).success) removed.push(key);
  });
  return removed;
}

export function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
