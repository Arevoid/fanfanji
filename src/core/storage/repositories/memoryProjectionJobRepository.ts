import {
  transitionMemoryProjectionJob,
  type MemoryProjectionErrorCode,
  type MemoryProjectionJob,
  type MemoryProjectionKind,
} from "../../../domain/memory/memoryProjectionJob";
import { getMemoryProcessingScopeKey, type MemoryProcessingScope } from "../../../domain/memory/memorySourceProcessingCursor";
import type { ProjectionInsertResult, ProjectionRepositoryMutation } from "../../../domain/memory/memoryProjectionJobRepository";
import {
  fromMemoryProjectionJobRecord,
  idbRequest,
  idbTransaction,
  MEMORY_PROJECTION_JOB_STORE_NAME,
  MemoryProjectionRepositoryError,
  openMemoryProjectionDatabase,
  toMemoryProjectionJobRecord,
} from "../memoryProjectionJobDb";

type PendingFilter = { scope?: MemoryProcessingScope; projectionKind?: MemoryProjectionKind; includeExpiredRunning?: boolean; now?: number };

const clone = <T>(value: T): T => typeof structuredClone === "function"
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value)) as T;

const matches = (job: MemoryProjectionJob, filter: PendingFilter): boolean =>
  (!filter.scope || getMemoryProcessingScopeKey(job.scope) === getMemoryProcessingScopeKey(filter.scope))
  && (!filter.projectionKind || job.projectionKind === filter.projectionKind)
  && (job.status === "pending" || job.status === "failed"
    || (filter.includeExpiredRunning === true && job.status === "running" && Boolean(job.lease && job.lease.leaseUntil <= (filter.now ?? Date.now()))));

export class MemoryProjectionJobIndexedDbRepository {
  private database: IDBDatabase | null = null;

  private async db(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    this.database = await openMemoryProjectionDatabase(() => { this.database = null; });
    return this.database;
  }

  close(): void {
    this.database?.close();
    this.database = null;
  }

  async get(jobId: string): Promise<MemoryProjectionJob | undefined> {
    if (!jobId.trim()) return undefined;
    const transaction = (await this.db()).transaction(MEMORY_PROJECTION_JOB_STORE_NAME, "readonly");
    const complete = idbTransaction(transaction);
    const read = idbRequest(transaction.objectStore(MEMORY_PROJECTION_JOB_STORE_NAME).get(jobId));
    const [raw] = await Promise.all([read, complete]);
    return fromMemoryProjectionJobRecord(raw);
  }

  async listByScope(scope: MemoryProcessingScope, projectionKind?: MemoryProjectionKind): Promise<MemoryProjectionJob[]> {
    const transaction = (await this.db()).transaction(MEMORY_PROJECTION_JOB_STORE_NAME, "readonly");
    const complete = idbTransaction(transaction);
    const read = idbRequest(transaction.objectStore(MEMORY_PROJECTION_JOB_STORE_NAME)
      .index("scopeKey").getAll(getMemoryProcessingScopeKey(scope)));
    const [raw] = await Promise.all([read, complete]);
    return (raw as unknown[]).map(fromMemoryProjectionJobRecord).filter((job): job is MemoryProjectionJob => Boolean(job)
      && (!projectionKind || job.projectionKind === projectionKind));
  }

  async listPending(filter: PendingFilter = {}): Promise<MemoryProjectionJob[]> {
    const database = await this.db();
    const statuses = filter.includeExpiredRunning ? ["pending", "failed", "running"] : ["pending", "failed"];
    const records: unknown[] = [];
    for (const status of statuses) {
      const transaction = database.transaction(MEMORY_PROJECTION_JOB_STORE_NAME, "readonly");
      const complete = idbTransaction(transaction);
      const read = idbRequest(transaction.objectStore(MEMORY_PROJECTION_JOB_STORE_NAME).index("status").getAll(status));
      const [values] = await Promise.all([read, complete]);
      records.push(...(values as unknown[]));
    }
    return records.map(fromMemoryProjectionJobRecord).filter((job): job is MemoryProjectionJob => Boolean(job) && matches(job, filter));
  }

  async insertIfAbsent(job: MemoryProjectionJob): Promise<ProjectionInsertResult> {
    const transaction = (await this.db()).transaction(MEMORY_PROJECTION_JOB_STORE_NAME, "readwrite");
    const store = transaction.objectStore(MEMORY_PROJECTION_JOB_STORE_NAME);
    let result: ProjectionInsertResult | undefined;
    const complete = idbTransaction(transaction);
    const lookup = store.get(job.jobId);
    lookup.onsuccess = () => {
      const existing = fromMemoryProjectionJobRecord(lookup.result);
      if (existing) {
        result = { kind: "exists", job: existing };
        return;
      }
      const request = store.add(toMemoryProjectionJobRecord(job));
      request.onsuccess = () => { result = { kind: "inserted", job: clone(job) }; };
    };
    await complete;
    if (result) return result;
    throw new MemoryProjectionRepositoryError("transaction_failed");
  }

  async compareAndSet(jobId: string, expectedVersion: number, next: MemoryProjectionJob): Promise<ProjectionRepositoryMutation> {
    const transaction = (await this.db()).transaction(MEMORY_PROJECTION_JOB_STORE_NAME, "readwrite");
    const store = transaction.objectStore(MEMORY_PROJECTION_JOB_STORE_NAME);
    let result: ProjectionRepositoryMutation | undefined;
    const complete = idbTransaction(transaction);
    const request = store.get(jobId);
    request.onsuccess = () => {
      const current = fromMemoryProjectionJobRecord(request.result);
      if (!current) { result = { kind: "not_found" }; return; }
      if (current.version !== expectedVersion || next.jobId !== current.jobId
        || next.version !== current.version + 1 || next.updatedAt < current.updatedAt) {
        result = { kind: "conflict", job: current };
        return;
      }
      store.put(toMemoryProjectionJobRecord(next));
      result = { kind: "updated", job: clone(next) };
    };
    await complete;
    if (result) return result;
    throw new MemoryProjectionRepositoryError("transaction_failed");
  }

  private async transition(jobId: string, expectedVersion: number, now: number, transition: Parameters<typeof transitionMemoryProjectionJob>[1]): Promise<ProjectionRepositoryMutation> {
    const transaction = (await this.db()).transaction(MEMORY_PROJECTION_JOB_STORE_NAME, "readwrite");
    const store = transaction.objectStore(MEMORY_PROJECTION_JOB_STORE_NAME);
    let result: ProjectionRepositoryMutation | undefined;
    const complete = idbTransaction(transaction);
    const request = store.get(jobId);
    request.onsuccess = () => {
      const current = fromMemoryProjectionJobRecord(request.result);
      if (!current) { result = { kind: "not_found" }; return; }
      if (current.version !== expectedVersion) { result = { kind: "conflict", job: current }; return; }
      try {
        const next = transitionMemoryProjectionJob(current, transition, now);
        store.put(toMemoryProjectionJobRecord(next));
        result = { kind: "updated", job: clone(next) };
      } catch {
        result = { kind: "conflict", job: current };
      }
    };
    await complete;
    if (result) return result;
    throw new MemoryProjectionRepositoryError("transaction_failed");
  }

  markRunning(jobId: string, expectedVersion: number, ownerId: string, now: number, leaseUntil: number): Promise<ProjectionRepositoryMutation> {
    return this.transition(jobId, expectedVersion, now, { type: "start", ownerId, leaseUntil });
  }

  markCompleted(jobId: string, expectedVersion: number, now: number): Promise<ProjectionRepositoryMutation> {
    return this.transition(jobId, expectedVersion, now, { type: "complete" });
  }

  markFailed(jobId: string, expectedVersion: number, errorCode: MemoryProjectionErrorCode, now: number): Promise<ProjectionRepositoryMutation> {
    return this.transition(jobId, expectedVersion, now, { type: "fail", errorCode });
  }

  async reclaimExpired(now: number, ownerId: string, leaseUntil: number, projectionKind?: MemoryProjectionKind, limit = Number.MAX_SAFE_INTEGER): Promise<MemoryProjectionJob[]> {
    const transaction = (await this.db()).transaction(MEMORY_PROJECTION_JOB_STORE_NAME, "readwrite");
    const store = transaction.objectStore(MEMORY_PROJECTION_JOB_STORE_NAME);
    const reclaimed: MemoryProjectionJob[] = [];
    const complete = idbTransaction(transaction);
    const cursorRequest = store.index("status").openCursor("running");
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      const current = fromMemoryProjectionJobRecord(cursor.value);
      if (reclaimed.length >= limit) return;
      if (current?.lease && current.lease.leaseUntil <= now && (!projectionKind || current.projectionKind === projectionKind)) {
        try {
          const next = transitionMemoryProjectionJob(current, { type: "reclaim", ownerId, leaseUntil }, now);
          cursor.update(toMemoryProjectionJobRecord(next));
          reclaimed.push(next);
        } catch { /* malformed or non-reclaimable records remain untouched */ }
      }
      cursor.continue();
    };
    await complete;
    return reclaimed;
  }
}

export const memoryProjectionJobRepository = new MemoryProjectionJobIndexedDbRepository();
