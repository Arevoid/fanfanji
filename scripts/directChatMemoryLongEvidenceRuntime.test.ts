import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AI_REQUEST_LEDGER_KEY,
  clearInMemoryAiRequestLedgerForTests,
  recordAiRequest,
  type AiRequestEnvelope,
} from "../src/core/monitoring/aiRequestLedger";
import {
  clearDirectChatMemoryLongEvidenceCollector,
  configureDirectChatMemoryLongEvidenceCollector,
  getDirectChatMemoryLongEvidenceRecords,
  getDirectChatMemoryLongEvidenceSummary,
  isDirectChatMemoryLongEvidenceCollectorEnabled,
  startDirectChatMemoryLongEvidenceWindow,
} from "../src/features/chat/services/directChatMemoryLongEvidenceCollector";
import {
  observeDirectChatMemoryLongEvidenceRuntime,
  readDirectChatMemoryCanonicalReadback,
  type DirectChatMemoryCanonicalReadback,
} from "../src/features/chat/services/directChatMemoryLongEvidenceRuntime";
import { observeDirectChatMemoryAdmissionShadow } from "../src/features/chat/services/directChatMemoryAdmissionShadow";
import { storageKeys } from "../src/core/storage/storageKeys";
import {
  clearDirectChatMemoryEvidenceTrace,
  getDirectChatMemoryEvidenceTrace,
} from "../src/features/chat/services/directChatMemoryEvidenceTrace";

const extractionHookSource = readFileSync(new URL("../src/features/chat/hooks/useChatMemoryExtraction.ts", import.meta.url), "utf8");
assert.match(extractionHookSource, /isDirectChatMemoryLongEvidenceCollectorEnabled/);
assert.match(extractionHookSource, /manualMessagesOverride === undefined/);
assert.match(extractionHookSource, /runOptions\.automatic/);
assert.match(extractionHookSource, /!activeCharacter\.isGroupChat/);
assert.match(extractionHookSource, /apiExtractMemoriesWithModelFallback\(/);
assert.match(extractionHookSource, /logicalActionId/);
assert.match(extractionHookSource, /observeDirectChatMemoryLongEvidenceRuntime/);
assert.match(extractionHookSource, /const admissionObservationEnabled =/);
assert.match(extractionHookSource, /\|\| longEvidenceEnabled;/);
assert.match(extractionHookSource, /if \(admissionObservationEnabled\)/);
assert.match(extractionHookSource, /recordDirectChatMemoryEvidenceTrace/);
assert.match(extractionHookSource, /observerGateReason/);

const originalWindow = (globalThis as { window?: unknown }).window;
const storage = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  },
};

const scope = {
  characterId: "character-runtime",
  relationId: "relation-runtime",
  userIdentityId: "identity-runtime",
  conversationId: "conversation-runtime",
};

const readback = (overrides: Partial<DirectChatMemoryCanonicalReadback> = {}): DirectChatMemoryCanonicalReadback => ({
  activeClaimIds: [],
  activeSummaryClaimIds: [],
  projectionCanonicalRefs: [],
  legacyMemoryClaimIds: [],
  activeClaimCount: 0,
  activeSummaryCount: 0,
  projectionCount: 0,
  legacyMemoryCount: 0,
  ...overrides,
});

const claim = (id: string, overrides: Record<string, unknown> = {}) => ({
  ...scope,
  id,
  kind: "plan",
  subject: "user",
  statement: `private statement ${id}`,
  truthStatus: "asserted",
  temporalStatus: "future",
  source: {
    kind: "user_message",
    authorship: "user",
    messageIds: ["message"],
    producer: "test",
    evidenceKey: `evidence-${id}`,
  },
  confidence: 0.9,
  userConfirmed: false,
  recordedAt: Date.now(),
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
  ...overrides,
});

const bridgeObservation = (overrides: Record<string, unknown> = {}) => ({
  bridgeCorrelation: "exact",
  lineageStatus: "shared",
  pairUnique: true,
  legacyAccepted: true,
  legacyWriteEligibility: "canonical_write",
  legacyProvenanceTrusted: true,
  v2ProvenanceTrusted: true,
  bridgeState: "write_proposal",
  bridgeReason: "no_veto",
  legacySemanticKind: "plan",
  v2SemanticKind: "plan",
  legacyAuthorityClass: "objective",
  v2AuthorityClass: "objective",
  legacyPolicySource: "legacy_policy_derived",
  v2MetadataSource: "v2_model_native",
  wouldWriteProposal: true,
  wouldSafetyVeto: false,
  wouldPassthrough: true,
  wouldReview: false,
  wouldReject: false,
  wouldRoute: false,
  scopeMismatch: false,
  provenancePresent: true,
  scopeExact: true,
  conflictAnatomy: {
    v2: { semanticKind: "plan", planLifecycle: "active" },
  },
  legacyIdentity: { scopeExact: true },
  v2Identity: { scopeExact: true },
  ...overrides,
});

const shadow = (observation = bridgeObservation(), failedOpen = false) => ({
  failedOpen,
  observations: [],
  bridgeShadow: {
    failedOpen,
    metrics: {},
    observations: [observation],
    pairCandidateMatrix: [],
  },
} as any);

const extraction = {
  extractedMemories: [],
  acceptedClaims: [],
  rejectedCandidateCount: 0,
} as any;

const canonicalInput = (overrides: Partial<Parameters<typeof observeDirectChatMemoryLongEvidenceRuntime>[0]> = {}) => ({
  scope,
  extraction,
  admissionShadow: shadow(),
  acceptedClaimsBefore: [],
  filteredAcceptedClaims: [],
  canonicalBefore: readback(),
  canonicalAfter: readback(),
  canonicalWriteSucceeded: true,
  cursorAdvanced: true,
  logicalActionId: "runtime-logical-action",
  ...overrides,
});

function envelope(requestId: string, logicalActionId?: string, attempts = 1): AiRequestEnvelope {
  return {
    requestId,
    ...(logicalActionId ? { logicalActionId } : {}),
    purpose: "memory_extract",
    provider: "test-provider",
    model: "test-model",
    endpoint: "/api/extract-memories",
    transport: "backend_proxy",
    startedAt: Date.now(),
    durationMs: 1,
    status: "success",
    errorCategory: "none",
    providerRequestCount: attempts,
    retryCount: 0,
    retryReasons: [],
    fallbackCount: attempts > 1 ? 1 : 0,
    fallbackReasons: attempts > 1 ? ["backend_network"] : [],
    uncertainDelivery: false,
    recordedAt: Date.now(),
  };
}

function reset(): void {
  storage.clear();
  clearInMemoryAiRequestLedgerForTests();
  clearDirectChatMemoryLongEvidenceCollector();
  configureDirectChatMemoryLongEvidenceCollector({ enabled: true, explicitDebug: true });
}

try {
  reset();
  const disabled = (() => {
    configureDirectChatMemoryLongEvidenceCollector({ enabled: false });
    return observeDirectChatMemoryLongEvidenceRuntime(canonicalInput());
  })();
  assert.equal((await disabled).recorded.length, 0, "disabled collector must be a no-op");
  assert.ok(getDirectChatMemoryEvidenceTrace().some((entry) =>
    entry.stage === "observer_skipped" && entry.reason === "collector_inactive"));
  reset();

  // A normal automatic batch is one logical request, one physical attempt,
  // and a control record after canonical write/cursor completion.
  recordAiRequest(envelope("request-control", "runtime-logical-action"));
  const controlClaim = claim("claim-control");
  const control = await observeDirectChatMemoryLongEvidenceRuntime(canonicalInput({
    acceptedClaimsBefore: [controlClaim as any],
    filteredAcceptedClaims: [controlClaim as any],
    canonicalAfter: readback({ activeClaimIds: [controlClaim.id], activeClaimCount: 1 }),
  }));
  assert.equal(control.accounting.providerLogicalRequestCount, 1);
  assert.equal(control.accounting.providerPhysicalAttemptCount, 1);
  assert.equal(control.recorded[0]?.classification, "VALID_CONTROL");

  // A cancelled-plan veto is valid only when the suppressed claim is absent
  // from every exact-scope canonical readback and no summary/projection mirror exists.
  reset();
  recordAiRequest(envelope("request-veto", "runtime-veto-action"));
  const vetoClaim = claim("claim-veto", { kind: "plan" });
  const vetoObservation = bridgeObservation({
    bridgeState: "safety_veto",
    bridgeReason: "cancelled_plan_not_active",
    wouldSafetyVeto: true,
    conflictAnatomy: { v2: { semanticKind: "plan", planLifecycle: "cancelled" } },
  });
  const veto = await observeDirectChatMemoryLongEvidenceRuntime(canonicalInput({
    admissionShadow: shadow(vetoObservation),
    safetyEvaluation: { records: [{ validatorResult: "allow_veto", validatorReason: "SAFETY_VETO_CANCELLED_PLAN", failOpen: false }] } as any,
    canaryResult: { records: [{ suppressed: true, failOpen: false }] } as any,
    acceptedClaimsBefore: [vetoClaim as any],
    filteredAcceptedClaims: [],
    canonicalAfter: readback(),
    logicalActionId: "runtime-veto-action",
  }));
  assert.equal(veto.recorded[0]?.classification, "VALID_ELIGIBLE_SUPPRESSION");
  assert.equal(veto.recorded[0]?.vetoedCandidateCanonicalAbsent, true);

  // Partial suppression retains surviving canonical claims and records a
  // positive write delta without changing claim objects.
  reset();
  recordAiRequest(envelope("request-partial", "runtime-partial-action"));
  const partialA = claim("claim-partial-a");
  const partialB = claim("claim-partial-b");
  const partial = await observeDirectChatMemoryLongEvidenceRuntime(canonicalInput({
    admissionShadow: shadow(vetoObservation),
    safetyEvaluation: { records: [{ validatorResult: "allow_veto", validatorReason: "SAFETY_VETO_CANCELLED_PLAN", failOpen: false }] } as any,
    canaryResult: { records: [{ suppressed: true, failOpen: false }] } as any,
    acceptedClaimsBefore: [partialA as any, partialB as any],
    filteredAcceptedClaims: [partialB as any],
    canonicalAfter: readback({ activeClaimIds: [partialB.id], activeClaimCount: 1 }),
    logicalActionId: "runtime-partial-action",
  }));
  assert.equal(partial.recorded[0]?.classification, "VALID_ELIGIBLE_SUPPRESSION");
  assert.equal(partial.recorded[0]?.batchAcceptedAfter, 1);

  // Fallback rows remain one logical action and two physical attempts; an
  // unknown/legacy row is never guessed into that group.
  reset();
  recordAiRequest(envelope("request-fallback-a", "runtime-fallback-action"));
  recordAiRequest(envelope("request-fallback-b", "runtime-fallback-action", 1));
  const fallback = await observeDirectChatMemoryLongEvidenceRuntime(canonicalInput({ logicalActionId: "runtime-fallback-action" }));
  assert.equal(fallback.accounting.providerLogicalRequestCount, 1);
  assert.equal(fallback.accounting.providerPhysicalAttemptCount, 2);
  assert.equal(fallback.accounting.accountingShape, "fallback_split_rows");
  reset();
  recordAiRequest(envelope("request-unknown"));
  const unknown = await observeDirectChatMemoryLongEvidenceRuntime(canonicalInput({ logicalActionId: "unknown-action" }));
  assert.equal(unknown.accounting.accountingShape, "unknown");

  // The automatic caller now enables the admission-observation seam whenever
  // a formal Collector is active, even if standalone Shadow/Canary telemetry
  // is disabled. A successful empty extraction therefore reaches the runtime
  // observer as a completed batch rather than disappearing at the caller.
  reset();
  recordAiRequest(envelope("request-zero", "runtime-zero-action"));
  const zeroExtraction = {
    extractedMemories: [],
    acceptedClaims: [],
    rejectedCandidateCount: 0,
    shadowCandidatesV2: [],
  } as any;
  const automaticAdmissionShadow = observeDirectChatMemoryAdmissionShadow({
    extraction: zeroExtraction,
    scope,
    lineage: { parentActionId: "runtime-zero-parent" },
    recordedAt: Date.now(),
  });
  const zero = await observeDirectChatMemoryLongEvidenceRuntime(canonicalInput({
    logicalActionId: "runtime-zero-action",
    extraction: zeroExtraction,
    admissionShadow: automaticAdmissionShadow,
    canonicalBefore: readback(),
    canonicalAfter: readback(),
    canonicalWriteSucceeded: true,
    cursorAdvanced: true,
  }));
  assert.equal(zero.recorded.length, 1);
  assert.equal(zero.recorded[0]?.classification, "ZERO_CANDIDATE_BATCH");
  assert.equal(zero.recorded[0]?.candidateCount, 0);
  assert.equal(zero.recorded[0]?.batchZeroCandidates, true);
  assert.equal(zero.recorded[0]?.canonicalWriteCountDelta, 0);

  // A callback created while the Collector is disabled must observe the
  // latest enablement when it executes after a fresh Window starts.
  reset();
  clearDirectChatMemoryEvidenceTrace();
  configureDirectChatMemoryLongEvidenceCollector({ enabled: false });
  const lateEnabledAutomaticCallback = async () => {
    if (!isDirectChatMemoryLongEvidenceCollectorEnabled()) return { recorded: [] };
    return observeDirectChatMemoryLongEvidenceRuntime(canonicalInput({
      logicalActionId: "late-enabled-action",
      extraction: zeroExtraction,
      admissionShadow: automaticAdmissionShadow,
    }));
  };
  configureDirectChatMemoryLongEvidenceCollector({ enabled: true, explicitDebug: true });
  assert.equal(startDirectChatMemoryLongEvidenceWindow("window-late-enable-9f23a1b7c4d8e650"), 1);
  recordAiRequest(envelope("late-enabled-request", "late-enabled-action"));
  const lateEnabled = await lateEnabledAutomaticCallback();
  assert.equal(lateEnabled.recorded.length, 1);
  assert.equal(lateEnabled.recorded[0]?.classification, "ZERO_CANDIDATE_BATCH");
  assert.ok(getDirectChatMemoryEvidenceTrace().some((entry) => entry.stage === "observer_entered"));

  // The fallback-shaped zero-candidate result keeps one logical action and
  // two physical attempts while still producing one batch-level record.
  reset();
  startDirectChatMemoryLongEvidenceWindow("window-fallback-zero-9f23a1b7c4d8e650");
  recordAiRequest(envelope("fallback-zero-default", "fallback-zero-action"));
  recordAiRequest(envelope("fallback-zero-selected", "fallback-zero-action"));
  const fallbackZero = await observeDirectChatMemoryLongEvidenceRuntime(canonicalInput({
    logicalActionId: "fallback-zero-action",
    extraction: zeroExtraction,
    admissionShadow: automaticAdmissionShadow,
  }));
  assert.equal(fallbackZero.recorded.length, 1);
  assert.equal(fallbackZero.recorded[0]?.classification, "ZERO_CANDIDATE_BATCH");
  assert.equal(fallbackZero.accounting.providerLogicalRequestCount, 1);
  assert.equal(fallbackZero.accounting.providerPhysicalAttemptCount, 2);
  assert.equal(getDirectChatMemoryLongEvidenceSummary().zeroCandidateBatchCount, 1);

  // Scope mismatch is metadata-only and cannot become valid suppression.
  reset();
  const crossScope = await observeDirectChatMemoryLongEvidenceRuntime(canonicalInput({
    admissionShadow: shadow(bridgeObservation({
      bridgeCorrelation: "conflict",
      bridgeReason: "scope_mismatch",
      v2Identity: { scopeExact: false },
    })),
    acceptedClaimsBefore: [claim("claim-cross") as any],
    filteredAcceptedClaims: [],
  }));
  assert.equal(crossScope.recorded[0]?.correlationClass, "cross_scope");
  assert.notEqual(crossScope.recorded[0]?.classification, "VALID_ELIGIBLE_SUPPRESSION");

  // A V2-only candidate with a runtime-valid scope is missing its legacy
  // counterpart, not proven to belong to another scope. It remains review /
  // invalid evidence and must not be promoted or counted as a safety incident
  // merely because this batch also wrote other accepted claims.
  reset();
  recordAiRequest(envelope("request-v2-only", "runtime-v2-only-action"));
  const v2Only = await observeDirectChatMemoryLongEvidenceRuntime(canonicalInput({
    admissionShadow: shadow(bridgeObservation({
      bridgeCorrelation: "unmatched_v2",
      lineageStatus: "partial",
      pairUnique: false,
      legacyAccepted: false,
      legacyWriteEligibility: "unknown",
      legacyProvenanceTrusted: false,
      v2ProvenanceTrusted: true,
      bridgeState: "review",
      bridgeReason: "v2_only_not_write_enabled",
      legacyIdentity: undefined,
      v2Identity: { scopeExact: true },
    })),
    acceptedClaimsBefore: [claim("claim-survivor") as any],
    filteredAcceptedClaims: [claim("claim-survivor") as any],
    canonicalAfter: readback({ activeClaimIds: ["claim-survivor"], activeClaimCount: 1 }),
    logicalActionId: "runtime-v2-only-action",
  }));
  assert.equal(v2Only.recorded[0]?.correlationClass, "unknown");
  assert.equal(v2Only.recorded[0]?.exactScope, false);
  assert.equal(v2Only.recorded[0]?.provenanceTrusted, false);
  assert.equal(v2Only.recorded[0]?.classification, "INVALID_SAMPLE");
  assert.equal(getDirectChatMemoryLongEvidenceSummary().safetyIncidentCount, 0);

  // Readback uses exact scope for claims/summaries and does not leak source text.
  storage.set(storageKeys.characterKnowledgeClaims, JSON.stringify([
    claim("claim-exact"),
    claim("claim-other", { relationId: "other-relation" }),
  ]));
  storage.set(storageKeys.conversationSummaries, JSON.stringify([
    {
      id: "summary-exact", ...scope, summary: "private summary", sourceMessageIds: ["message"], sourceClaimIds: ["claim-exact"],
      generatedAt: Date.now(), generator: "test", projectionVersion: 1, status: "active", schemaVersion: 1,
    },
  ]));
  const exactReadback = await readDirectChatMemoryCanonicalReadback(scope);
  assert.deepEqual(exactReadback.activeClaimIds, ["claim-exact"]);
  assert.deepEqual(exactReadback.activeSummaryClaimIds, ["claim-exact"]);

  const exported = JSON.stringify(getDirectChatMemoryLongEvidenceRecords());
  assert.doesNotMatch(exported, /private statement|private summary|api[_ -]?key|authorization|"prompt"\s*:|"response"\s*:/i);
  assert.ok(getDirectChatMemoryLongEvidenceRecords().every((record) => record.promptDelta === 0 && record.canaryProviderDelta === 0));
  console.log("PASS direct-chat long-evidence runtime seam: disabled guard, exact readback, control/veto/partial classification, and explicit accounting");
} finally {
  configureDirectChatMemoryLongEvidenceCollector({ enabled: false });
  clearDirectChatMemoryLongEvidenceCollector();
  (globalThis as { window?: unknown }).window = originalWindow;
}
