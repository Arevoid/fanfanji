import { readingAssetDb } from "../../core/storage/readingAssetDb";
import { flushCharacters } from "../../core/storage/repositories/characterRepository";
import { flushMoments } from "../../core/storage/repositories/momentRepository";
import { flushReadingStore } from "../../core/storage/repositories/readingRepository";
import { flushCoReadingStore } from "../../core/storage/repositories/readingCoReadingRepository";
import { flushReadingCoStoryStore } from "../../core/storage/repositories/readingCoStoryRepository";

export const SYSTEM_BACKUP_FORMAT = "fanfanji-system-backup" as const;
export const SYSTEM_BACKUP_VERSION = 3 as const;
export const SYSTEM_BACKUP_SUPPORTED_VERSIONS = new Set([2, SYSTEM_BACKUP_VERSION]);

/** IndexedDB metadata used by the chat and social modules. Reading books and
 * binary assets remain in the dedicated Reading archive flow. */
export const SYSTEM_BACKUP_INDEXED_DB_KEYS = [
  "character-archive-v4",
  "moments-v4",
  "reading-store",
  "reading-co-reading-store",
  "reading-co-story-store",
] as const;

export interface IndexedDbRestoreReport {
  restoredKeys: string[];
  skippedKeys: string[];
}

export type SystemBackupLocalStorage = Record<string, string | null>;
export type SystemBackupIndexedDb = Record<string, unknown>;

export interface SystemBackupEnvelope {
  format: typeof SYSTEM_BACKUP_FORMAT;
  version: typeof SYSTEM_BACKUP_VERSION;
  exportedAt: number;
  localStorage: SystemBackupLocalStorage;
  indexedDb: SystemBackupIndexedDb;
  /** Optional integrity marker. Legacy v2/v3 backups without it remain valid. */
  checksum?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function checksumPayload(value: Pick<SystemBackupEnvelope, "format" | "version" | "exportedAt" | "localStorage" | "indexedDb">): string {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function readLocalStorage(storage: Storage, keys: readonly string[]): SystemBackupLocalStorage {
  return Object.fromEntries(keys.map((key) => [key, storage.getItem(key)]));
}

/**
 * Reads all backup channels after pending repository writes have settled.
 * This is intentionally async: localStorage alone is no longer the source of
 * truth for character and Moments data.
 */
export async function buildSystemBackup(
  storage: Storage,
  localStorageKeys: readonly string[],
): Promise<SystemBackupEnvelope> {
  const localStorageBeforeFlush = readLocalStorage(storage, localStorageKeys);
  await Promise.all([
    flushCharacters(),
    flushMoments(),
    flushReadingStore(),
    flushCoReadingStore(),
    flushReadingCoStoryStore(),
  ]);
  const indexedDbEntries = await Promise.all(SYSTEM_BACKUP_INDEXED_DB_KEYS.map(async (key) => [
    key,
    await readingAssetDb.loadMetadataValue<unknown>(key),
  ] as const));

  const localStorageAfterFlush = readLocalStorage(storage, localStorageKeys);
  const localStorage = Object.fromEntries(localStorageKeys.map((key) => [
    key,
    localStorageAfterFlush[key] ?? localStorageBeforeFlush[key] ?? null,
  ])) as SystemBackupLocalStorage;

  const envelope = {
    format: SYSTEM_BACKUP_FORMAT,
    version: SYSTEM_BACKUP_VERSION,
    exportedAt: Date.now(),
    localStorage,
    indexedDb: Object.fromEntries(
      indexedDbEntries.filter(([, value]) => value !== null && value !== undefined).map(([key, value]) => [key, cloneJson(value)]),
    ),
  };
  return { ...envelope, checksum: checksumPayload(envelope) };
}

/**
 * Accepts the v2 envelope and the legacy flat object format. The caller still
 * validates localStorage keys because it owns the product-specific allowlist.
 */
export function parseSystemBackup(value: unknown): {
  localStorage: SystemBackupLocalStorage;
  indexedDb: SystemBackupIndexedDb;
  legacy: boolean;
} {
  if (!isRecord(value)) throw new Error("无效的备份文件格式！");

  if (value.format === SYSTEM_BACKUP_FORMAT) {
    if (typeof value.version !== "number" || !SYSTEM_BACKUP_SUPPORTED_VERSIONS.has(value.version) || !isRecord(value.localStorage) || !isRecord(value.indexedDb)) {
      throw new Error("不支持的系统备份版本或格式！");
    }
    const localStorage: SystemBackupLocalStorage = Object.fromEntries(Object.entries(value.localStorage).map(([key, entry]) => {
      if (entry !== null && typeof entry !== "string") throw new Error("系统备份中的本地数据格式无效！");
      return [key, entry];
    })) as SystemBackupLocalStorage;
    if (value.checksum !== undefined) {
      if (typeof value.checksum !== "string" || value.checksum !== checksumPayload({
        format: SYSTEM_BACKUP_FORMAT,
        version: value.version as typeof SYSTEM_BACKUP_VERSION,
        exportedAt: value.exportedAt as number,
        localStorage,
        indexedDb: value.indexedDb,
      })) {
        throw new Error("备份校验失败，文件可能已损坏或被修改！");
      }
    }
    return {
      localStorage,
      indexedDb: cloneJson(value.indexedDb),
      legacy: false,
    };
  }

  if (Object.keys(value).some((key) => key.startsWith("indexedDb") || key === "format" || key === "version")) {
    throw new Error("不支持的系统备份版本或格式！");
  }
  const localStorage: SystemBackupLocalStorage = Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (entry !== null && typeof entry !== "string") throw new Error("备份中的本地数据格式无效！");
    return [key, entry];
  })) as SystemBackupLocalStorage;
  const indexedDb: SystemBackupIndexedDb = {};
  const legacyMappings: Array<[string, string, string]> = [
    ["phone_characters_v3", "phone_characters", "character-archive-v4"],
    ["phone_moments_v3", "phone_moments_v3", "moments-v4"],
  ];
  for (const [preferredKey, fallbackKey, metadataKey] of legacyMappings) {
    const raw = localStorage[preferredKey] ?? localStorage[fallbackKey];
    if (typeof raw !== "string") continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) indexedDb[metadataKey] = parsed;
    } catch {
      // Keep the legacy payload available for the normal localStorage path.
    }
  }
  return { localStorage, indexedDb, legacy: true };
}

export async function restoreSystemBackupIndexedDb(indexedDb: SystemBackupIndexedDb): Promise<IndexedDbRestoreReport> {
  const previousValues = new Map<string, unknown | null>();
  const keysToRestore = SYSTEM_BACKUP_INDEXED_DB_KEYS.filter((key) => Object.hasOwn(indexedDb, key));
  const skippedKeys = Object.keys(indexedDb).filter((key) => !SYSTEM_BACKUP_INDEXED_DB_KEYS.includes(key as typeof SYSTEM_BACKUP_INDEXED_DB_KEYS[number]));
  for (const key of keysToRestore) {
    previousValues.set(key, await readingAssetDb.loadMetadataValue<unknown>(key));
  }

  try {
    for (const key of keysToRestore) {
      const value = indexedDb[key];
      if (value === null || value === undefined) {
        await readingAssetDb.deleteMetadataValue(key);
      } else {
        await readingAssetDb.saveMetadataValue(key, cloneJson(value));
      }
    }
    return { restoredKeys: [...keysToRestore], skippedKeys };
  } catch (error) {
    // Restore the exact pre-import values. This is a compensating transaction:
    // it never deletes a key unless that key was absent before the import.
    for (const [key, previousValue] of previousValues) {
      try {
        if (previousValue === null || previousValue === undefined) {
          await readingAssetDb.deleteMetadataValue(key);
        } else {
          await readingAssetDb.saveMetadataValue(key, previousValue);
        }
      } catch (rollbackError) {
        console.error("IndexedDB backup restore rollback failed:", rollbackError);
      }
    }
    throw error;
  }
}
