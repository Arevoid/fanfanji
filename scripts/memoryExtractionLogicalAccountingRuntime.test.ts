import assert from "node:assert/strict";
import {
  aggregateAiRequestLedgerAccounting,
  clearInMemoryAiRequestLedgerForTests,
  loadAiRequestLedger,
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
  history: [{ id: "runtime-message", role: "user" as const, text: "runtime synthetic fact" }],
  characterName: "Stage4D11J synthetic",
  apiKey: "synthetic-key",
  model: "default-extractor-model",
};

const records = () => loadAiRequestLedger(Date.now() + 1_000);

try {
  clearInMemoryAiRequestLedgerForTests();
  storage.clear();
  globalThis.fetch = (async () => Response.json({ candidates: [{ statement: "synthetic fact" }] })) as typeof fetch;
  await apiExtractMemories(base);
  let summary = aggregateAiRequestLedgerAccounting(records());
  assert.equal(summary.logicalActionCount, 1);
  assert.equal(summary.physicalProviderAttemptCount, 1);

  clearInMemoryAiRequestLedgerForTests();
  storage.clear();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: "synthetic primary failure" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return Response.json({ candidates: [{ statement: "synthetic fallback fact" }] });
  }) as typeof fetch;
  await apiExtractMemoriesWithModelFallback(base, "working-chat-model");
  const fallbackRows = records();
  summary = aggregateAiRequestLedgerAccounting(fallbackRows);
  assert.equal(calls, 2);
  assert.equal(summary.logicalActionCount, 1);
  assert.equal(summary.physicalProviderAttemptCount, 2);
  assert.equal(fallbackRows.length, 2);
  assert.equal(fallbackRows[0].logicalActionId, fallbackRows[1].logicalActionId);
  console.log("PASS isolated runtime accounting verification: 2 logical extraction operations, 1/1 and 1/2 logical/physical counts");
} finally {
  globalThis.fetch = originalFetch;
}
