import { attachIndexedDbLifecycle } from "./idbLifecycle";
import {
  getMemoryProjectionJobIdentity,
  normalizeMemoryProjectionErrorCode,
  type MemoryProjectionJob,
} from "../../domain/memory/memoryProjectionJob";
import { createMemoryProcessingScope, getMemoryProcessingScopeKey } from "../../domain/memory/memorySourceProcessingCursor";

export const MEMORY_PROJECTION_DB_NAME = "FanfanjiMemoryProjectionDB";
export const MEMORY_PROJECTION_DB_VERSION = 1;
export const MEMORY_PROJECTION_JOB_STORE_NAME = "memory_projection_jobs";
export const MEMORY_PROJECTION_JOB_INDEXES = ["status", "scopeKey", "projectionKind", "leaseUntil", "updatedAt"] as const;

export type MemoryProjectionJobRecord = MemoryProjectionJob & {
  scopeKey: string;
  leaseUntil: number | null;
};

const clone = <T>(value: T): T => typeof structuredClone === "function"
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value)) as T;

export function toMemoryProjectionJobRecord(job: MemoryProjectionJob): MemoryProjectionJobRecord {
  return {
    ...clone(job),
    scope: clone(job.scope),
    canonicalRefs: [...job.canonicalRefs],
    scopeKey: getMemoryProcessingScopeKey(job.scope),
    leaseUntil: job.lease?.leaseUntil ?? null,
  };
}

export function fromMemoryProjectionJobRecord(value: unknown): MemoryProjectionJob | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Partial<MemoryProjectionJobRecord>;
  if (typeof record.jobId !== "string" || typeof record.projectionKind !== "string"
    || !["conversation_summary", "legacy_memory_mirror"].includes(record.projectionKind)
    || !Array.isArray(record.canonicalRefs) || !record.canonicalRefs.every((ref) => typeof ref === "string" && ref.trim())
    || typeof record.canonicalRevision !== "string" || !record.canonicalRevision.trim()
    || !Number.isInteger(record.attemptCount) || record.attemptCount < 0
    || !Number.isInteger(record.version) || record.version < 1
    || !Number.isFinite(record.createdAt) || !Number.isFinite(record.updatedAt)
    || typeof record.scopeKey !== "string") return undefined;
  try {
    const scope = createMemoryProcessingScope(record.scope as MemoryProjectionJob["scope"]);
    if (record.scopeKey !== getMemoryProcessingScopeKey(scope)) return undefined;
    const expectedJobId = getMemoryProjectionJobIdentity({
      projectionKind: record.projectionKind as MemoryProjectionJob["projectionKind"],
      scope,
      canonicalRefs: record.canonicalRefs,
      canonicalRevision: record.canonicalRevision,
    });
    if (record.jobId !== expectedJobId) return undefined;
    const lease = record.lease && typeof record.lease === "object"
      && typeof record.lease.ownerId === "string" && Number.isFinite(record.lease.leaseUntil)
      ? { ownerId: record.lease.ownerId, leaseUntil: record.lease.leaseUntil }
      : undefined;
    const status = record.status;
    if (!["pending", "running", "completed", "failed"].includes(status as string)) return undefined;
    return clone({
      jobId: record.jobId,
      projectionKind: record.projectionKind as MemoryProjectionJob["projectionKind"],
      scope,
      canonicalRefs: [...record.canonicalRefs],
      canonicalRevision: record.canonicalRevision,
      status: status as MemoryProjectionJob["status"],
      attemptCount: record.attemptCount,
      version: record.version,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      ...(Number.isFinite(record.completedAt) ? { completedAt: record.completedAt } : {}),
      ...(record.lastErrorCode ? { lastErrorCode: normalizeMemoryProjectionErrorCode(record.lastErrorCode) } : {}),
      ...(lease ? { lease } : {}),
    });
  } catch {
    return undefined;
  }
}

export class MemoryProjectionRepositoryError extends Error {
  readonly code: "unavailable" | "open_failed" | "blocked" | "transaction_failed";

  constructor(code: MemoryProjectionRepositoryError["code"]) {
    super(`memory_projection_repository_${code}`);
    this.name = "MemoryProjectionRepositoryError";
    this.code = code;
  }
}

export function openMemoryProjectionDatabase(onInvalidated: () => void): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new MemoryProjectionRepositoryError("unavailable"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      callback();
    };
    const timer = globalThis.setTimeout(() => finish(() => reject(new MemoryProjectionRepositoryError("open_failed"))), 8000);
    const request = indexedDB.open(MEMORY_PROJECTION_DB_NAME, MEMORY_PROJECTION_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(MEMORY_PROJECTION_JOB_STORE_NAME)
        ? request.transaction?.objectStore(MEMORY_PROJECTION_JOB_STORE_NAME)
        : database.createObjectStore(MEMORY_PROJECTION_JOB_STORE_NAME, { keyPath: "jobId" });
      if (!store) return;
      MEMORY_PROJECTION_JOB_INDEXES.forEach((indexName) => {
        if (indexName === "status" && !store.indexNames.contains(indexName)) store.createIndex(indexName, indexName, { unique: false });
        if (indexName === "scopeKey" && !store.indexNames.contains(indexName)) store.createIndex(indexName, indexName, { unique: false });
        if (indexName === "projectionKind" && !store.indexNames.contains(indexName)) store.createIndex(indexName, indexName, { unique: false });
        if (indexName === "leaseUntil" && !store.indexNames.contains(indexName)) store.createIndex(indexName, indexName, { unique: false });
        if (indexName === "updatedAt" && !store.indexNames.contains(indexName)) store.createIndex(indexName, indexName, { unique: false });
      });
    };
    request.onsuccess = () => {
      const database = request.result;
      attachIndexedDbLifecycle(database, onInvalidated);
      finish(() => resolve(database));
    };
    request.onerror = () => finish(() => reject(new MemoryProjectionRepositoryError("open_failed")));
    request.onblocked = () => finish(() => reject(new MemoryProjectionRepositoryError("blocked")));
  });
}

export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new MemoryProjectionRepositoryError("transaction_failed"));
  });
}

export function idbTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new MemoryProjectionRepositoryError("transaction_failed"));
    transaction.onabort = () => reject(new MemoryProjectionRepositoryError("transaction_failed"));
  });
}
