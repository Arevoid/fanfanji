import {
  createMemoryProcessingScope,
  getMemoryProcessingScopeKey,
  type MemoryProcessingScope,
} from "./memorySourceProcessingCursor";

export type MemoryProjectionKind = "conversation_summary" | "legacy_memory_mirror";
export type MemoryProjectionStatus = "pending" | "running" | "completed" | "failed";
export type MemoryProjectionErrorCode =
  | "CANONICAL_MISSING"
  | "SUMMARY_WRITE_FAILED"
  | "LEGACY_MIRROR_FAILED"
  | "SCOPE_MISMATCH"
  | "CANONICAL_REVISION_CHANGED"
  | "LEASE_CONFLICT"
  | "UNKNOWN";

export interface MemoryProjectionLease {
  ownerId: string;
  leaseUntil: number;
}

export interface MemoryProjectionJob {
  jobId: string;
  projectionKind: MemoryProjectionKind;
  scope: MemoryProcessingScope;
  canonicalRefs: readonly string[];
  canonicalRevision: string;
  status: MemoryProjectionStatus;
  attemptCount: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  lastErrorCode?: MemoryProjectionErrorCode;
  lease?: MemoryProjectionLease;
}

export type MemoryProjectionTransition =
  | { type: "start"; ownerId: string; leaseUntil: number }
  | { type: "reclaim"; ownerId: string; leaseUntil: number }
  | { type: "complete" }
  | { type: "fail"; errorCode: MemoryProjectionErrorCode }
  | { type: "retry" };

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const projectionKinds: readonly MemoryProjectionKind[] = ["conversation_summary", "legacy_memory_mirror"];
const statuses: readonly MemoryProjectionStatus[] = ["pending", "running", "completed", "failed"];

export function normalizeMemoryProjectionErrorCode(value: unknown): MemoryProjectionErrorCode {
  return value === "CANONICAL_MISSING"
    || value === "SUMMARY_WRITE_FAILED"
    || value === "LEGACY_MIRROR_FAILED"
    || value === "SCOPE_MISMATCH"
    || value === "CANONICAL_REVISION_CHANGED"
    || value === "LEASE_CONFLICT"
    ? value
    : "UNKNOWN";
}

export function getMemoryProjectionJobIdentity(input: {
  projectionKind: MemoryProjectionKind;
  scope: MemoryProcessingScope;
  canonicalRefs: readonly string[];
  canonicalRevision: string;
}): string {
  if (!projectionKinds.includes(input.projectionKind) || !nonEmpty(input.canonicalRevision)) {
    throw new Error("memory_projection_identity_invalid");
  }
  const refs = Array.from(new Set(input.canonicalRefs.filter(nonEmpty).map((ref) => ref.trim()))).sort();
  if (refs.length === 0) throw new Error("memory_projection_canonical_refs_missing");
  return [
    input.projectionKind,
    getMemoryProcessingScopeKey(input.scope),
    input.canonicalRevision.trim(),
    refs.map((ref) => encodeURIComponent(ref)).join(","),
  ].join("::");
}

export function createMemoryProjectionJob(input: {
  projectionKind: MemoryProjectionKind;
  scope: MemoryProcessingScope;
  canonicalRefs: readonly string[];
  canonicalRevision: string;
  createdAt: number;
}): MemoryProjectionJob {
  if (!Number.isFinite(input.createdAt) || input.createdAt < 0) throw new Error("memory_projection_timestamp_invalid");
  const scope = createMemoryProcessingScope(input.scope);
  const canonicalRefs = Array.from(new Set(input.canonicalRefs.filter(nonEmpty).map((ref) => ref.trim()))).sort();
  const jobId = getMemoryProjectionJobIdentity({ ...input, scope, canonicalRefs });
  return {
    jobId,
    projectionKind: input.projectionKind,
    scope,
    canonicalRefs,
    canonicalRevision: input.canonicalRevision.trim(),
    status: "pending",
    attemptCount: 0,
    version: 1,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function canAcquireMemoryProjectionLease(job: MemoryProjectionJob, ownerId: string, now: number): boolean {
  if (!nonEmpty(ownerId) || !Number.isFinite(now)) return false;
  return !job.lease || job.lease.ownerId === ownerId || job.lease.leaseUntil <= now;
}

export function transitionMemoryProjectionJob(
  job: MemoryProjectionJob,
  transition: MemoryProjectionTransition,
  now: number,
): MemoryProjectionJob {
  if (!statuses.includes(job.status) || !Number.isFinite(now) || now < job.updatedAt) {
    throw new Error("memory_projection_transition_invalid");
  }
  const base = { ...job, updatedAt: now, version: job.version + 1 };
  if (transition.type === "start" || transition.type === "reclaim") {
    const reclaimable = transition.type === "reclaim"
      && job.status === "running"
      && Boolean(job.lease && job.lease.leaseUntil <= now);
    const startable = transition.type === "start" && job.status === "pending";
    if ((!startable && !reclaimable) || !canAcquireMemoryProjectionLease(job, transition.ownerId, now)
      || !Number.isFinite(transition.leaseUntil) || transition.leaseUntil <= now) {
      throw new Error("memory_projection_transition_invalid");
    }
    return { ...base, status: "running", attemptCount: job.attemptCount + 1, lease: { ownerId: transition.ownerId.trim(), leaseUntil: transition.leaseUntil }, lastErrorCode: undefined, completedAt: undefined };
  }
  if (transition.type === "complete") {
    if (job.status !== "running") throw new Error("memory_projection_transition_invalid");
    return { ...base, status: "completed", completedAt: now, lease: undefined, lastErrorCode: undefined };
  }
  if (transition.type === "fail") {
    if (job.status !== "running") throw new Error("memory_projection_transition_invalid");
    return { ...base, status: "failed", lease: undefined, lastErrorCode: normalizeMemoryProjectionErrorCode(transition.errorCode) };
  }
  if (job.status !== "failed") throw new Error("memory_projection_transition_invalid");
  return { ...base, status: "pending", lease: undefined, completedAt: undefined, lastErrorCode: undefined };
}
