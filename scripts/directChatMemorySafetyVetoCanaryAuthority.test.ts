import assert from "node:assert/strict";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { commitMemoryWriteBundle } from "../src/domain/memory/memoryWriteCoordinator";
import { resolveDirectChatSummaryCutover } from "../src/domain/memory/directChatSummaryCutoverPolicy";
import type { DirectChatMemoryBridgeShadowObservation, DirectChatMemoryBridgeShadowResult } from "../src/features/chat/services/directChatMemoryAdmissionBridgeShadow";
import type { DirectChatMemorySafetyVetoShadowEvaluation, DirectChatMemorySafetyVetoShadowRecord } from "../src/features/chat/services/directChatMemorySafetyVetoShadow";
import {
  applyDirectChatMemorySafetyVetoCanary,
  clearDirectChatMemorySafetyVetoCanary,
  configureDirectChatMemorySafetyVetoCanary,
  ENABLED_DIRECT_CHAT_MEMORY_SAFETY_VETO_CANARY_REASONS,
} from "../src/features/chat/services/directChatMemorySafetyVetoCanary";

const scope = {
  characterId: "authority-character",
  relationId: "authority-relation",
  userIdentityId: "authority-identity",
  conversationId: "authority-conversation",
};

function fingerprint(values: readonly string[]): string {
  const source = Array.from(new Set(values.filter(Boolean))).sort().join("\u0000");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function scopeFingerprint(): string {
  const source = [scope.characterId, scope.relationId, scope.userIdentityId, scope.conversationId].join("\u0000");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function claim(id: string): KnowledgeClaim {
  return {
    id,
    ...scope,
    kind: "plan",
    subject: "user",
    statement: `synthetic-${id}`,
    truthStatus: "asserted",
    temporalStatus: "future",
    source: {
      kind: "user_message",
      authorship: "user",
      messageIds: [`message-${id}`],
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

const legacyIdentity = {
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
  sourceSetFingerprint: fingerprint(["message-cancelled"]),
  scopeFingerprint: scopeFingerprint(),
  semanticClass: "plan" as const,
  producerClass: "direct_chat" as const,
  sourceTypeClass: "user_message" as const,
  temporalStatus: "future" as const,
  actorTargetShape: "both" as const,
};

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
    v2MetadataSource: "v2_model_native",
    v2AuthorityClass: "none",
    legacyPolicySource: "legacy_claim_semantics",
    wouldWriteProposal: false,
    wouldSafetyVeto: true,
    wouldPassthrough: false,
    wouldReview: false,
    wouldReject: false,
    wouldRoute: false,
    legacyIdentity,
    v2Identity: { ...legacyIdentity, actorPresent: false, targetPresent: false, evidenceKeyPresent: false },
    ...overrides,
  };
}

function safetyRecord(overrides: Partial<DirectChatMemorySafetyVetoShadowRecord> = {}): DirectChatMemorySafetyVetoShadowRecord {
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

function bridge(observations: readonly DirectChatMemoryBridgeShadowObservation[]): DirectChatMemoryBridgeShadowResult {
  return { failedOpen: false, metrics: {} as DirectChatMemoryBridgeShadowResult["metrics"], observations, pairCandidateMatrix: [] };
}

function safety(records: readonly DirectChatMemorySafetyVetoShadowRecord[]): DirectChatMemorySafetyVetoShadowEvaluation {
  return { enabled: true, evaluated: records.length, eligible: records.filter((item) => item.eligible).length, wouldVeto: records.filter((item) => item.wouldVeto).length, skipped: 0, failOpen: 0, records };
}

configureDirectChatMemorySafetyVetoCanary({
  enabled: true,
  explicitDebug: true,
  enabledReasons: ENABLED_DIRECT_CHAT_MEMORY_SAFETY_VETO_CANARY_REASONS,
});
clearDirectChatMemorySafetyVetoCanary();

const cancelled = claim("cancelled");
const acceptedClaims = Object.freeze([cancelled]);
const veto = applyDirectChatMemorySafetyVetoCanary({
  claims: acceptedClaims,
  bridgeShadow: bridge([observation()]),
  safetyEvaluation: safety([safetyRecord()]),
});
assert.deepEqual(acceptedClaims, [cancelled], "real extraction result remains immutable");
assert.deepEqual(veto.filteredAcceptedClaims, [], "all-veto batch reaches the writer with zero claims");
assert.equal(veto.suppressed, 1);
assert.equal(resolveDirectChatSummaryCutover({ automatic: true, canonicalSnapshotAvailable: true, zeroCandidates: true }).outcome, "ZERO_CANDIDATES");

let vetoClaimWrites = 0;
let vetoSummaryWrites = 0;
let vetoProjectionCalls = 0;
const vetoWrite = await commitMemoryWriteBundle({
  claims: veto.filteredAcceptedClaims,
  appendClaims: () => { vetoClaimWrites += 1; },
  appendSummaries: () => { vetoSummaryWrites += 1; },
  afterCanonicalWrite: () => { vetoProjectionCalls += 1; },
});
assert.equal(vetoWrite.canonicalWritten, true, "ZERO_CANDIDATES keeps canonical writer semantics");
assert.equal(vetoClaimWrites, 0, "vetoed claim is not appended");
assert.equal(vetoSummaryWrites, 0, "all-veto does not create a fake Summary");
assert.equal(vetoProjectionCalls, 0, "all-veto does not enqueue a Projection");

const control = claim("control");
const controlResult = applyDirectChatMemorySafetyVetoCanary({
  claims: [control],
  bridgeShadow: bridge([observation({ bridgeState: "review", bridgeReason: "unknown_semantics", wouldSafetyVeto: false, v2AuthorityClass: "none" })]),
  safetyEvaluation: safety([safetyRecord({ validatorResult: "deny_veto", validatorReason: "bridge_not_safety_veto", eligible: false, wouldVeto: false })]),
});
assert.deepEqual(controlResult.filteredAcceptedClaims, [control], "control candidate remains legacy-preserved");
let committed: readonly KnowledgeClaim[] = [];
const controlWrite = await commitMemoryWriteBundle({
  claims: controlResult.filteredAcceptedClaims,
  appendClaims: (items) => { committed = [...items]; return { success: true }; },
});
assert.equal(controlWrite.canonicalWritten, true);
assert.deepEqual(committed, [control], "control candidate commits through the existing canonical writer");

configureDirectChatMemorySafetyVetoCanary({ enabled: false, explicitDebug: true });
clearDirectChatMemorySafetyVetoCanary();
console.log("direct chat safety-veto canary authority tests passed");
