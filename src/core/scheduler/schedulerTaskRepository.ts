import { readJson, writeJson } from "../storage/storageAdapter";
import { storageKeys } from "../storage/storageKeys";
import { getSchedulerNow } from "./schedulerClock";
import { announceSchedulerLease, announceSchedulerLeaseRelease, hasActivePeerLease } from "./schedulerLeaseChannel";

export type BackgroundTaskPayloadValue = string | number | boolean | null | BackgroundTaskPayloadValue[] | { [key: string]: BackgroundTaskPayloadValue };

export interface PersistedBackgroundTaskSnapshot {
  id: string;
  status: "pending" | "running" | "success" | "failed" | "cancelled" | "expired";
  attempts: number;
  maxAttempts: number;
  lastStartedAt?: number;
  lastFinishedAt?: number;
  lastError?: string;
  reason?: string;
  taskType?: string;
  cooldownUntil?: number;
  userRejected?: boolean;
  metadata?: Record<string, string | number | boolean | null>;
  /** Non-sensitive task descriptor used by a registered factory after reload. */
  recoveryPayload?: Record<string, BackgroundTaskPayloadValue>;
}

export interface BackgroundTaskLease {
  id: string;
  ownerId: string;
  expiresAt: number;
}

const isSafeMetadata = (value: unknown): value is Record<string, string | number | boolean | null> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => item === null || ["string", "number", "boolean"].includes(typeof item));
};

const isSnapshot = (value: unknown): value is PersistedBackgroundTaskSnapshot => {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return typeof snapshot.id === "string"
    && ["pending", "running", "success", "failed", "cancelled", "expired"].includes(snapshot.status as string)
    && Number.isInteger(snapshot.attempts) && Number(snapshot.attempts) >= 0
    && Number.isInteger(snapshot.maxAttempts) && Number(snapshot.maxAttempts) > 0
    && (snapshot.lastStartedAt === undefined || typeof snapshot.lastStartedAt === "number")
    && (snapshot.lastFinishedAt === undefined || typeof snapshot.lastFinishedAt === "number")
    && (snapshot.lastError === undefined || typeof snapshot.lastError === "string")
    && (snapshot.reason === undefined || typeof snapshot.reason === "string")
    && (snapshot.taskType === undefined || typeof snapshot.taskType === "string")
    && (snapshot.cooldownUntil === undefined || typeof snapshot.cooldownUntil === "number")
    && (snapshot.userRejected === undefined || typeof snapshot.userRejected === "boolean")
    && (snapshot.metadata === undefined || isSafeMetadata(snapshot.metadata))
    && (snapshot.recoveryPayload === undefined || isSafePayload(snapshot.recoveryPayload));
};

const isSafePayload = (value: unknown, depth = 0): value is Record<string, BackgroundTaskPayloadValue> => {
  if (depth > 4 || !value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, item]) => {
    if (!key || key.length > 100) return false;
    if (item === null || ["string", "number", "boolean"].includes(typeof item)) return true;
    if (Array.isArray(item)) return item.length <= 100 && item.every((entry) => isSafePayloadValue(entry, depth + 1));
    return isSafePayload(item, depth + 1);
  });
};

const isSafePayloadValue = (value: unknown, depth: number): value is BackgroundTaskPayloadValue => {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.length <= 100 && value.every((entry) => isSafePayloadValue(entry, depth + 1));
  return isSafePayload(value, depth);
};

export function loadPersistedBackgroundTaskSnapshots(): PersistedBackgroundTaskSnapshot[] {
  const result = readJson<unknown>(storageKeys.backgroundSchedulerTasks, []);
  if (!result.valid || !Array.isArray(result.value)) return [];
  return result.value.filter(isSnapshot);
}

export function loadRecoverableBackgroundTaskSnapshots(now = getSchedulerNow()): PersistedBackgroundTaskSnapshot[] {
  return loadPersistedBackgroundTaskSnapshots().filter((snapshot) =>
    ["pending", "running", "failed"].includes(snapshot.status)
    && !snapshot.userRejected
    && (snapshot.cooldownUntil === undefined || snapshot.cooldownUntil <= now));
}

/** Persists status plus a bounded, non-sensitive recovery descriptor; private content is never stored. */
export function savePersistedBackgroundTaskSnapshot(snapshot: PersistedBackgroundTaskSnapshot): boolean {
  const snapshots = loadPersistedBackgroundTaskSnapshots().filter((entry) => entry.id !== snapshot.id);
  snapshots.push({ ...snapshot });
  const result = writeJson(storageKeys.backgroundSchedulerTasks, snapshots.slice(-100));
  return result.success;
}

const readLeases = (): BackgroundTaskLease[] => {
  const result = readJson<unknown>(storageKeys.backgroundSchedulerLeases, []);
  if (!result.valid || !Array.isArray(result.value)) return [];
  return result.value.filter((value): value is BackgroundTaskLease => Boolean(
    value && typeof value === "object"
      && typeof (value as BackgroundTaskLease).id === "string"
      && typeof (value as BackgroundTaskLease).ownerId === "string"
      && typeof (value as BackgroundTaskLease).expiresAt === "number",
  ));
};

/** Best-effort cross-tab lease; expired leases are recoverable and never delete task data. */
export function acquireBackgroundTaskLease(id: string, ownerId: string, now = getSchedulerNow(), leaseMs = 30_000): boolean {
  if (hasActivePeerLease(id, ownerId, now)) return false;
  if (typeof window === "undefined" || !window.localStorage || typeof window.localStorage.getItem !== "function") return true;
  const active = readLeases().filter((lease) => lease.expiresAt > now && lease.id !== id);
  const current = readLeases().find((lease) => lease.id === id);
  if (current && current.ownerId !== ownerId && current.expiresAt > now) return false;
  active.push({ id, ownerId, expiresAt: now + Math.max(1000, leaseMs) });
  if (!writeJson(storageKeys.backgroundSchedulerLeases, active).success) return false;
  // localStorage has no transaction primitive; verify our write won the last
  // read-after-write race instead of claiming a lease optimistically.
  const acquired = readLeases().some((lease) => lease.id === id && lease.ownerId === ownerId && lease.expiresAt > now);
  if (acquired) announceSchedulerLease(id, ownerId, now + Math.max(1000, leaseMs));
  return acquired;
}

/** Extends an owned lease while a task is still running, preventing long work from becoming duplicate work. */
export function renewBackgroundTaskLease(id: string, ownerId: string, now = getSchedulerNow(), leaseMs = 30_000): boolean {
  if (typeof window === "undefined" || !window.localStorage || typeof window.localStorage.getItem !== "function") return true;
  const leases = readLeases();
  const current = leases.find((lease) => lease.id === id && lease.ownerId === ownerId);
  if (!current || current.expiresAt <= now) return false;
  const expiresAt = now + Math.max(1000, leaseMs);
  const updated = leases.map((lease) => lease.id === id && lease.ownerId === ownerId ? { ...lease, expiresAt } : lease);
  if (!writeJson(storageKeys.backgroundSchedulerLeases, updated).success) return false;
  const renewed = readLeases().some((lease) => lease.id === id && lease.ownerId === ownerId && lease.expiresAt > now);
  if (renewed) announceSchedulerLease(id, ownerId, expiresAt);
  return renewed;
}

export function releaseBackgroundTaskLease(id: string, ownerId: string): boolean {
  if (typeof window === "undefined" || !window.localStorage || typeof window.localStorage.getItem !== "function") return true;
  const remaining = readLeases().filter((lease) => !(lease.id === id && lease.ownerId === ownerId));
  const released = writeJson(storageKeys.backgroundSchedulerLeases, remaining).success;
  if (released) announceSchedulerLeaseRelease(id, ownerId);
  return released;
}
