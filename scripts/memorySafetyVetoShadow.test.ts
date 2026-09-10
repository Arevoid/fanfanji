import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DirectChatMemoryBridgeShadowObservation } from "../src/features/chat/services/directChatMemoryAdmissionBridgeShadow";
import type {
  DirectChatSafetyVetoCorrelationInput,
  DirectChatSafetyVetoInput,
} from "../src/features/chat/services/directChatMemorySafetyVetoValidator";
import {
  validateDirectChatSafetyVeto,
  APPROVED_DIRECT_CHAT_SAFETY_VETO_REASONS,
} from "../src/features/chat/services/directChatMemorySafetyVetoValidator";
import {
  clearDirectChatMemorySafetyVetoShadow,
  configureDirectChatMemorySafetyVetoShadow,
  evaluateDirectChatSafetyVetoShadow,
  exportDirectChatMemorySafetyVetoShadowJson,
  getDirectChatMemorySafetyVetoShadowRecords,
} from "../src/features/chat/services/directChatMemorySafetyVetoShadow";
import { commitMemoryWriteBundle } from "../src/domain/memory/memoryWriteCoordinator";

const baseInput: DirectChatSafetyVetoInput = {
  featureScope: "automatic_direct_chat",
  legacy: {
    accepted: true,
    semanticKind: "plan",
    writeEligibility: "canonical_write",
  },
  v2: {
    semanticKind: "plan",
    planLifecycle: "cancelled",
    metadataSource: "v2_model_native",
  },
  bridgeState: "safety_veto",
  bridgeReason: "cancelled_plan_not_active",
  correlationState: "conflict",
  correlation: {
    lineageStatus: "shared",
    sameExtractionOperation: true,
    pairUnique: true,
    ambiguous: false,
    duplicate: false,
    staleOperation: false,
  },
  exactScope: true,
  trustedProvenance: true,
};

type InputOverrides = Omit<Partial<DirectChatSafetyVetoInput>, "legacy" | "v2" | "correlation">
  & {
    legacy?: Partial<NonNullable<DirectChatSafetyVetoInput["legacy"]>> | undefined;
    v2?: Partial<NonNullable<DirectChatSafetyVetoInput["v2"]>> | undefined;
    correlation?: Partial<DirectChatSafetyVetoCorrelationInput>;
  };

function input(overrides: InputOverrides = {}): DirectChatSafetyVetoInput {
  return {
    ...baseInput,
    ...overrides,
    legacy: Object.prototype.hasOwnProperty.call(overrides, "legacy")
      ? overrides.legacy === undefined ? undefined : { ...baseInput.legacy!, ...overrides.legacy }
      : { ...baseInput.legacy! },
    v2: Object.prototype.hasOwnProperty.call(overrides, "v2")
      ? overrides.v2 === undefined ? undefined : { ...baseInput.v2!, ...overrides.v2 }
      : { ...baseInput.v2! },
    correlation: { ...baseInput.correlation, ...(overrides.correlation || {}) },
  };
}

function assertResult(
  actual: ReturnType<typeof validateDirectChatSafetyVeto>,
  result: "allow_veto" | "deny_veto" | "insufficient",
  reason?: string,
): void {
  assert.equal(actual.result, result);
  if (reason) assert.equal(actual.reason, reason);
}

// 1. Cancelled plan is the first evidence-backed predicate.
assertResult(validateDirectChatSafetyVeto(input()), "allow_veto", "SAFETY_VETO_CANCELLED_PLAN");

// 2. Temporary preference is the second evidence-backed predicate.
assertResult(validateDirectChatSafetyVeto(input({
  legacy: { semanticKind: "preference" },
  v2: { semanticKind: "preference", durability: "temporary", planLifecycle: undefined },
  bridgeReason: "temporary_preference_not_durable",
}),), "allow_veto", "SAFETY_VETO_TEMPORARY_PREFERENCE");

// 3–5. Unknown, active, and completed policies never become vetoes.
assertResult(validateDirectChatSafetyVeto(input({
  legacy: { semanticKind: "preference" },
  v2: { semanticKind: "preference", durability: "unknown" },
  bridgeReason: "temporary_preference_not_durable",
}),), "deny_veto", "temporary_preference_predicate_failed");
assertResult(validateDirectChatSafetyVeto(input({
  v2: { planLifecycle: "active" },
}),), "deny_veto", "cancelled_plan_predicate_failed");
assertResult(validateDirectChatSafetyVeto(input({
  v2: { planLifecycle: "completed" },
  bridgeReason: "completed_plan_not_active",
}),), "deny_veto", "predicate_disabled");

// 6–7. V2-only and legacy-rejected candidates cannot gain write authority.
assertResult(validateDirectChatSafetyVeto(input({ legacy: undefined })), "deny_veto", "legacy_or_v2_candidate_missing");
assertResult(validateDirectChatSafetyVeto(input({ legacy: { accepted: false } })), "deny_veto", "legacy_rejected");

// 8–11. Identity uncertainty is insufficient and therefore fail-open.
assertResult(validateDirectChatSafetyVeto(input({ correlation: { ambiguous: true } })), "insufficient", "correlation_not_reliable");
assertResult(validateDirectChatSafetyVeto(input({ trustedProvenance: false })), "insufficient", "provenance_not_trusted");
assertResult(validateDirectChatSafetyVeto(input({ exactScope: false })), "insufficient", "scope_not_exact");
assertResult(validateDirectChatSafetyVeto(input({ correlation: { duplicate: true } })), "insufficient", "correlation_not_reliable");

// 12–15. Feature scope is deliberately restricted to automatic Direct Chat.
for (const featureScope of ["other", "group", "offline", "manual"] as const) {
  assertResult(validateDirectChatSafetyVeto(input({ featureScope })), "deny_veto", "feature_scope_not_eligible");
}

// 16. Asserted/non-objective legacy input cannot be upgraded by V2 metadata.
assertResult(validateDirectChatSafetyVeto(input({
  legacy: { semanticKind: "fact" },
  v2: { semanticKind: "fact", durability: "stable" },
  bridgeReason: "authority_conflict",
}),), "deny_veto", "reason_not_allowlisted");

// 17–19. Relationship, scene, and other disabled semantics are not allowlisted.
for (const semanticKind of ["relationship_signal", "scene_only", "subjective_reflection", "event", "episodic"] as const) {
  assertResult(validateDirectChatSafetyVeto(input({
    legacy: { semanticKind: "fact" },
    v2: { semanticKind },
    bridgeReason: "scene_only_not_truth",
  })), "deny_veto", "reason_not_allowlisted");
}

// 20. A validator/shadow failure is represented as fail-open, not a throw.
assertResult(validateDirectChatSafetyVeto(input({
  correlation: { lineageStatus: "partial", sameExtractionOperation: false },
}),), "insufficient", "correlation_not_reliable");

// Additional regression coverage required by the Stage 11D contract.
assertResult(validateDirectChatSafetyVeto(input({ correlation: { lineageStatus: "partial" } })), "insufficient", "correlation_not_reliable");
assertResult(validateDirectChatSafetyVeto(input({ correlation: { staleOperation: true } })), "insufficient", "correlation_not_reliable");
assertResult(validateDirectChatSafetyVeto(input({ correlation: { sameExtractionOperation: false } })), "insufficient", "correlation_not_reliable");
assertResult(validateDirectChatSafetyVeto(input({ bridgeState: "review", correlationState: "exact", bridgeReason: "cancelled_plan_not_active" })), "deny_veto", "bridge_not_safety_veto");
assertResult(validateDirectChatSafetyVeto(input({ bridgeReason: "new_future_reason" })), "deny_veto", "reason_not_allowlisted");
assertResult(validateDirectChatSafetyVeto(input({
  legacy: { semanticKind: "preference" },
  v2: { semanticKind: "preference", durability: "stable" },
  bridgeReason: "temporary_preference_not_durable",
})), "deny_veto", "temporary_preference_predicate_failed");
assertResult(validateDirectChatSafetyVeto(input({
  legacy: { semanticKind: "plan" },
  v2: { semanticKind: "plan", planLifecycle: "uncertain" },
})), "deny_veto", "cancelled_plan_predicate_failed");
assertResult(validateDirectChatSafetyVeto(input({ v2: { semanticKind: "event" } })), "deny_veto", "cancelled_plan_semantic_mismatch");
assertResult(validateDirectChatSafetyVeto(input({ v2: { metadataSource: "unknown" } })), "insufficient", "v2_metadata_not_trusted");
assert.equal(APPROVED_DIRECT_CHAT_SAFETY_VETO_REASONS.length, 2);

const throwingInput = {
  get featureScope(): never {
    throw new Error("synthetic validator failure");
  },
} as unknown as DirectChatSafetyVetoInput;
assertResult(validateDirectChatSafetyVeto(throwingInput), "insufficient", "validator_error_fail_open");

function identity(): DirectChatMemoryBridgeShadowObservation["legacyIdentity"] {
  return {
    sourceWindowPresent: true,
    scopeExact: true,
    semanticCompatible: true,
    actorPresent: true,
    targetPresent: true,
    producerNormalized: true,
    sourceTypePresent: true,
    evidenceKeyPresent: true,
    temporalPresent: true,
    lineagePresent: true,
    scopeFingerprint: "scope-fp",
    semanticClass: "plan",
    producerClass: "direct_chat",
    sourceTypeClass: "user_message",
    temporalStatus: "future",
    actorTargetShape: "both",
  };
}

function bridgeObservation(overrides: Partial<DirectChatMemoryBridgeShadowObservation> = {}): DirectChatMemoryBridgeShadowObservation {
  const legacySemanticKind = overrides.legacySemanticKind || "plan";
  const v2SemanticKind = overrides.v2SemanticKind || legacySemanticKind;
  return {
    bridgeCorrelation: "conflict",
    lineageStatus: "shared",
    pairUnique: true,
    bridgeState: "safety_veto",
    bridgeReason: "cancelled_plan_not_active",
    legacySemanticKind,
    v2SemanticKind,
    legacyAuthorityClass: "future_plan",
    v2AuthorityClass: "future_plan",
    legacyPolicySource: "legacy_claim_semantics",
    v2MetadataSource: "v2_model_native",
    wouldWriteProposal: false,
    wouldSafetyVeto: true,
    wouldPassthrough: false,
    wouldReview: false,
    wouldReject: false,
    wouldRoute: false,
    legacyIdentity: identity(),
    v2Identity: identity(),
    legacyAccepted: true,
    legacyWriteEligibility: "canonical_write",
    legacyProvenanceTrusted: true,
    v2ProvenanceTrusted: true,
    conflictAnatomy: {
      legacy: {
        semanticKind: legacySemanticKind,
        claimKind: legacySemanticKind === "plan" ? "plan" : "preference",
        truthStatus: "asserted",
        temporalStatus: "future",
        epistemicProjection: "uncertain",
        durabilityProjection: "unknown",
        planLifecycleProjection: "active",
        resolvedAuthorityRole: "durable_candidate",
        metadataSource: "legacy_claim_semantics",
        actorTargetShape: "both",
      },
      v2: {
        candidateKind: legacySemanticKind === "preference" ? "fact" : legacySemanticKind as "plan",
        semanticFacet: legacySemanticKind === "preference" ? "preference" : undefined,
        semanticKind: v2SemanticKind,
        epistemicStatus: "unknown",
        durability: legacySemanticKind === "preference" ? "temporary" : "unknown",
        planLifecycle: legacySemanticKind === "plan" ? "cancelled" : "unknown",
        resolvedAuthorityRole: legacySemanticKind === "preference" ? "transient" : "non_objective",
        admissionState: "rejected",
        admissionReason: legacySemanticKind === "preference" ? "temporary_preference_not_durable" : "cancelled_plan_not_active",
        metadataSource: "v2_model_native",
        actorTargetShape: "both",
      },
      comparison: {
        semanticCompatible: true,
        epistemicConflict: false,
        durabilityConflict: true,
        lifecycleConflict: true,
        authorityConflict: true,
        actorTargetConflict: false,
        temporalConflict: false,
        conflictFields: [],
        unsafe: true,
        mismatchClass: "destination_divergence",
        bridgeState: "safety_veto",
        bridgeReason: "cancelled_plan_not_active",
      },
    },
    ...overrides,
  };
}

configureDirectChatMemorySafetyVetoShadow({ enabled: false, explicitDebug: true });
clearDirectChatMemorySafetyVetoShadow();

// Production dependency guard: only the shadow adapter may import the pure
// validator; canonical writers/controllers remain authority-independent.
const sourceRoot = process.cwd();
const validatorSource = readFileSync(resolve(sourceRoot, "src/features/chat/services/directChatMemorySafetyVetoValidator.ts"), "utf8");
const shadowSource = readFileSync(resolve(sourceRoot, "src/features/chat/services/directChatMemorySafetyVetoShadow.ts"), "utf8");
const extractionHookSource = readFileSync(resolve(sourceRoot, "src/features/chat/hooks/useChatMemoryExtraction.ts"), "utf8");
const canonicalWriterSource = readFileSync(resolve(sourceRoot, "src/domain/memory/memoryWriteCoordinator.ts"), "utf8");
const knowledgeRepositorySource = readFileSync(resolve(sourceRoot, "src/core/storage/repositories/characterKnowledgeRepository.ts"), "utf8");
assert.doesNotMatch(validatorSource, /from ["'][^"']*(?:react|apiHelper|memoryWriteCoordinator|characterKnowledgeRepository)["']/u);
assert.match(shadowSource, /validateDirectChatSafetyVeto/u);
assert.doesNotMatch(canonicalWriterSource, /directChatMemorySafetyVetoValidator/u);
assert.doesNotMatch(knowledgeRepositorySource, /directChatMemorySafetyVetoValidator/u);
assert.match(extractionHookSource, /manualMessagesOverride === undefined/u);
assert.match(extractionHookSource, /featureScope: "automatic_direct_chat"/u);
assert.match(extractionHookSource, /claims: result\.acceptedClaims/u);
const disabled = evaluateDirectChatSafetyVetoShadow({ observations: [bridgeObservation()] });
assert.equal(disabled.enabled, false);
assert.equal(disabled.wouldVeto, 0);
assert.equal(getDirectChatMemorySafetyVetoShadowRecords().length, 0);

configureDirectChatMemorySafetyVetoShadow({ enabled: true, explicitDebug: true, maxObservations: 100 });
clearDirectChatMemorySafetyVetoShadow();
const enabled = evaluateDirectChatSafetyVetoShadow({ observations: [bridgeObservation()] });
assert.equal(enabled.enabled, true);
assert.equal(enabled.evaluated, 1);
assert.equal(enabled.eligible, 1);
assert.equal(enabled.wouldVeto, 1);
assert.equal(enabled.records[0]?.validatorReason, "SAFETY_VETO_CANCELLED_PLAN");
assert.doesNotMatch(exportDirectChatMemorySafetyVetoShadowJson(), /statement|sourceMessageIds|candidateId|scope-fp|source-fp/u);

// 19/31. One would-veto and two ordinary accepted claims remain untouched.
const partialBatch = [
  bridgeObservation(),
  bridgeObservation({ bridgeState: "review", bridgeReason: "active_plan_review", wouldSafetyVeto: false }),
  bridgeObservation({ bridgeState: "review", bridgeReason: "stable_preference_review", legacySemanticKind: "preference", v2SemanticKind: "preference", wouldSafetyVeto: false }),
];
const claims = Object.freeze(["legacy-1", "legacy-2", "legacy-3"]);
const claimsBefore = [...claims];
const partialResult = evaluateDirectChatSafetyVetoShadow({ observations: partialBatch });
assert.equal(partialResult.wouldVeto, 1);
assert.deepEqual(claims, claimsBefore);
let committedPayload: readonly string[] | undefined;
await commitMemoryWriteBundle({
  claims: claims as never,
  appendClaims: async (next) => {
    committedPayload = next as unknown as readonly string[];
    return { success: true };
  },
});
assert.deepEqual(committedPayload, claimsBefore);

// 20/32. Malformed shadow input is caught and recorded fail-open.
const malformed = evaluateDirectChatSafetyVetoShadow({ observations: [null as unknown as DirectChatMemoryBridgeShadowObservation] });
assert.equal(malformed.failOpen, 1);
assert.equal(malformed.records[0]?.validatorReason, "validator_error_fail_open");

// The bounded buffer is in-memory only and keeps the newest 100 records.
clearDirectChatMemorySafetyVetoShadow();
evaluateDirectChatSafetyVetoShadow({ observations: Array.from({ length: 105 }, () => bridgeObservation()) });
assert.equal(getDirectChatMemorySafetyVetoShadowRecords().length, 100);
assert.equal(JSON.parse(exportDirectChatMemorySafetyVetoShadowJson()).persistenceMode, "in_memory_only");
configureDirectChatMemorySafetyVetoShadow({ enabled: false, explicitDebug: true });
clearDirectChatMemorySafetyVetoShadow();

console.log("PASS Stage 4D-11D pure safety-veto validator, shadow telemetry, fail-open, scope, lineage and canonical invariants");
