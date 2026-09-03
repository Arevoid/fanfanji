import { readJson, remove, writeJson } from "./storageAdapter";
import { storageKeys } from "./storageKeys";
import { createId } from "../id/createId";

export const DEFAULT_STORAGE_MIGRATION_LOCK_TTL_MS = 60_000;

export interface StorageMigrationLock {
  id: string;
  ownerId: string;
  createdAt: number;
  expiresAt: number;
}

export type StorageMigrationLockFailure = "locked" | "expired" | "unavailable" | "write" | "invalid";

export interface StorageMigrationLockResult {
  acquired: boolean;
  lock?: StorageMigrationLock;
  reason?: StorageMigrationLockFailure;
}

const isValidLock = (value: unknown): value is StorageMigrationLock => {
  if (!value || typeof value !== "object") return false;
  const lock = value as Record<string, unknown>;
  return typeof lock.id === "string"
    && lock.id.length > 0
    && typeof lock.ownerId === "string"
    && lock.ownerId.length > 0
    && typeof lock.createdAt === "number"
    && typeof lock.expiresAt === "number"
    && lock.expiresAt > lock.createdAt;
};

export const loadStorageMigrationLock = (): StorageMigrationLock | null => {
  const result = readJson<unknown>(storageKeys.migrationLock, null);
  return result.valid && isValidLock(result.value) ? result.value : null;
};

export const isStorageMigrationLockActive = (lock: StorageMigrationLock, now = Date.now()): boolean => lock.expiresAt > now;

export const createStorageMigrationOwnerId = (): string => createId("page");

function writeLock(lock: StorageMigrationLock): StorageMigrationLockResult {
  const result = writeJson(storageKeys.migrationLock, lock);
  if (!result.success) {
    return { acquired: false, reason: result.error === "unavailable" ? "unavailable" : "write" };
  }
  const confirmed = loadStorageMigrationLock();
  if (!confirmed || confirmed.id !== lock.id || confirmed.ownerId !== lock.ownerId) {
    return { acquired: false, reason: "locked" };
  }
  return { acquired: true, lock: confirmed };
}

function createLock(ownerId: string, now: number, ttlMs: number): StorageMigrationLock {
  return {
    id: createId("migration"),
    ownerId,
    createdAt: now,
    expiresAt: now + Math.max(1_000, Math.floor(ttlMs)),
  };
}

/**
 * Acquires only an empty lock. An expired lock intentionally requires an
 * explicit takeover call so a crashed migration cannot be resumed silently.
 */
export function tryAcquireStorageMigrationLock(
  ownerId = createStorageMigrationOwnerId(),
  now = Date.now(),
  ttlMs = DEFAULT_STORAGE_MIGRATION_LOCK_TTL_MS,
): StorageMigrationLockResult {
  const existing = loadStorageMigrationLock();
  if (existing) {
    if (isStorageMigrationLockActive(existing, now)) return { acquired: false, reason: "locked", lock: existing };
    return { acquired: false, reason: "expired", lock: existing };
  }
  return writeLock(createLock(ownerId, now, ttlMs));
}

/** Takes over only an expired lock; active locks remain owned by their page. */
export function takeOverExpiredStorageMigrationLock(
  ownerId = createStorageMigrationOwnerId(),
  now = Date.now(),
  ttlMs = DEFAULT_STORAGE_MIGRATION_LOCK_TTL_MS,
): StorageMigrationLockResult {
  const existing = loadStorageMigrationLock();
  if (existing && isStorageMigrationLockActive(existing, now)) return { acquired: false, reason: "locked", lock: existing };
  return writeLock(createLock(ownerId, now, ttlMs));
}

export function renewStorageMigrationLock(
  lockId: string,
  ownerId: string,
  now = Date.now(),
  ttlMs = DEFAULT_STORAGE_MIGRATION_LOCK_TTL_MS,
): StorageMigrationLockResult {
  const existing = loadStorageMigrationLock();
  if (!existing || existing.id !== lockId || existing.ownerId !== ownerId) return { acquired: false, reason: "locked", lock: existing || undefined };
  if (!isStorageMigrationLockActive(existing, now)) return { acquired: false, reason: "expired", lock: existing };
  return writeLock({ ...existing, expiresAt: now + Math.max(1_000, Math.floor(ttlMs)) });
}

export function releaseStorageMigrationLock(lockId: string, ownerId: string): boolean {
  const existing = loadStorageMigrationLock();
  if (!existing || existing.id !== lockId || existing.ownerId !== ownerId) return false;
  return remove(storageKeys.migrationLock).success;
}
