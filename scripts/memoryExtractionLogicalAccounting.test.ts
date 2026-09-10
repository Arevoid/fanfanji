import assert from "node:assert/strict";
import {
  aggregateAiRequestLedgerAccounting,
  clearInMemoryAiRequestLedgerForTests,
  loadAiRequestLedger,
  recordAiRequest,
  type AiRequestEnvelope,
} from "../src/core/monitoring/aiRequestLedger";
import { apiExtractMemories, apiExtractMemoriesWithModelFallback } from "../src/utils/apiHelper";

const originalFetch = globalThis.fetch;
const storage = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  },
};

const base = {
  history: [{ id: "message-1", role: "user" as const, text: "明天一起吃饭。" }],
  characterName: "角色",
  apiKey: "test-key",
  model: "default-extractor-model",
};

function resetLedger(): void {
  storage.clear();
  clearInMemoryAiRequestLedgerForTests();
}

function records() {
  return loadAiRequestLedger(Date.now() + 1_000);
}

function legacyRecord(): AiRequestEnvelope {
  const now = Date.now();
  return {
    requestId: "legacy-request",
    purpose: "memory_extract",
    transport: "backend_proxy",
    startedAt: now,
    durationMs: 10,
    status: "success",
    errorCategory: "none",
    providerRequestCount: 1,
    retryCount: 0,
    retryReasons: [],
    fallbackCount: 0,
    fallbackReasons: [],
    uncertainDelivery: false,
    recordedAt: now,
  };
}

try {
  resetLedger();
  globalThis.fetch = (async () => Response.json({ candidates: [{ statement: "事实" }] })) as typeof fetch;
  await apiExtractMemories(base);
  let summary = aggregateAiRequestLedgerAccounting(records());
  assert.equal(summary.logicalActionCount, 1);
  assert.equal(summary.physicalProviderAttemptCount, 1);
  assert.equal(summary.logicalGroupingUnknownRows, 0);
  assert.equal(summary.fallbackAttemptCount, 0);
  assert.equal(summary.physicalAttemptsPerLogicalAction, 1);

  resetLedger();
  let requestCount = 0;
  const requestBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestCount += 1;
    requestBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
    if (requestCount === 1) {
      return new Response(JSON.stringify({ error: "primary model unavailable" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return Response.json({ candidates: [{ statement: "fallback fact" }] });
  }) as typeof fetch;
  const recovered = await apiExtractMemoriesWithModelFallback(base, "working-chat-model");
  assert.equal(recovered.error, undefined);
  assert.equal(requestCount, 2, "model fallback keeps the existing two provider attempts");
  assert.equal(requestBodies[0]?.model, "default-extractor-model");
  assert.equal(requestBodies[1]?.model, "working-chat-model");
  assert.equal("logicalActionId" in requestBodies[0], false, "lineage is not sent to the Provider");
  const fallbackRecords = records();
  assert.equal(fallbackRecords.length, 2);
  assert.ok(fallbackRecords[0].logicalActionId);
  assert.equal(fallbackRecords[0].logicalActionId, fallbackRecords[1].logicalActionId);
  summary = aggregateAiRequestLedgerAccounting(fallbackRecords);
  assert.equal(summary.logicalActionCount, 1);
  assert.equal(summary.physicalProviderAttemptCount, 2);
  assert.equal(summary.fallbackAttemptCount, 1);
  assert.equal(summary.fallbackAttemptRate, 1);
  assert.equal(summary.physicalAttemptsPerLogicalAction, 2);
  assert.equal(fallbackRecords[0].providerRequestCount, 1);
  assert.equal(fallbackRecords[1].providerRequestCount, 1);
  assert.equal(fallbackRecords[0].retryCount, 0);
  assert.equal(fallbackRecords[1].retryCount, 0);

  resetLedger();
  let doubleFailureCalls = 0;
  globalThis.fetch = (async () => {
    doubleFailureCalls += 1;
    return new Response(JSON.stringify({ error: "model unavailable" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const failed = await apiExtractMemoriesWithModelFallback(base, "working-chat-model");
  assert.match(failed.error || "", /model unavailable/);
  assert.equal(doubleFailureCalls, 2);
  summary = aggregateAiRequestLedgerAccounting(records());
  assert.equal(summary.logicalActionCount, 1);
  assert.equal(summary.physicalProviderAttemptCount, 2);

  resetLedger();
  globalThis.fetch = (async () => Response.json({ candidates: [{ statement: "独立事实" }] })) as typeof fetch;
  await apiExtractMemories(base);
  await apiExtractMemories(base);
  const independentRecords = records();
  assert.equal(independentRecords.length, 2);
  assert.notEqual(independentRecords[0].logicalActionId, independentRecords[1].logicalActionId);
  summary = aggregateAiRequestLedgerAccounting(independentRecords);
  assert.equal(summary.logicalActionCount, 2, "independent extractions cannot merge");
  assert.equal(summary.physicalProviderAttemptCount, 2);

  resetLedger();
  recordAiRequest(legacyRecord());
  summary = aggregateAiRequestLedgerAccounting(records());
  assert.equal(summary.logicalActionCount, 0);
  assert.equal(summary.logicalGroupingUnknownRows, 1);
  assert.equal(summary.physicalProviderAttemptCount, 1);

  console.log("PASS memory extraction logical accounting: explicit lineage, physical attempts, fallback grouping, independent actions, and legacy-row safety");
} finally {
  globalThis.fetch = originalFetch;
}
