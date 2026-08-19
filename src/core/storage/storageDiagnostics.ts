import { readString, remove } from "./storageAdapter";
import { loadStorageMigrationState, type StorageMigrationState } from "./storageMigrationState";
import { storageKeys } from "./storageKeys";

export interface LocalStorageUsageEntry {
  key: string;
  bytes: number;
}

export interface StorageDiagnostics {
  localStorageBytes: number;
  localStorageEntries: LocalStorageUsageEntry[];
  usage?: number;
  quota?: number;
  persisted?: boolean;
  dataSchemaVersion?: string | null;
  migrationState?: StorageMigrationState | null;
  pressure: "normal" | "warning" | "critical" | "unknown";
  health: StorageHealthReport;
}

export interface IndexedDbHealthEntry {
  name: string;
  version: number;
  stores: number;
  records: number;
}

export interface StorageHealthFinding {
  key: string;
  kind: "invalid-json" | "duplicate-id" | "orphan-reference";
  count: number;
  detail: string;
}

export interface StorageHealthReport {
  checkedCollections: number;
  findings: StorageHealthFinding[];
  indexedDb: IndexedDbHealthEntry[];
}

const HEALTH_COLLECTION_KEYS = [
  storageKeys.characters,
  storageKeys.messages,
  storageKeys.moments,
  storageKeys.characterRelationships,
  storageKeys.offlineStories,
  storageKeys.worldBookEntries,
  storageKeys.diaryEntries,
  storageKeys.forumThreads,
  storageKeys.forumReplies,
] as const;

function inspectStorageHealth(storage: Storage): StorageHealthReport {
  const findings: StorageHealthFinding[] = [];
  let checkedCollections = 0;
  for (const key of HEALTH_COLLECTION_KEYS) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    checkedCollections += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      findings.push({ key, kind: "invalid-json", count: 1, detail: "无法解析 JSON，建议先导出原始备份。" });
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const ids = parsed
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const duplicateCount = ids.length - new Set(ids).size;
    if (duplicateCount > 0) {
      findings.push({ key, kind: "duplicate-id", count: duplicateCount, detail: "发现重复 ID，仅提供检查结果，不自动合并。" });
    }
  }
  return { checkedCollections, findings, indexedDb: [] };
}

async function inspectIndexedDbHealth(): Promise<IndexedDbHealthEntry[]> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return [];
  const knownNames = new Set([
    "FanfanjiOfflineStoryDB",
    "FanfanjiReadingDB",
    "FanfanjiReadingCoverDB",
    "FanfanjiReadingMetadataDB",
  ]);
  const databases = await indexedDB.databases().catch(() => []);
  const existingNames = databases
    .map((database) => database.name)
    .filter((name): name is string => typeof name === "string" && knownNames.has(name));
  const results: IndexedDbHealthEntry[] = [];
  await Promise.all(existingNames.map(async (name) => {
    const entry = await new Promise<IndexedDbHealthEntry | null>((resolve) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => {
        const database = request.result;
        const storeNames = Array.from(database.objectStoreNames);
        if (storeNames.length === 0) {
          database.close();
          resolve({ name, version: database.version, stores: 0, records: 0 });
          return;
        }
        let records = 0;
        let remaining = storeNames.length;
        let failed = false;
        const transaction = database.transaction(storeNames, "readonly");
        storeNames.forEach((storeName) => {
          const countRequest = transaction.objectStore(storeName).count();
          countRequest.onsuccess = () => {
            records += countRequest.result;
            remaining -= 1;
            if (remaining === 0 && !failed) {
              database.close();
              resolve({ name, version: database.version, stores: storeNames.length, records });
            }
          };
          countRequest.onerror = () => {
            failed = true;
            database.close();
            resolve(null);
          };
        });
        transaction.onerror = () => {
          if (!failed) {
            failed = true;
            database.close();
            resolve(null);
          }
        };
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    if (entry) results.push(entry);
  }));
  return results.sort((left, right) => left.name.localeCompare(right.name));
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
  const persisted = typeof navigator !== "undefined" && navigator.storage?.persisted
    ? await navigator.storage.persisted().catch(() => undefined)
    : undefined;
  const dataSchemaVersion = readString("phone_data_schema_version");
  const health = typeof window !== "undefined"
    ? inspectStorageHealth(window.localStorage)
    : { checkedCollections: 0, findings: [], indexedDb: [] };
  health.indexedDb = await inspectIndexedDbHealth();
  return {
    localStorageBytes,
    localStorageEntries: entries,
    usage,
    quota,
    persisted,
    dataSchemaVersion: dataSchemaVersion.valid ? dataSchemaVersion.value : null,
    migrationState: loadStorageMigrationState(),
    health,
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
