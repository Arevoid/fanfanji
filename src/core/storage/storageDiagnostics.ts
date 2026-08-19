import { readString, remove } from "./storageAdapter";
import { loadStorageMigrationState, type StorageMigrationState } from "./storageMigrationState";
import { loadStorageMigrationLock, type StorageMigrationLock } from "./storageMigrationLock";
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
  migrationLock?: StorageMigrationLock | null;
  pressure: "normal" | "warning" | "critical" | "unknown";
  health: StorageHealthReport;
}

export interface IndexedDbHealthEntry {
  name: string;
  version: number;
  stores: number;
  records: number;
}

export interface IndexedDbResourceHealthEntry {
  database: string;
  store: string;
  stored: number;
  referenced: number;
  orphaned: number;
  missing: number;
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
  resources: IndexedDbResourceHealthEntry[];
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
  storageKeys.forumProfiles,
  storageKeys.imageGenerationRecords,
] as const;

function inspectStorageHealth(storage: Storage): StorageHealthReport {
  const findings: StorageHealthFinding[] = [];
  let checkedCollections = 0;
  const collections = new Map<string, Record<string, unknown>[]>();
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
    const records = parsed.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)));
    collections.set(key, records);
    const ids = records
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const duplicateCount = ids.length - new Set(ids).size;
    if (duplicateCount > 0) {
      findings.push({ key, kind: "duplicate-id", count: duplicateCount, detail: "发现重复 ID，仅提供检查结果，不自动合并。" });
    }
  }

  const reportMissingReferences = (sourceKey: string, referenceField: string, targetKey: string, label: string) => {
    const source = collections.get(sourceKey);
    const target = collections.get(targetKey);
    if (!source || !target) return;
    const targetIds = new Set(target.map((entry) => entry.id).filter((id): id is string => typeof id === "string" && id.length > 0));
    const missingCount = source.filter((entry) => {
      const reference = entry[referenceField];
      return typeof reference === "string" && reference.length > 0 && !targetIds.has(reference);
    }).length;
    if (missingCount > 0) {
      findings.push({
        key: sourceKey,
        kind: "orphan-reference",
        count: missingCount,
        detail: `${label}存在 ${missingCount} 条引用无法对应，仅提供检查结果，不自动删除。`,
      });
    }
  };

  reportMissingReferences(storageKeys.messages, "relationId", storageKeys.characterRelationships, "关系");
  reportMissingReferences(storageKeys.offlineStories, "relationId", storageKeys.characterRelationships, "线下关系");
  reportMissingReferences(storageKeys.forumReplies, "threadId", storageKeys.forumThreads, "论坛主题");
  reportMissingReferences(storageKeys.moments, "characterId", storageKeys.characters, "角色");
  return { checkedCollections, findings, indexedDb: [], resources: [] };
}

function collectReferencedAssetIds(storage: Storage): Set<string> {
  const referenced = new Set<string>();
  const fieldsByKey: Array<[string, string]> = [
    [storageKeys.characters, "imageReferenceAssetId"],
    [storageKeys.messages, "imageAssetId"],
    [storageKeys.imageGenerationRecords, "imageAssetId"],
    [storageKeys.forumProfiles, "avatarAssetId"],
  ];
  for (const [key, field] of fieldsByKey) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      parsed.forEach((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
        const value = (entry as Record<string, unknown>)[field];
        if (typeof value === "string" && value.length > 0) referenced.add(value);
      });
    } catch {
      // The collection-level scan reports invalid JSON separately.
    }
  }
  return referenced;
}

function getExistingDatabaseNames(): Promise<Set<string>> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return Promise.resolve(new Set());
  return indexedDB.databases()
    .then((databases) => new Set(databases
      .map((database) => database.name)
      .filter((name): name is string => typeof name === "string")))
    .catch(() => new Set());
}

function readStoreKeys(databaseName: string, storeName: string): Promise<string[]> {
  return new Promise((resolve) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.close();
        resolve([]);
        return;
      }
      const transaction = database.transaction(storeName, "readonly");
      const keysRequest = transaction.objectStore(storeName).getAllKeys();
      keysRequest.onsuccess = () => {
        database.close();
        resolve(keysRequest.result
          .filter((key): key is string => typeof key === "string" && key.length > 0));
      };
      keysRequest.onerror = () => {
        database.close();
        resolve([]);
      };
    };
    request.onerror = () => resolve([]);
    request.onblocked = () => resolve([]);
  });
}

function readStickerGroupReferences(databaseName: string): Promise<Set<string>> {
  return new Promise((resolve) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("stickerGroups")) {
        database.close();
        resolve(new Set());
        return;
      }
      const transaction = database.transaction("stickerGroups", "readonly");
      const groupsRequest = transaction.objectStore("stickerGroups").getAll();
      groupsRequest.onsuccess = () => {
        const ids = new Set<string>();
        for (const group of groupsRequest.result || []) {
          if (!group || typeof group !== "object" || !Array.isArray((group as { stickers?: unknown }).stickers)) continue;
          for (const sticker of (group as { stickers: unknown[] }).stickers) {
            if (!sticker || typeof sticker !== "object") continue;
            const id = (sticker as { id?: unknown }).id;
            if (typeof id === "string" && id.length > 0) ids.add(id);
          }
        }
        database.close();
        resolve(ids);
      };
      groupsRequest.onerror = () => {
        database.close();
        resolve(new Set());
      };
    };
    request.onerror = () => resolve(new Set());
    request.onblocked = () => resolve(new Set());
  });
}

async function inspectIndexedDbResources(storage: Storage, existingNames: Set<string>): Promise<IndexedDbResourceHealthEntry[]> {
  const resources: IndexedDbResourceHealthEntry[] = [];
  if (existingNames.has("FanfanImageAssets")) {
    const storedIds = new Set(await readStoreKeys("FanfanImageAssets", "images"));
    const referencedIds = collectReferencedAssetIds(storage);
    resources.push({
      database: "FanfanImageAssets",
      store: "images",
      stored: storedIds.size,
      referenced: referencedIds.size,
      orphaned: [...storedIds].filter((id) => !referencedIds.has(id)).length,
      missing: [...referencedIds].filter((id) => !storedIds.has(id)).length,
    });
  }
  if (existingNames.has("StickerAppDB")) {
    const storedIds = new Set(await readStoreKeys("StickerAppDB", "stickerImages"));
    const referencedIds = await readStickerGroupReferences("StickerAppDB");
    resources.push({
      database: "StickerAppDB",
      store: "stickerImages",
      stored: storedIds.size,
      referenced: referencedIds.size,
      orphaned: [...storedIds].filter((id) => !referencedIds.has(id)).length,
      missing: [...referencedIds].filter((id) => !storedIds.has(id)).length,
    });
  }
  return resources;
}

async function inspectIndexedDbHealth(existingDatabaseNames?: Set<string>): Promise<IndexedDbHealthEntry[]> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return [];
  const knownNames = new Set([
    "FanfanImageAssets",
    "StickerAppDB",
    "FanfanjiMessageEntryDB",
    "FanfanjiOfflineStoryEntryDB",
    "FanfanjiOfflineStoryDB",
    "FanfanjiReadingDB",
    "FanfanjiReadingCoverDB",
    "FanfanjiReadingMetadataDB",
  ]);
  const existingNames = existingDatabaseNames
    ? [...existingDatabaseNames].filter((name) => knownNames.has(name))
    : (await indexedDB.databases().catch(() => []))
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
    : { checkedCollections: 0, findings: [], indexedDb: [], resources: [] };
  const existingDatabaseNames = await getExistingDatabaseNames();
  health.indexedDb = await inspectIndexedDbHealth(existingDatabaseNames);
  health.resources = typeof window !== "undefined"
    ? await inspectIndexedDbResources(window.localStorage, existingDatabaseNames)
    : [];
  return {
    localStorageBytes,
    localStorageEntries: entries,
    usage,
    quota,
    persisted,
    dataSchemaVersion: dataSchemaVersion.valid ? dataSchemaVersion.value : null,
    migrationState: loadStorageMigrationState(),
    migrationLock: loadStorageMigrationLock(),
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
