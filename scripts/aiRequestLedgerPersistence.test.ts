import assert from "node:assert/strict";
import {
  AI_REQUEST_LEDGER_KEY,
  AI_REQUEST_LEDGER_MAX_RECORDS,
  AI_REQUEST_LEDGER_RETENTION_DAYS,
  clearInMemoryAiRequestLedgerForTests,
  createAiRequestLedgerSession,
  flushAiRequestLedger,
  loadAiRequestLedger,
  recordAiRequest,
  type AiRequestEnvelope,
} from "../src/core/monitoring/aiRequestLedger";
import { apiChat } from "../src/utils/apiHelper";

const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as { window?: unknown }).window;
const storage = new Map<string, string>();
let setItemCount = 0;
let storageMode: "ok" | "quota" | "write" = "ok";

const windowMock = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      setItemCount += 1;
      if (storageMode === "quota") {
        const error = new Error("quota exceeded") as Error & { name: string };
        error.name = "QuotaExceededError";
        throw error;
      }
      if (storageMode === "write") throw new Error("storage write failed");
      storage.set(key, value);
    },
    removeItem: (key: string) => { storage.delete(key); },
  },
  addEventListener: () => undefined,
};

function reset(mode: typeof storageMode = "ok"): void {
  storage.clear();
  setItemCount = 0;
  storageMode = mode;
  (globalThis as { window?: unknown }).window = windowMock;
  clearInMemoryAiRequestLedgerForTests();
}

function makeEnvelope(requestId: string, recordedAt: number): AiRequestEnvelope {
  return {
    requestId,
    purpose: "chat_reply",
    provider: "test-provider",
    model: "test-model",
    endpoint: "/api/chat",
    transport: "backend_proxy",
    startedAt: recordedAt,
    durationMs: 1,
    status: "success",
    errorCategory: "none",
    providerRequestCount: 1,
    retryCount: 0,
    retryReasons: [],
    fallbackCount: 0,
    fallbackReasons: [],
    uncertainDelivery: false,
    recordedAt,
  };
}

function completeRecord(): AiRequestEnvelope {
  const session = createAiRequestLedgerSession({ purpose: "chat_reply" });
  return session.complete({ succeeded: true, outputCharacters: 2 });
}

try {
  reset();
  (globalThis as { window?: unknown }).window = undefined;
  const unavailableRecord = completeRecord();
  flushAiRequestLedger();
  assert.ok(loadAiRequestLedger().some((record) => record.requestId === unavailableRecord.requestId));

  reset("quota");
  globalThis.fetch = (async () => Response.json({ text: "正常回复" })) as typeof fetch;
  const quotaResult = await apiChat({ message: "quota-test", history: [], apiKey: "secret-key", model: "test-model" });
  assert.equal(quotaResult.text, "正常回复", "quota failure must not change the original AI result");
  assert.doesNotThrow(() => flushAiRequestLedger());

  reset("write");
  const writeFailureRecord = completeRecord();
  assert.doesNotThrow(() => flushAiRequestLedger());
  assert.ok(loadAiRequestLedger().some((record) => record.requestId === writeFailureRecord.requestId));

  reset();
  for (let index = 0; index < 5; index += 1) completeRecord();
  assert.equal(setItemCount, 0, "records should wait for the coalesced flush");
  flushAiRequestLedger();
  assert.equal(setItemCount, 1, "a burst should perform one full-table persistence");

  reset();
  const first = completeRecord();
  flushAiRequestLedger();
  const second = completeRecord();
  const external = makeEnvelope("tab-c", Date.now());
  storage.set(AI_REQUEST_LEDGER_KEY, JSON.stringify([first, external]));
  flushAiRequestLedger();
  const mergedIds = JSON.parse(storage.get(AI_REQUEST_LEDGER_KEY) || "[]").map((record: AiRequestEnvelope) => record.requestId);
  assert.deepEqual(new Set(mergedIds), new Set([first.requestId, second.requestId, external.requestId]));

  reset();
  const now = 2_000_000_000_000;
  const oldRecord = makeEnvelope("old", now - (AI_REQUEST_LEDGER_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
  const freshRecord = makeEnvelope("fresh", now);
  recordAiRequest(oldRecord);
  recordAiRequest(freshRecord);
  flushAiRequestLedger(now);
  const retained = loadAiRequestLedger(now);
  assert.deepEqual(retained.map((record) => record.requestId), [freshRecord.requestId]);

  reset();
  for (let index = 0; index < AI_REQUEST_LEDGER_MAX_RECORDS + 1; index += 1) {
    recordAiRequest(makeEnvelope(`bounded-${index}`, now + index));
  }
  flushAiRequestLedger(now + AI_REQUEST_LEDGER_MAX_RECORDS + 1);
  const bounded = loadAiRequestLedger(now + AI_REQUEST_LEDGER_MAX_RECORDS + 1);
  assert.equal(bounded.length, AI_REQUEST_LEDGER_MAX_RECORDS);
  assert.equal(bounded[0].requestId, "bounded-1");

  reset();
  const sensitiveReason = "prompt body with API key secret-key Authorization: Bearer token and a very long payload".repeat(20);
  const reasonSession = createAiRequestLedgerSession({
    purpose: "chat_reply",
    retryReasons: [sensitiveReason],
    fallbackReasons: [sensitiveReason],
  });
  reasonSession.markRetry(sensitiveReason);
  reasonSession.markFallback(sensitiveReason);
  const safeReasonRecord = reasonSession.complete({ succeeded: false, error: { kind: "network" } });
  flushAiRequestLedger();
  const persisted = storage.get(AI_REQUEST_LEDGER_KEY) || "";
  assert.doesNotMatch(persisted, /prompt body|secret-key|Authorization|Bearer token/);
  assert.deepEqual(safeReasonRecord.retryReasons, ["unknown_retry", "unknown_retry"]);
  assert.deepEqual(safeReasonRecord.fallbackReasons, ["unknown_fallback", "unknown_fallback"]);

  reset();
  globalThis.fetch = (async () => Response.json({ text: "不应持久化正文" })) as typeof fetch;
  const apiResult = await apiChat({ message: "private prompt body", history: [], apiKey: "private-key", model: "test-model" });
  flushAiRequestLedger();
  assert.equal(apiResult.text, "不应持久化正文");
  const apiPersisted = storage.get(AI_REQUEST_LEDGER_KEY) || "";
  assert.doesNotMatch(apiPersisted, /private prompt body|private-key|Authorization/);

  console.log("PASS AI request ledger persistence: unavailable/quota/write isolation, coalesced flush, merge, retention, bounds, and safe reasons");
} finally {
  globalThis.fetch = originalFetch;
  (globalThis as { window?: unknown }).window = originalWindow;
}
