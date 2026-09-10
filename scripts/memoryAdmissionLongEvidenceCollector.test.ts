import assert from "node:assert/strict";
import {
  classifyLongEvidenceRecord,
  clearDirectChatMemoryLongEvidenceCollector,
  configureDirectChatMemoryLongEvidenceCollector,
  deriveLongEvidenceAccounting,
  exportDirectChatMemoryLongEvidenceJson,
  getDirectChatMemoryLongEvidenceRecords,
  getDirectChatMemoryLongEvidenceSummary,
  recordDirectChatMemoryLongEvidence,
  type DirectChatMemoryLongEvidenceInput,
} from "../src/features/chat/services/directChatMemoryLongEvidenceCollector";
import type { AiRequestEnvelope } from "../src/core/monitoring/aiRequestLedger";

const scope = {
  characterId: "character-secret-id",
  relationId: "relation-secret-id",
  userIdentityId: "user-secret-id",
  conversationId: "conversation-secret-id",
};

const suppressionCandidate = {
  featureScope: "automatic_direct_chat",
  canaryReason: "SAFETY_VETO_CANCELLED_PLAN",
  validatorResult: "allow_veto",
  validatorReason: "SAFETY_VETO_CANCELLED_PLAN",
  bridgeState: "safety_veto",
  bridgeReason: "cancelled_plan_not_active",
  correlationClass: "shared_unique",
  lineageStatus: "shared",
  pairUnique: true,
  exactScope: true,
  provenanceTrusted: true,
  metadataSource: "v2_model_native",
  semanticKind: "plan",
  planLifecycle: "cancelled",
  legacyAccepted: true,
  legacyWriteEligible: true,
  candidateSuppressed: true,
  vetoedCandidateCanonicalAbsent: true,
  failOpen: false,
};

const allVetoBatch = {
  batchAcceptedBefore: 1,
  batchAcceptedAfter: 0,
  batchZeroCandidates: true,
  survivingCanonicalWritesExpected: false,
  survivingCanonicalWritesObserved: true,
  cursorAdvanced: true,
  canonicalWriteCountDelta: 0,
  summaryDelta: 0,
  projectionDelta: 0,
};

const baseAccounting = {
  providerLogicalRequestCount: 1,
  providerPhysicalAttemptCount: 1,
  accountingShape: "single_row" as const,
  promptDelta: 0,
  canaryProviderDelta: 0,
};

const basePerformance = {
  extractionLatencyBucket: "0_5s" as const,
  canaryFilteringLatencyBucket: "0_10ms" as const,
  privacyStatus: "metadata_only" as const,
};

function input(overrides: Partial<DirectChatMemoryLongEvidenceInput> = {}): DirectChatMemoryLongEvidenceInput {
  return {
    scope: { ...scope },
    candidate: { ...suppressionCandidate },
    batch: { ...allVetoBatch },
    accounting: { ...baseAccounting },
    performance: { ...basePerformance },
    ...overrides,
  };
}

function envelope(requestId: string, logicalActionId?: string, providerRequestCount = 1): AiRequestEnvelope {
  const now = Date.now();
  return {
    requestId,
    ...(logicalActionId ? { logicalActionId } : {}),
    purpose: "memory_extract",
    transport: "backend_proxy",
    startedAt: now,
    durationMs: 10,
    status: "success",
    errorCategory: "none",
    providerRequestCount,
    retryCount: 0,
    retryReasons: [],
    fallbackCount: 0,
    fallbackReasons: [],
    uncertainDelivery: false,
    recordedAt: now,
  };
}

const originalFetch = globalThis.fetch;
try {
  // Default OFF and production auto-enable impossible: test-only explicitDebug is required.
  configureDirectChatMemoryLongEvidenceCollector({ enabled: false });
  clearDirectChatMemoryLongEvidenceCollector();
  assert.equal(recordDirectChatMemoryLongEvidence(input()), null);
  configureDirectChatMemoryLongEvidenceCollector({ enabled: true });
  assert.equal(recordDirectChatMemoryLongEvidence(input()), null);

  // An explicit enable starts a fresh evidence session and stable scope token.
  configureDirectChatMemoryLongEvidenceCollector({ enabled: true, explicitDebug: true });
  const first = recordDirectChatMemoryLongEvidence(input());
  assert.ok(first);
  assert.equal(first.scopeFingerprint, recordDirectChatMemoryLongEvidence(input())?.scopeFingerprint);
  const firstOrdinal = first.sessionOrdinal;
  clearDirectChatMemoryLongEvidenceCollector();
  assert.equal(getDirectChatMemoryLongEvidenceSummary().recordCount, 0);
  assert.equal(getDirectChatMemoryLongEvidenceSummary().sessionOrdinal, firstOrdinal);
  const differentScope = recordDirectChatMemoryLongEvidence(input({
    scope: { ...scope, conversationId: "conversation-other" },
  }));
  assert.ok(differentScope);
  assert.notEqual(first.scopeFingerprint, differentScope.scopeFingerprint);
  configureDirectChatMemoryLongEvidenceCollector({ enabled: true, explicitDebug: true });
  const fresh = recordDirectChatMemoryLongEvidence(input());
  assert.ok(fresh);
  assert.equal(fresh.sessionOrdinal, firstOrdinal + 1);
  assert.notEqual(fresh.scopeFingerprint, first.scopeFingerprint, "a new session uses a fresh local salt");

  // The ring buffer is bounded to the latest 100 records.
  clearDirectChatMemoryLongEvidenceCollector();
  for (let index = 0; index < 105; index += 1) recordDirectChatMemoryLongEvidence(input());
  assert.equal(getDirectChatMemoryLongEvidenceRecords().length, 100);

  // Candidate-local suppression: both all-veto and partial batches are valid.
  clearDirectChatMemoryLongEvidenceCollector();
  const allVeto = recordDirectChatMemoryLongEvidence(input());
  assert.equal(allVeto?.classification, "VALID_ELIGIBLE_SUPPRESSION");
  const partial = recordDirectChatMemoryLongEvidence(input({
    batch: {
      ...allVetoBatch,
      batchAcceptedBefore: 2,
      batchAcceptedAfter: 1,
      batchZeroCandidates: false,
      survivingCanonicalWritesExpected: true,
      survivingCanonicalWritesObserved: true,
      canonicalWriteCountDelta: 1,
      summaryDelta: 1,
      projectionDelta: 1,
    },
  }));
  assert.equal(partial?.classification, "VALID_ELIGIBLE_SUPPRESSION");

  // A normal durable legacy candidate is a valid control, not a preference-only case.
  const control = recordDirectChatMemoryLongEvidence(input({
    candidate: {
      ...suppressionCandidate,
      canaryReason: "none",
      validatorResult: "deny_veto",
      validatorReason: "predicate_disabled",
      bridgeState: "legacy_passthrough",
      bridgeReason: "no_veto",
      semanticKind: "preference",
      planLifecycle: "not_applicable",
      candidateSuppressed: false,
      vetoedCandidateCanonicalAbsent: true,
    },
    batch: {
      ...allVetoBatch,
      batchAcceptedAfter: 1,
      batchZeroCandidates: false,
      survivingCanonicalWritesExpected: true,
      survivingCanonicalWritesObserved: true,
      canonicalWriteCountDelta: 1,
      summaryDelta: 1,
      projectionDelta: 1,
    },
  }));
  assert.equal(control?.classification, "VALID_CONTROL");

  const failOpen = recordDirectChatMemoryLongEvidence(input({
    candidate: { ...suppressionCandidate, failOpen: true },
  }));
  assert.equal(failOpen?.classification, "FAIL_OPEN_OBSERVATION");
  const invalid = recordDirectChatMemoryLongEvidence(input({
    candidate: { ...suppressionCandidate, metadataSource: "legacy_derived" },
  }));
  assert.equal(invalid?.classification, "INVALID_SAMPLE");
  const safety = recordDirectChatMemoryLongEvidence(input({
    candidate: { ...suppressionCandidate, vetoedCandidateCanonicalAbsent: false },
  }));
  assert.equal(safety?.classification, "SAFETY_INCIDENT");
  const privacyIncident = recordDirectChatMemoryLongEvidence(input({
    performance: { ...basePerformance, privacyStatus: "violation" },
  }));
  assert.equal(privacyIncident?.classification, "SAFETY_INCIDENT");

  // Runtime v2_model_native is the only authoritative suppression source; mixed/legacy are retained but do not count.
  assert.equal(classifyLongEvidenceRecord(invalid!), "INVALID_SAMPLE");
  const mixed = recordDirectChatMemoryLongEvidence(input({
    candidate: { ...suppressionCandidate, metadataSource: "mixed" },
  }));
  assert.equal(mixed?.classification, "INVALID_SAMPLE");

  // Stage 11J accounting: linked fallback rows are one logical action and two physical attempts.
  const linked = deriveLongEvidenceAccounting([
    envelope("request-primary", "logical-fallback"),
    envelope("request-fallback", "logical-fallback"),
  ]);
  assert.deepEqual(linked, {
    providerLogicalRequestCount: 1,
    providerPhysicalAttemptCount: 2,
    accountingShape: "fallback_split_rows",
    promptDelta: 0,
    canaryProviderDelta: 0,
  });
  const normal = deriveLongEvidenceAccounting([envelope("request-normal", "logical-normal")]);
  assert.equal(normal.providerLogicalRequestCount, 1);
  assert.equal(normal.providerPhysicalAttemptCount, 1);
  assert.equal(normal.accountingShape, "single_row");
  const unknown = deriveLongEvidenceAccounting([envelope("legacy-request")]);
  assert.equal(unknown.providerLogicalRequestCount, 0);
  assert.equal(unknown.accountingShape, "unknown");

  // The collector is observation-only: malformed input is swallowed and no Provider is called.
  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    return Response.json({});
  }) as typeof fetch;
  const acceptedClaims = [{ statement: "legacy claim" }];
  const filteredAcceptedClaims = acceptedClaims.slice();
  const beforeAccepted = JSON.stringify(acceptedClaims);
  const beforeFiltered = JSON.stringify(filteredAcceptedClaims);
  assert.doesNotThrow(() => recordDirectChatMemoryLongEvidence(null as unknown as DirectChatMemoryLongEvidenceInput));
  assert.equal(JSON.stringify(acceptedClaims), beforeAccepted);
  assert.equal(JSON.stringify(filteredAcceptedClaims), beforeFiltered);
  assert.equal(providerCalls, 0);
  assert.equal(recordDirectChatMemoryLongEvidence(input({
    candidate: { ...suppressionCandidate, featureScope: "group_chat" },
  }))?.classification, "INVALID_SAMPLE");

  // Export is bounded, classified, and reviewer-safe.
  const exported = exportDirectChatMemoryLongEvidenceJson();
  assert.doesNotMatch(exported, /character-secret-id|relation-secret-id|user-secret-id|conversation-secret-id/);
  assert.doesNotMatch(exported, /legacy claim|raw statement|api[_ -]?key|authorization header|"prompt"\s*:|"response"\s*:/i);
  const parsed = JSON.parse(exported) as ReturnType<typeof getDirectChatMemoryLongEvidenceSummary> & { records: unknown[] };
  assert.equal(parsed.persistenceMode, "in_memory_only");
  assert.equal(parsed.recordCount, getDirectChatMemoryLongEvidenceRecords().length);
  assert.ok(parsed.recordCount <= 100);
  assert.ok(parsed.countsByClassification.VALID_ELIGIBLE_SUPPRESSION >= 1);
  assert.equal(parsed.logicalActionTotal >= 0, true);
  assert.equal(parsed.unknownGroupingCount >= 0, true);

  console.log("PASS memory admission long-evidence collector: bounded, metadata-only classification, scope privacy, controls, and explicit AI accounting");
} finally {
  globalThis.fetch = originalFetch;
  configureDirectChatMemoryLongEvidenceCollector({ enabled: false });
  clearDirectChatMemoryLongEvidenceCollector();
}
