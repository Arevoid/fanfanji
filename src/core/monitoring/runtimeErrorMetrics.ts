import { readJson, writeJson } from "../storage/storageAdapter";
import { storageKeys } from "../storage/storageKeys";

export const RUNTIME_ERROR_RETENTION_DAYS = 30;
const MAX_ERROR_BUCKETS = 40;

export type RuntimeErrorSource = "window-error" | "unhandled-rejection" | "manual";

export interface RuntimeErrorBucket {
  source: RuntimeErrorSource;
  name: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface RuntimeErrorMetrics {
  version: 1;
  total: number;
  buckets: RuntimeErrorBucket[];
}

const emptyMetrics = (): RuntimeErrorMetrics => ({ version: 1, total: 0, buckets: [] });

function normalizeName(value: unknown): string {
  if (typeof value !== "string") return "UnknownError";
  const normalized = value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 64);
  return normalized || "UnknownError";
}

function normalizeSource(value: unknown): RuntimeErrorSource {
  return value === "window-error" || value === "unhandled-rejection" || value === "manual" ? value : "manual";
}

export function loadRuntimeErrorMetrics(now = Date.now()): RuntimeErrorMetrics {
  const raw = readJson<Partial<RuntimeErrorMetrics>>(storageKeys.runtimeErrorMetrics, emptyMetrics());
  if (!raw.valid || !raw.value || raw.value.version !== 1 || !Array.isArray(raw.value.buckets)) return emptyMetrics();
  const cutoff = now - RUNTIME_ERROR_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const buckets = raw.value.buckets
    .filter((bucket): bucket is RuntimeErrorBucket => Boolean(bucket && typeof bucket === "object"))
    .map((bucket) => ({
      source: normalizeSource(bucket.source),
      name: normalizeName(bucket.name),
      count: Math.max(0, Math.floor(Number(bucket.count) || 0)),
      firstSeenAt: Math.max(0, Number(bucket.firstSeenAt) || 0),
      lastSeenAt: Math.max(0, Number(bucket.lastSeenAt) || 0),
    }))
    .filter((bucket) => bucket.lastSeenAt >= cutoff)
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
    .slice(0, MAX_ERROR_BUCKETS);
  return { version: 1, total: buckets.reduce((total, bucket) => total + bucket.count, 0), buckets };
}

export function recordRuntimeError(input: { source: RuntimeErrorSource; name?: string; at?: number }): void {
  const at = input.at ?? Date.now();
  const metrics = loadRuntimeErrorMetrics(at);
  const source = normalizeSource(input.source);
  const name = normalizeName(input.name);
  const existing = metrics.buckets.find((bucket) => bucket.source === source && bucket.name === name);
  const bucket = existing ?? { source, name, count: 0, firstSeenAt: at, lastSeenAt: at };
  bucket.count += 1;
  bucket.lastSeenAt = at;
  const next: RuntimeErrorMetrics = {
    version: 1,
    total: metrics.total + 1,
    buckets: [bucket, ...metrics.buckets.filter((candidate) => candidate !== existing)].sort((left, right) => right.lastSeenAt - left.lastSeenAt).slice(0, MAX_ERROR_BUCKETS),
  };
  const write = writeJson(storageKeys.runtimeErrorMetrics, next);
  if (!write.success && write.error !== "unavailable") console.warn("[monitoring] Runtime error metrics could not be persisted.", write.error);
}

export function summarizeRuntimeErrors(metrics = loadRuntimeErrorMetrics()): { total: number; buckets: number } {
  return { total: metrics.total, buckets: metrics.buckets.length };
}
