import assert from "node:assert/strict";

const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
} as Storage;
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });

const { loadRuntimeErrorMetrics, recordRuntimeError, summarizeRuntimeErrors } = await import("../src/core/monitoring/runtimeErrorMetrics");
const now = Date.parse("2026-08-20T03:00:00Z");
recordRuntimeError({ source: "window-error", name: "TypeError", at: now });
recordRuntimeError({ source: "window-error", name: "TypeError", at: now + 1 });
recordRuntimeError({ source: "unhandled-rejection", name: "NetworkError", at: now + 2 });

const metrics = loadRuntimeErrorMetrics(now + 3);
assert.equal(metrics.total, 3);
assert.equal(metrics.buckets.find((bucket) => bucket.name === "TypeError")?.count, 2);
assert.deepEqual(summarizeRuntimeErrors(metrics), { total: 3, buckets: 2 });
assert.doesNotMatch(values.values().next().value || "", /secret|stack|request/i);

const expired = loadRuntimeErrorMetrics(now + 31 * 24 * 60 * 60 * 1000);
assert.equal(expired.total, 0, "runtime error metrics must be bounded by retention");

console.log("PASS bounded runtime error monitoring records only source/type counters without error content");
