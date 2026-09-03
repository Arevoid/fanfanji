import { readJson, writeJson } from "../storage/storageAdapter";

export const API_USAGE_METRICS_KEY = "fanfan_api_usage_metrics_v1";
export const API_USAGE_RETENTION_DAYS = 90;

export type ApiUsageOperation = "chat" | "translation" | "memory-extraction" | "personality";

export interface ApiUsageDay {
  day: string;
  requests: number;
  successes: number;
  failures: number;
  inputCharacters: number;
  outputCharacters: number;
  lastRequestAt: number;
}

export type ApiUsageMetrics = Partial<Record<ApiUsageOperation, ApiUsageDay[]>>;

function currentDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizeDay(value: unknown): ApiUsageDay | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ApiUsageDay>;
  if (typeof candidate.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(candidate.day)) return null;
  return {
    day: candidate.day,
    requests: Math.max(0, Number(candidate.requests) || 0),
    successes: Math.max(0, Number(candidate.successes) || 0),
    failures: Math.max(0, Number(candidate.failures) || 0),
    inputCharacters: Math.max(0, Number(candidate.inputCharacters) || 0),
    outputCharacters: Math.max(0, Number(candidate.outputCharacters) || 0),
    lastRequestAt: Math.max(0, Number(candidate.lastRequestAt) || 0),
  };
}

export function loadApiUsageMetrics(now = Date.now()): ApiUsageMetrics {
  const raw = readJson<ApiUsageMetrics>(API_USAGE_METRICS_KEY, {});
  if (!raw.valid || !raw.value || typeof raw.value !== "object") return {};
  const cutoff = now - API_USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const result: ApiUsageMetrics = {};
  for (const operation of ["chat", "translation", "memory-extraction", "personality"] as const) {
    const days = Array.isArray(raw.value[operation])
      ? raw.value[operation].map(normalizeDay).filter((day): day is ApiUsageDay => Boolean(day))
      : [];
    const retained = days.filter((day) => day.lastRequestAt >= cutoff || day.day === currentDay(now));
    if (retained.length > 0) result[operation] = retained.sort((left, right) => left.day.localeCompare(right.day));
  }
  return result;
}

export function recordApiUsage(input: {
  operation: ApiUsageOperation;
  succeeded: boolean;
  inputCharacters?: number;
  outputCharacters?: number;
  at?: number;
}): void {
  const at = input.at ?? Date.now();
  const metrics = loadApiUsageMetrics(at);
  const days = metrics[input.operation] ?? [];
  const day = currentDay(at);
  const existing = days.find((entry) => entry.day === day);
  const next: ApiUsageDay = existing ?? {
    day,
    requests: 0,
    successes: 0,
    failures: 0,
    inputCharacters: 0,
    outputCharacters: 0,
    lastRequestAt: 0,
  };
  next.requests += 1;
  if (input.succeeded) next.successes += 1;
  else next.failures += 1;
  next.inputCharacters += Math.max(0, Math.floor(input.inputCharacters || 0));
  next.outputCharacters += Math.max(0, Math.floor(input.outputCharacters || 0));
  next.lastRequestAt = Math.max(next.lastRequestAt, at);
  metrics[input.operation] = [...days.filter((entry) => entry.day !== day), next].sort((left, right) => left.day.localeCompare(right.day));
  const write = writeJson(API_USAGE_METRICS_KEY, metrics);
  if (!write.success && write.error !== "unavailable") console.warn("[monitoring] API usage metrics could not be persisted.", write.error);
}

export function summarizeApiUsage(metrics = loadApiUsageMetrics()): {
  requests: number;
  successes: number;
  failures: number;
  inputCharacters: number;
  outputCharacters: number;
} {
  return Object.values(metrics).flat().reduce((summary, day) => ({
    requests: summary.requests + (day?.requests || 0),
    successes: summary.successes + (day?.successes || 0),
    failures: summary.failures + (day?.failures || 0),
    inputCharacters: summary.inputCharacters + (day?.inputCharacters || 0),
    outputCharacters: summary.outputCharacters + (day?.outputCharacters || 0),
  }), { requests: 0, successes: 0, failures: 0, inputCharacters: 0, outputCharacters: 0 });
}
