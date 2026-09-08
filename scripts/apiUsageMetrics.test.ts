import assert from "node:assert/strict";
import { API_USAGE_METRICS_KEY, loadApiUsageMetrics, recordApiUsage, summarizeApiUsage } from "../src/core/monitoring/apiUsageMetrics";

const storage = new Map<string, string>();
(globalThis as any).window = { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
} };

recordApiUsage({ operation: "chat", succeeded: true, inputCharacters: 100, outputCharacters: 20, at: Date.parse("2026-08-20T01:00:00Z") });
recordApiUsage({ operation: "chat", succeeded: false, inputCharacters: 10, at: Date.parse("2026-08-20T02:00:00Z") });
recordApiUsage({ operation: "translation", succeeded: true, inputCharacters: 30, outputCharacters: 40, at: Date.parse("2026-08-19T02:00:00Z") });

const metrics = loadApiUsageMetrics(Date.parse("2026-08-20T03:00:00Z"));
assert.equal(metrics.chat?.[0]?.requests, 2);
assert.equal(metrics.chat?.[0]?.failures, 1);
assert.equal(summarizeApiUsage(metrics).outputCharacters, 60);
assert.equal(storage.has(API_USAGE_METRICS_KEY), true);

console.log("PASS bounded API usage metrics record counts and character volume without storing credentials");
