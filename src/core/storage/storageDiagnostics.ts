import { readString, remove } from "./storageAdapter";
import { loadStorageMigrationState, type StorageMigrationState } from "./storageMigrationState";
import { loadStorageMigrationLock, type StorageMigrationLock } from "./storageMigrationLock";
import { storageKeys } from "./storageKeys";
import { isMessageEntryStoreEnabled, isOfflineStoryEntryStoreEnabled } from "./contentStorageFlags";
import { messageEntryDb } from "./messageEntryDb";
import { offlineStoryDb } from "./offlineStoryDb";
import { readingAssetDb } from "./readingAssetDb";
import { imageAssetDb } from "../../utils/imageAssetDb";
import { stickerDb } from "../../utils/stickerDb";
import { CURRENT_STORAGE_SCHEMA_VERSION, STORAGE_MIGRATION_SCRIPT_VERSION } from "./storageVersion";

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
  currentSchemaVersion: number;
  migrationScriptVersion: string;
  migrationState?: StorageMigrationState | null;
  migrationLock?: StorageMigrationLock | null;
  pressure: "normal" | "warning" | "critical" | "unknown";
  health: StorageHealthReport;
  identitySummary?: IdentityDiagnosticSummary;
}

export interface IdentityDiagnosticSummary {
  identityCount: number;
  activeIdentityIdPresent: boolean;
  identities: Array<{
    idFingerprint: string;
    nameLength: number;
    nameFingerprint: string;
    avatarFingerprint: string;
    relationshipCount: number;
    relationshipCharacterFingerprints: string[];
  }>;
}

export interface StorageDiagnosticReport {
  format: "fanfanji-storage-diagnostic";
  version: 1;
  capturedAt: number;
  appVersion: string;
  backupVersion: number;
  diagnostics: StorageDiagnostics;
}

export interface OrphanedResourceCleanupEntry {
  database: string;
  store: string;
  removed: number;
  failed: number;
}

interface ReferencedAssetScan {
  ids: Set<string>;
  complete: boolean;
}

/**
 * Creates a portable diagnostic report. It intentionally contains only
 * metadata, sizes, statuses and finding summaries; it never includes storage
 * values, message bodies, API keys or backup payloads.
 */
export function buildStorageDiagnosticReport(
  diagnostics: StorageDiagnostics,
  appVersion: string,
  backupVersion: number,
  capturedAt = Date.now(),
): StorageDiagnosticReport {
  return {
    format: "fanfanji-storage-diagnostic",
    version: 1,
    capturedAt,
    appVersion,
    backupVersion,
    diagnostics: {
      ...diagnostics,
      localStorageEntries: diagnostics.localStorageEntries.map(({ key, bytes }) => ({ key, bytes })),
      health: {
        ...diagnostics.health,
        findings: diagnostics.health.findings.map(({ key, kind, count, detail }) => ({ key, kind, count, detail })),
      },
    },
  };
}

/**
 * Removes only resources that the current metadata scan proves are orphaned.
 * This function is never called automatically; the settings UI requires an
 * explicit user confirmation before invoking it.
 */
export async function cleanupOrphanedStorageResources(): Promise<OrphanedResourceCleanupEntry[]> {
  if (typeof window === "undefined") return [];
  const storage = window.localStorage;
  const existingNames = await getExistingDatabaseNames();
  const result: OrphanedResourceCleanupEntry[] = [];
  if (existingNames.has("FanfanImageAssets")) {
    const storedIds = new Set(await readStoreKeys("FanfanImageAssets", "images"));
    const referencedScan = await collectReferencedAssetIds(storage);
    if (!referencedScan.complete) {
      throw new Error("无法完整读取图片引用，已停止清理以保护现有资源。");
    }
    const referencedIds = referencedScan.ids;
    let removed = 0;
    let failed = 0;
    for (const id of storedIds) {
      if (referencedIds.has(id)) continue;
      try {
        await imageAssetDb.deleteImage(id);
        removed += 1;
      } catch {
        failed += 1;
      }
    }
    result.push({ database: "FanfanImageAssets", store: "images", removed, failed });
  }
  if (existingNames.has("StickerAppDB")) {
    const storedIds = new Set(await readStoreKeys("StickerAppDB", "stickerImages"));
    const referencedIds = await readStickerGroupReferences("StickerAppDB");
    let removed = 0;
    let failed = 0;
    for (const id of storedIds) {
      if (referencedIds.has(id)) continue;
      try {
        await stickerDb.deleteStickerImage(id);
        removed += 1;
      } catch {
        failed += 1;
      }
    }
    result.push({ database: "StickerAppDB", store: "stickerImages", removed, failed });
  }
  return result;
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
  kind: "invalid-json" | "duplicate-id" | "orphan-reference" | "identity-integrity";
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

  // Identity switching bugs are usually caused by legacy records whose owner
  // fields no longer agree. Keep this scan read-only: ownership cannot be
  // guessed safely when two identities have similar names or avatars.
  const settingsRaw = storage.getItem(storageKeys.settings);
  const relationshipRecords = collections.get(storageKeys.characterRelationships) || [];
  if (settingsRaw) {
    try {
      const settings = JSON.parse(settingsRaw) as Record<string, unknown>;
      const identities = Array.isArray(settings.identities)
        ? settings.identities.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
        : [];
      const identityIds = identities.map((identity) => identity.id).filter((id): id is string => typeof id === "string" && id.length > 0);
      const identityIdSet = new Set(identityIds);
      const duplicateIdentityIds = identityIds.length - identityIdSet.size;
      if (duplicateIdentityIds > 0) {
        findings.push({ key: storageKeys.settings, kind: "identity-integrity", count: duplicateIdentityIds, detail: "用户身份存在重复 ID，切换结果可能无法稳定对应。" });
      }
      const activeIdentityId = typeof settings.activeIdentityId === "string" ? settings.activeIdentityId : "";
      if (activeIdentityId && !identityIdSet.has(activeIdentityId)) {
        findings.push({ key: storageKeys.settings, kind: "identity-integrity", count: 1, detail: "当前激活身份 ID 不存在于身份列表。" });
      }
      const invalidRelationshipOwners = relationshipRecords.filter((relation) => {
        const owner = relation.userIdentityId;
        return typeof owner !== "string" || owner.length === 0 || (identityIdSet.size > 0 && !identityIdSet.has(owner));
      }).length;
      if (invalidRelationshipOwners > 0) {
        findings.push({ key: storageKeys.characterRelationships, kind: "identity-integrity", count: invalidRelationshipOwners, detail: "好友关系引用了缺失或未知的用户身份。" });
      }
      const scopedRelationKeys = relationshipRecords
        .map((relation) => `${String(relation.userIdentityId || "")}\u0000${String(relation.characterId || "")}`)
        .filter((key) => !key.startsWith("\u0000"));
      const duplicateScopedRelations = scopedRelationKeys.length - new Set(scopedRelationKeys).size;
      if (duplicateScopedRelations > 0) {
        findings.push({ key: storageKeys.characterRelationships, kind: "identity-integrity", count: duplicateScopedRelations, detail: "同一身份下存在重复角色好友关系。" });
      }
    } catch {
      // The generic invalid-json finding above is intentionally kept as the
      // source of truth for malformed settings.
    }
  }
  return { checkedCollections, findings, indexedDb: [], resources: [] };
}

async function collectReferencedAssetIds(storage: Storage): Promise<ReferencedAssetScan> {
  const referenced = new Set<string>();
  let complete = true;
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
      // An incomplete reference scan must never authorize destructive cleanup.
      complete = false;
    }
  }
  if (isMessageEntryStoreEnabled() && typeof indexedDB !== "undefined") {
    try {
      const messages = await messageEntryDb.loadAll();
      messages.forEach((message) => {
        if (message.imageAssetId) referenced.add(message.imageAssetId);
      });
    } catch {
      complete = false;
    }
  }
  if (isOfflineStoryEntryStoreEnabled() && typeof indexedDB !== "undefined") {
    try {
      const stories = await offlineStoryDb.loadAll();
      stories.forEach((story) => story.messages.forEach((message) => {
        if (message.imageAssetId) referenced.add(message.imageAssetId);
      }));
    } catch {
      complete = false;
    }
  }
  return { ids: referenced, complete };
}

function fingerprint(value: unknown): string {
  const input = typeof value === "string" ? value : String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildIdentityDiagnosticSummary(storage: Storage): IdentityDiagnosticSummary | undefined {
  const settingsRaw = storage.getItem(storageKeys.settings);
  if (!settingsRaw) return undefined;
  try {
    const settings = JSON.parse(settingsRaw) as Record<string, unknown>;
    const identities = Array.isArray(settings.identities)
      ? settings.identities.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
      : [];
    const relationshipsRaw = storage.getItem(storageKeys.characterRelationships);
    const relationships = relationshipsRaw ? JSON.parse(relationshipsRaw) : [];
    const relationRecords = Array.isArray(relationships)
      ? relationships.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
      : [];
    const activeIdentityId = typeof settings.activeIdentityId === "string" ? settings.activeIdentityId : "";
    return {
      identityCount: identities.length,
      activeIdentityIdPresent: identities.some((identity) => identity.id === activeIdentityId),
      identities: identities.map((identity) => {
        const id = typeof identity.id === "string" ? identity.id : "";
        const ownedRelationships = relationRecords.filter((relation) => relation.userIdentityId === id);
        return {
          idFingerprint: fingerprint(id),
          nameLength: typeof identity.name === "string" ? identity.name.length : 0,
          nameFingerprint: fingerprint(identity.name),
          avatarFingerprint: fingerprint(identity.avatar),
          relationshipCount: ownedRelationships.length,
          relationshipCharacterFingerprints: ownedRelationships.map((relation) => fingerprint(relation.characterId)).sort(),
        };
      }),
    };
  } catch {
    return undefined;
  }
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
    const referencedScan = await collectReferencedAssetIds(storage);
    const referencedIds = referencedScan.ids;
    resources.push({
      database: "FanfanImageAssets",
      store: "images",
      stored: storedIds.size,
      referenced: referencedScan.complete ? referencedIds.size : 0,
      // If any source could not be read, report an indeterminate result as
      // zero actionable findings. The cleanup action separately refuses to
      // run until the scan is complete.
      orphaned: referencedScan.complete ? [...storedIds].filter((id) => !referencedIds.has(id)).length : 0,
      missing: referencedScan.complete ? [...referencedIds].filter((id) => !storedIds.has(id)).length : 0,
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
  const identitySummary = typeof window !== "undefined"
    ? buildIdentityDiagnosticSummary(window.localStorage)
    : undefined;
  return {
    localStorageBytes,
    localStorageEntries: entries,
    usage,
    quota,
    persisted,
    dataSchemaVersion: dataSchemaVersion.valid ? dataSchemaVersion.value : null,
    migrationState: loadStorageMigrationState(),
    migrationLock: loadStorageMigrationLock(),
    currentSchemaVersion: CURRENT_STORAGE_SCHEMA_VERSION,
    migrationScriptVersion: STORAGE_MIGRATION_SCRIPT_VERSION,
    health,
    identitySummary,
    pressure: ratio === undefined ? "unknown" : ratio >= 0.95 ? "critical" : ratio >= 0.8 ? "warning" : "normal",
  };
}

/**
 * Removes retained content copies only after the corresponding entry store
 * can be read. This is intentionally manual; migration itself never calls it.
 */
export async function removeMigratedStorageCopies(): Promise<string[]> {
  const removed: string[] = [];
  if (isMessageEntryStoreEnabled()) {
    await messageEntryDb.loadAll();
    const legacyMetadata = await readingAssetDb.loadMetadataValue("messages-v4");
    await readingAssetDb.deleteMetadataValue("messages-v4");
    [storageKeys.messages, storageKeys.legacyMessages].forEach((key) => {
      if (localStorage.getItem(key) !== null && remove(key).success) removed.push(key);
    });
    if (legacyMetadata !== null) removed.push("FanfanjiReadingMetadataDB/messages-v4");
  }
  if (isOfflineStoryEntryStoreEnabled()) {
    await offlineStoryDb.loadAll();
    await offlineStoryDb.clearLegacyCopy();
    if (localStorage.getItem(storageKeys.offlineStories) !== null && remove(storageKeys.offlineStories).success) removed.push(storageKeys.offlineStories);
    removed.push("FanfanjiOfflineStoryDB/stories");
  }
  return removed;
}

export function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
