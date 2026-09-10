import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type {
  DirectChatMemoryBridgeShadowObservation,
  DirectChatMemoryBridgeShadowResult,
} from "../src/features/chat/services/directChatMemoryAdmissionBridgeShadow";
import type { DirectChatMemoryIdentityDiagnostics } from "../src/features/chat/services/directChatMemoryAdmissionBridge";
import type {
  DirectChatMemorySafetyVetoShadowEvaluation,
  DirectChatMemorySafetyVetoShadowRecord,
} from "../src/features/chat/services/directChatMemorySafetyVetoShadow";
import {
  applyDirectChatMemorySafetyVetoCanary,
  clearDirectChatMemorySafetyVetoCanary,
  configureDirectChatMemorySafetyVetoCanary,
  exportDirectChatMemorySafetyVetoCanaryJson,
  getDirectChatMemorySafetyVetoCanaryRecords,
  isDirectChatMemorySafetyVetoCanaryEnabled,
  ENABLED_DIRECT_CHAT_MEMORY_SAFETY_VETO_CANARY_REASONS,
} from "../src/features/chat/services/directChatMemorySafetyVetoCanary";
import { resolveDirectChatSummaryCutover } from "../src/domain/memory/directChatSummaryCutoverPolicy";
import { buildCanonicalMemoryCommitSnapshot } from "../src/domain/memory/canonicalMemoryCommitSnapshot";

const scope = {
  characterId: "character-canary",
  relationId: "relation-canary",
  userIdentityId: "identity-canary",
  conversationId: "conversation-canary",
};

function sourceFingerprint(values: readonly string[]): string {
  const source = Array.from(new Set(values.filter(Boolean))).sort().join("\u0000");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function scopeFingerprintForCurrentScope(): string {
  const source = [scope.characterId, scope.relationId, scope.userIdentityId, scope.conversationId].join("\u0000");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function claim(id: string, sourceMessageId = "message-canary"): KnowledgeClaim {
  return {
    id,
    ...scope,
    kind: "plan",
    subject: "user",
    statement: `plan-${id}`,
    truthStatus: "asserted",
    temporalStatus: "future",
    source: {
      kind: "user_message",
      authorship: "user",
      messageIds: [sourceMessageId],
      producer: "memory-extractor.chat.v1",
      evidenceKey: `evidence-${id}`,
    },
    confidence: 0.9,
    userConfirmed: false,
    recordedAt: 1,
    status: "active",
    visibility: "relation_private",
    schemaVersion: 1,
  };
}

function identity(sourceMessageId = "message-canary", overrides: Partial<DirectChatMemoryIdentityDiagnostics> = {}): DirectChatMemoryIdentityDiagnostics {
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
    sourceSetFingerprint: sourceFingerprint([sourceMessageId]),
    scopeFingerprint: scopeFingerprintForCurrentScope(),
    semanticClass: "plan",
    producerClass: "direct_chat",
    sourceTypeClass: "user_message",
    temporalStatus: "future",
    actorTargetShape: "both",
    ...overrides,
  };
}

function observation(overrides: Partial<DirectChatMemoryBridgeShadowObservation> = {}): DirectChatMemoryBridgeShadowObservation {
  return {
    bridgeCorrelation: "conflict",
    lineageStatus: "shared",
    pairUnique: true,
    legacyAccepted: true,
    legacyWriteEligibility: "canonical_write",
    legacyProvenanceTrusted: true,
    v2ProvenanceTrusted: true,
    bridgeState: "safety_veto",
    bridgeReason: "cancelled_plan_not_active",
    legacySemanticKind: "plan",
    v2SemanticKind: "plan",
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
    ...overrides,
  };
}

function validation(overrides: Partial<DirectChatMemorySafetyVetoShadowRecord> = {}): DirectChatMemorySafetyVetoShadowRecord {
  return {
    evaluated: true,
    validatorResult: "allow_veto",
    validatorReason: "SAFETY_VETO_CANCELLED_PLAN",
    proposedCanaryReason: "SAFETY_VETO_CANCELLED_PLAN",
    eligible: true,
    wouldVeto: true,
    skipped: false,
    failOpen: false,
    featureScope: "automatic_direct_chat",
    correlationState: "conflict",
    bridgeState: "safety_veto",
    metadataSourceClass: "v2_model_native",
    ...overrides,
  };
}

function bridgeResult(observations: readonly DirectChatMemoryBridgeShadowObservation[]): DirectChatMemoryBridgeShadowResult {
  return {
    failedOpen: false,
    metrics: {} as DirectChatMemoryBridgeShadowResult["metrics"],
    observations,
    pairCandidateMatrix: [],
  };
}

function safetyResult(records: readonly DirectChatMemorySafetyVetoShadowRecord[]): DirectChatMemorySafetyVetoShadowEvaluation {
  return {
    enabled: true,
    evaluated: records.length,
    eligible: records.filter((record) => record.eligible).length,
    wouldVeto: records.filter((record) => record.wouldVeto).length,
    skipped: records.filter((record) => record.skipped).length,
    failOpen: records.filter((record) => record.failOpen).length,
    records,
  };
}

const enable = () => configureDirectChatMemorySafetyVetoCanary({
  enabled: true,
  explicitDebug: true,
  enabledReasons: ENABLED_DIRECT_CHAT_MEMORY_SAFETY_VETO_CANARY_REASONS,
});

const reset = () => {
  configureDirectChatMemorySafetyVetoCanary({ enabled: false, explicitDebug: true });
  clearDirectChatMemorySafetyVetoCanary();
};

const eligibleClaim = claim("claim-a");
const eligibleObservation = observation();
const eligibleValidation = validation();

// 1–2. Missing/false/malformed flag is OFF and preserves exact legacy content.
reset();
assert.equal(isDirectChatMemorySafetyVetoCanaryEnabled(), false);
const offClaims = [eligibleClaim];
const offResult = applyDirectChatMemorySafetyVetoCanary({ claims: offClaims });
assert.equal(offResult.enabled, false);
assert.deepEqual(offResult.filteredAcceptedClaims, offClaims);
assert.equal(offResult.suppressed, 0);
configureDirectChatMemorySafetyVetoCanary({ enabled: true, explicitDebug: true, enabledReasons: ["not-a-reason"] });
const malformedFlagResult = applyDirectChatMemorySafetyVetoCanary({
  claims: offClaims,
  bridgeShadow: bridgeResult([eligibleObservation]),
  safetyEvaluation: safetyResult([eligibleValidation]),
});
assert.deepEqual(malformedFlagResult.filteredAcceptedClaims, offClaims);
assert.equal(malformedFlagResult.suppressed, 0);

// 3. A cancelled plan with every gate satisfied suppresses one claim only.
enable();
const beforeClaims = Object.freeze([eligibleClaim]);
const canaryResult = applyDirectChatMemorySafetyVetoCanary({
  claims: beforeClaims,
  bridgeShadow: bridgeResult([eligibleObservation]),
  safetyEvaluation: safetyResult([eligibleValidation]),
});
assert.deepEqual(beforeClaims, [eligibleClaim], "the input claim collection is not mutated");
assert.deepEqual(canaryResult.filteredAcceptedClaims, []);
assert.equal(canaryResult.suppressed, 1);
assert.equal(canaryResult.canaryEligible, 1);
assert.equal(canaryResult.records[0]?.suppressed, true);

// 4–5. Reason-off and temporary preference remain legacy-preserved.
configureDirectChatMemorySafetyVetoCanary({ enabled: true, explicitDebug: true, enabledReasons: [] });
const reasonOff = applyDirectChatMemorySafetyVetoCanary({
  claims: [eligibleClaim],
  bridgeShadow: bridgeResult([eligibleObservation]),
  safetyEvaluation: safetyResult([eligibleValidation]),
});
assert.deepEqual(reasonOff.filteredAcceptedClaims, [eligibleClaim]);
assert.equal(reasonOff.records[0]?.reasonEnabled, false);
enable();
const temporaryPreference = applyDirectChatMemorySafetyVetoCanary({
  claims: [eligibleClaim],
  bridgeShadow: bridgeResult([observation({
    bridgeReason: "temporary_preference_not_durable",
    legacySemanticKind: "preference",
    v2SemanticKind: "preference",
  })]),
  safetyEvaluation: safetyResult([validation({
    validatorReason: "SAFETY_VETO_TEMPORARY_PREFERENCE",
  })]),
});
assert.deepEqual(temporaryPreference.filteredAcceptedClaims, [eligibleClaim]);
assert.equal(temporaryPreference.suppressed, 0);

// 6–15. Authority and identity uncertainty always preserves the legacy claim.
const gateCases: Array<[string, Partial<DirectChatMemoryBridgeShadowObservation>]> = [
  ["missing lineage", { lineageStatus: "absent" }],
  ["partial lineage", { lineageStatus: "partial" }],
  ["structural fallback", { lineageStatus: "absent" }],
  ["ambiguous pair", { bridgeCorrelation: "ambiguous", pairUnique: false }],
  ["duplicate pair", { bridgeCorrelation: "duplicate", pairUnique: false }],
  ["cross scope", { legacyIdentity: identity("message-canary", { scopeExact: false }) }],
  ["untrusted provenance", { legacyProvenanceTrusted: false }],
  ["legacy rejected", { legacyAccepted: false }],
  ["v2-only", { legacyAccepted: false, bridgeCorrelation: "v2_only" }],
  ["non-safety state", { bridgeState: "review", wouldSafetyVeto: false }],
];
for (const [label, overrides] of gateCases) {
  const result = applyDirectChatMemorySafetyVetoCanary({
    claims: [eligibleClaim],
    bridgeShadow: bridgeResult([observation(overrides)]),
    safetyEvaluation: safetyResult([eligibleValidation]),
  });
  assert.deepEqual(result.filteredAcceptedClaims, [eligibleClaim], `${label} must fail open`);
  assert.equal(result.suppressed, 0, `${label} must not suppress`);
}
const assertedObjective = applyDirectChatMemorySafetyVetoCanary({
  claims: [eligibleClaim],
  bridgeShadow: bridgeResult([observation({ legacySemanticKind: "fact", v2SemanticKind: "fact" })]),
  safetyEvaluation: safetyResult([validation({ validatorReason: "SAFETY_VETO_CANCELLED_PLAN" })]),
});
assert.deepEqual(assertedObjective.filteredAcceptedClaims, [eligibleClaim]);
const claimScopeMismatch = applyDirectChatMemorySafetyVetoCanary({
  claims: [{ ...eligibleClaim, relationId: "other-relation" }],
  bridgeShadow: bridgeResult([eligibleObservation]),
  safetyEvaluation: safetyResult([eligibleValidation]),
});
assert.equal(claimScopeMismatch.suppressed, 0, "a claim outside the observed scope must fail open");
const identityMismatch = applyDirectChatMemorySafetyVetoCanary({
  claims: [eligibleClaim],
  bridgeShadow: bridgeResult([observation({ v2Identity: identity("message-other") })]),
  safetyEvaluation: safetyResult([eligibleValidation]),
});
assert.equal(identityMismatch.suppressed, 0, "legacy/V2 source identity mismatch must fail open");

// 16. A validator exception/fail-open record is retained and does not abort a batch.
const exceptionResult = applyDirectChatMemorySafetyVetoCanary({
  claims: [eligibleClaim],
  bridgeShadow: bridgeResult([]),
  safetyEvaluation: safetyResult([validation({ validatorResult: "insufficient", validatorReason: "validator_error_fail_open", eligible: false, wouldVeto: false, failOpen: true })]),
});
assert.deepEqual(exceptionResult.filteredAcceptedClaims, [eligibleClaim]);
assert.equal(exceptionResult.failOpen, 1);
assert.equal(exceptionResult.records[0]?.validatorReason, "validator_error_fail_open");
const unknownReason = applyDirectChatMemorySafetyVetoCanary({
  claims: [eligibleClaim],
  bridgeShadow: bridgeResult([observation({ bridgeCorrelation: "unexpected-private-text" as DirectChatMemoryBridgeShadowObservation["bridgeCorrelation"] })]),
  safetyEvaluation: safetyResult([validation({ validatorResult: "deny_veto", validatorReason: "raw exception text should not persist" })]),
});
assert.equal(unknownReason.records[0]?.validatorReason, "unknown_safety_veto_reason");
assert.equal(unknownReason.records[0]?.correlationClass, "unknown");
assert.doesNotMatch(exportDirectChatMemorySafetyVetoCanaryJson(), /raw exception text should not persist|unexpected-private-text/u);

// 17. Partial batch suppresses A and commits the other accepted candidates.
const claimB = claim("claim-b", "message-b");
const claimC = claim("claim-c", "message-c");
const partial = applyDirectChatMemorySafetyVetoCanary({
  claims: [eligibleClaim, claimB, claimC],
  bridgeShadow: bridgeResult([eligibleObservation]),
  safetyEvaluation: safetyResult([eligibleValidation]),
});
assert.deepEqual(partial.filteredAcceptedClaims, [claimB, claimC]);
assert.equal(partial.suppressed, 1);
assert.equal(partial.records[0]?.acceptedBeforeCount, 3);
assert.equal(partial.records[0]?.acceptedAfterCount, 2);

// 18–20. All-veto batches reuse zero-candidate semantics and advance the existing cursor.
const zeroCutover = resolveDirectChatSummaryCutover({
  automatic: true,
  canonicalSnapshotAvailable: true,
  zeroCandidates: canaryResult.filteredAcceptedClaims.length === 0,
});
assert.equal(zeroCutover.outcome, "ZERO_CANDIDATES");
assert.equal(zeroCutover.writeSynchronousSummary, false);
assert.equal(zeroCutover.canAdvanceCursor, true);
assert.deepEqual(canaryResult.filteredAcceptedClaims, [], "all vetoed claims produce no canonical append");

// 21–23. Canonical/Summary/Projection inputs contain only the remaining claims.
const snapshot = buildCanonicalMemoryCommitSnapshot({ scope, claims: partial.filteredAcceptedClaims });
assert.deepEqual(snapshot.activeClaims.map((item) => item.id), ["claim-b", "claim-c"]);
assert.equal(snapshot.activeClaims.some((item) => item.id === "claim-a"), false);
assert.equal(JSON.stringify(snapshot).includes("plan-claim-a"), false);
assert.equal("extractedMemories" in partial, false, "compatibility MemoryItem payload is not produced");

// 24–26. No bridge/evaluation (including excluded feature paths) is fail-open.
for (const label of ["group", "offline", "manual"]) {
  const result = applyDirectChatMemorySafetyVetoCanary({ claims: [eligibleClaim] });
  assert.deepEqual(result.filteredAcceptedClaims, [eligibleClaim], `${label} remains unaffected`);
}

// 27–28. The adapter has no Provider or Prompt dependency.
const sourceRoot = process.cwd();
const canarySource = readFileSync(resolve(sourceRoot, "src/features/chat/services/directChatMemorySafetyVetoCanary.ts"), "utf8");
assert.doesNotMatch(canarySource, /apiHelper|Prompt|fetch\s*\(|commitMemoryWriteBundle/u);
const extractionHookSource = readFileSync(resolve(sourceRoot, "src/features/chat/hooks/useChatMemoryExtraction.ts"), "utf8");
assert.match(extractionHookSource, /!activeCharacter\.isGroupChat[\s\S]*activeDirectScope !== undefined[\s\S]*manualMessagesOverride === undefined/u);

// 29–30. Bounded, metadata-only telemetry.
clearDirectChatMemorySafetyVetoCanary();
for (let index = 0; index < 125; index += 1) {
  applyDirectChatMemorySafetyVetoCanary({
    claims: [eligibleClaim],
    bridgeShadow: bridgeResult([eligibleObservation]),
    safetyEvaluation: safetyResult([eligibleValidation]),
  });
}
assert.equal(getDirectChatMemorySafetyVetoCanaryRecords().length, 100);
const exportText = exportDirectChatMemorySafetyVetoCanaryJson();
assert.equal(JSON.parse(exportText).persistenceMode, "in_memory_only");
assert.doesNotMatch(exportText, /plan-claim-a|message-canary|character-canary|relation-canary|identity-canary|statement|sourceMessageIds/u);

// 31–32. Input claims stay intact and kill-switch OFF restores exact legacy behavior.
const originalClaims = [eligibleClaim, claimB];
const originalJson = JSON.stringify(originalClaims);
enable();
const enabledResult = applyDirectChatMemorySafetyVetoCanary({
  claims: originalClaims,
  bridgeShadow: bridgeResult([eligibleObservation]),
  safetyEvaluation: safetyResult([eligibleValidation]),
});
assert.equal(JSON.stringify(originalClaims), originalJson);
reset();
const disabledAgain = applyDirectChatMemorySafetyVetoCanary({
  claims: originalClaims,
  bridgeShadow: bridgeResult([eligibleObservation]),
  safetyEvaluation: safetyResult([eligibleValidation]),
});
assert.deepEqual(disabledAgain.filteredAcceptedClaims, originalClaims);
assert.equal(enabledResult.suppressed, 1);

console.log("PASS Stage 4D-11G limited cancelled-plan Canary: gates, partial/zero batches, cursor semantics, privacy, bounded telemetry, and kill switch");
