import {
  transitionMemoryProjectionJob,
  type MemoryProjectionErrorCode,
  type MemoryProjectionJob,
  type MemoryProjectionKind,
} from "./memoryProjectionJob";
import { getMemoryProcessingScopeKey, type MemoryProcessingScope } from "./memorySourceProcessingCursor";

export type ProjectionRepositoryMutation =
  | { kind: "updated"; job: MemoryProjectionJob }
  | { kind: "conflict"; job?: MemoryProjectionJob }
  | { kind: "not_found" };

export type ProjectionInsertResult =
  | { kind: "inserted"; job: MemoryProjectionJob }
  | { kind: "exists"; job: MemoryProjectionJob };

export interface MemoryProjectionJobListFilter {
  scope?: MemoryProcessingScope;
  projectionKind?: MemoryProjectionKind;
  includeExpiredRunning?: boolean;
  now?: number;
}

export interface MemoryProjectionJobRepository {
  get(jobId: string): MemoryProjectionJob | undefined;
  listPending(filter?: MemoryProjectionJobListFilter): MemoryProjectionJob[];
  insertIfAbsent(job: MemoryProjectionJob): ProjectionInsertResult;
  compareAndSet(jobId: string, expectedVersion: number, next: MemoryProjectionJob): ProjectionRepositoryMutation;
  markRunning(jobId: string, expectedVersion: number, ownerId: string, now: number, leaseUntil: number): ProjectionRepositoryMutation;
  markCompleted(jobId: string, expectedVersion: number, now: number): ProjectionRepositoryMutation;
  markFailed(jobId: string, expectedVersion: number, errorCode: MemoryProjectionErrorCode, now: number): ProjectionRepositoryMutation;
  reclaimExpired(now: number, ownerId: string, leaseUntil: number): MemoryProjectionJob[];
}

const clone = <T>(value: T): T => typeof structuredClone === "function"
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value)) as T;

const scopeMatches = (left: MemoryProcessingScope, right?: MemoryProcessingScope): boolean =>
  !right || getMemoryProcessingScopeKey(left) === getMemoryProcessingScopeKey(right);

/** Pure, non-persistent repository for contract and concurrency characterization only. */
export class InMemoryMemoryProjectionJobRepository implements MemoryProjectionJobRepository {
  private readonly jobs = new Map<string, MemoryProjectionJob>();

  get(jobId: string): MemoryProjectionJob | undefined {
    const job = this.jobs.get(jobId);
    return job ? clone(job) : undefined;
  }

  listPending(filter: MemoryProjectionJobListFilter = {}): MemoryProjectionJob[] {
    const now = filter.now ?? Date.now();
    return [...this.jobs.values()]
      .filter((job) => scopeMatches(job.scope, filter.scope))
      .filter((job) => !filter.projectionKind || job.projectionKind === filter.projectionKind)
      .filter((job) => job.status === "pending" || job.status === "failed"
        || (filter.includeExpiredRunning === true && job.status === "running" && Boolean(job.lease && job.lease.leaseUntil <= now)))
      .map(clone);
  }

  insertIfAbsent(job: MemoryProjectionJob): ProjectionInsertResult {
    const existing = this.jobs.get(job.jobId);
    if (existing) return { kind: "exists", job: clone(existing) };
    this.jobs.set(job.jobId, clone(job));
    return { kind: "inserted", job: clone(job) };
  }

  compareAndSet(jobId: string, expectedVersion: number, next: MemoryProjectionJob): ProjectionRepositoryMutation {
    const current = this.jobs.get(jobId);
    if (!current) return { kind: "not_found" };
    if (current.version !== expectedVersion
      || next.jobId !== current.jobId
      || next.version !== current.version + 1
      || next.updatedAt < current.updatedAt) return { kind: "conflict", job: clone(current) };
    this.jobs.set(jobId, clone(next));
    return { kind: "updated", job: clone(next) };
  }

  private transition(jobId: string, expectedVersion: number, now: number, transition: Parameters<typeof transitionMemoryProjectionJob>[1]): ProjectionRepositoryMutation {
    const current = this.jobs.get(jobId);
    if (!current) return { kind: "not_found" };
    if (current.version !== expectedVersion) return { kind: "conflict", job: clone(current) };
    try {
      return this.compareAndSet(jobId, expectedVersion, transitionMemoryProjectionJob(current, transition, now));
    } catch {
      return { kind: "conflict", job: clone(current) };
    }
  }

  markRunning(jobId: string, expectedVersion: number, ownerId: string, now: number, leaseUntil: number): ProjectionRepositoryMutation {
    return this.transition(jobId, expectedVersion, now, { type: "start", ownerId, leaseUntil });
  }

  markCompleted(jobId: string, expectedVersion: number, now: number): ProjectionRepositoryMutation {
    return this.transition(jobId, expectedVersion, now, { type: "complete" });
  }

  markFailed(jobId: string, expectedVersion: number, errorCode: MemoryProjectionErrorCode, now: number): ProjectionRepositoryMutation {
    return this.transition(jobId, expectedVersion, now, { type: "fail", errorCode });
  }

  reclaimExpired(now: number, ownerId: string, leaseUntil: number): MemoryProjectionJob[] {
    const reclaimed: MemoryProjectionJob[] = [];
    for (const job of this.jobs.values()) {
      if (job.status !== "running" || !job.lease || job.lease.leaseUntil > now) continue;
      const result = this.transition(job.jobId, job.version, now, { type: "reclaim", ownerId, leaseUntil });
      if (result.kind === "updated") reclaimed.push(result.job);
    }
    return reclaimed;
  }
}
