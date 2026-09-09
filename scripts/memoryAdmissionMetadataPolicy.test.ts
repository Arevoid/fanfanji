import assert from "node:assert/strict";
import {
  parseMemoryExtractionCandidateV2Output,
} from "../src/features/characterKnowledge/services/knowledgeExtractionProtocol";
import type { MemoryExtractionCandidateV2 } from "../src/domain/memory/memoryExtractionSchema";
import {
  evaluateMemoryCandidate,
} from "../src/domain/memory/memoryAdmission";
import type { MemoryCandidate } from "../src/domain/memory/memoryCandidate";
import { adaptDirectChatMemoryExtractionToCandidates } from "../src/features/chat/services/directChatMemoryCandidateAdapter";
import type { MemoryExtractionSourceEnvelope } from "../src/domain/memory/memoryExtractionSourceEnvelope";
import {
  clearDirectChatMemoryAdmissionShadowEvidence,
  configureDirectChatMemoryAdmissionShadowEvidence,
  exportDirectChatMemoryAdmissionShadowJson,
  recordDirectChatMemoryAdmissionShadowEvidence,
} from "../src/features/chat/services/directChatMemoryAdmissionShadowTelemetry";
import { observeDirectChatMemoryAdmissionShadow } from "../src/features/chat/services/directChatMemoryAdmissionShadow";

const allowed = new Set(["message-1"]);
const v2Payload = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  kind: "fact",
  statement: "用户喜欢咖啡。",
  temporalStatus: "present",
  sourceMessageIds: ["message-1"],
  evidenceQuote: "我喜欢咖啡。",
  epistemicStatus: "objective",
  authorityRole: "durable_candidate",
  ...overrides,
});

const parsed = parseMemoryExtractionCandidateV2Output(JSON.stringify(v2Payload({
  kind: "plan",
  temporalStatus: "future",
  planLifecycle: "active",
  epistemicStatus: "uncertain",
  authorityRole: "durable_candidate",
})), allowed);
assert.equal(parsed.length, 1);
assert.equal(parsed[0]?.epistemicStatus, "uncertain");
assert.equal(parsed[0]?.planLifecycle, "active");
assert.equal(parsed[0]?.authorityRole, "durable_candidate");

const malformed = parseMemoryExtractionCandidateV2Output(JSON.stringify(v2Payload({
  epistemicStatus: "invented",
  planLifecycle: "never",
  authorityRole: "write_truth",
})), allowed);
assert.equal(malformed[0]?.epistemicStatus, "unknown");
assert.equal(malformed[0]?.planLifecycle, "unknown");
assert.equal(malformed[0]?.authorityRole, "unknown", "malformed authority fails safe");
const missing = parseMemoryExtractionCandidateV2Output(JSON.stringify(v2Payload({
  epistemicStatus: undefined,
  authorityRole: undefined,
})), allowed);
assert.equal(missing[0]?.epistemicStatus, undefined, "optional metadata remains absent");
assert.equal(missing[0]?.authorityRole, undefined);

const baseCandidate = (overrides: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
  schemaVersion: 1,
  candidateId: "metadata-candidate",
  candidateKind: "fact",
  metadataSource: "v2",
  epistemicStatus: "objective",
  proposedAuthorityRole: "durable_candidate",
  resolvedAuthorityRole: "durable_candidate",
  statement: "用户喜欢咖啡。",
  subject: "user",
  scope: {
    characterId: "character-1",
    relationId: "relation-1",
    userIdentityId: "identity-1",
    conversationId: "conversation-1",
  },
  provenance: {
    producer: "direct_chat",
    sourceType: "user_message",
    authorship: "user",
    actorId: "identity-1",
    targetId: "character-1",
    app: "chat",
    sourceMessageIds: ["message-1"],
    conversationId: "conversation-1",
  },
  evidence: { sourceMessageIds: ["message-1"], evidenceKey: "message-1:evidence" },
  temporal: { status: "present", recordedAt: 100 },
  ...overrides,
});

const accepted = evaluateMemoryCandidate(baseCandidate());
assert.deepEqual(
  { state: accepted.state, target: accepted.target, reason: accepted.reason },
  { state: "accepted", target: "truth", reason: "accepted_fact" },
);

const missingEpistemic = evaluateMemoryCandidate(baseCandidate({
  epistemicStatus: "unknown",
}));
assert.equal(missingEpistemic.state, "needs_review");
assert.equal(missingEpistemic.reason, "missing_epistemic_status");

const subjective = evaluateMemoryCandidate(baseCandidate({
  candidateKind: "belief",
  epistemicStatus: "subjective",
  proposedAuthorityRole: "non_objective",
  resolvedAuthorityRole: "non_objective",
}));
assert.equal(subjective.state, "rejected");
assert.equal(subjective.reason, "subjective_not_objective_truth");

const sceneOnly = evaluateMemoryCandidate(baseCandidate({
  proposedAuthorityRole: "scene_only",
  resolvedAuthorityRole: "scene_only",
}));
assert.equal(sceneOnly.state, "rejected");
assert.equal(sceneOnly.reason, "scene_only_not_truth");

const relationshipSignal = evaluateMemoryCandidate(baseCandidate({
  candidateKind: "relationship_signal",
  proposedAuthorityRole: "relationship_signal",
  resolvedAuthorityRole: "relationship_signal",
  epistemicStatus: "unknown",
}));
assert.equal(relationshipSignal.state, "needs_review");
assert.equal(relationshipSignal.reason, "relationship_signal_requires_review");

const cancelledPlan = evaluateMemoryCandidate(baseCandidate({
  candidateKind: "plan",
  planLifecycle: "cancelled",
  temporal: { status: "future", recordedAt: 100 },
}));
assert.equal(cancelledPlan.state, "rejected");
assert.equal(cancelledPlan.reason, "cancelled_plan_not_active");

const uncertainPlan = evaluateMemoryCandidate(baseCandidate({
  candidateKind: "plan",
  planLifecycle: "uncertain",
  temporal: { status: "future", recordedAt: 100 },
}));
assert.equal(uncertainPlan.state, "needs_review");
assert.equal(uncertainPlan.reason, "uncertain_plan_requires_review");

const completedPlan = evaluateMemoryCandidate(baseCandidate({
  candidateKind: "plan",
  planLifecycle: "completed",
  temporal: { status: "future", recordedAt: 100 },
}));
assert.equal(completedPlan.state, "rejected");
assert.equal(completedPlan.reason, "completed_plan_not_active");

const temporaryPreference = evaluateMemoryCandidate(baseCandidate({
  semanticFacet: "preference",
  durability: "temporary",
  proposedAuthorityRole: "transient",
  resolvedAuthorityRole: "transient",
}));
assert.equal(temporaryPreference.state, "needs_review");
assert.equal(temporaryPreference.reason, "temporary_preference_not_durable");

const unknownPreference = evaluateMemoryCandidate(baseCandidate({
  semanticFacet: "preference",
  durability: "unknown",
}));
assert.equal(unknownPreference.state, "needs_review");
assert.equal(unknownPreference.reason, "unknown_preference_durability");

const metadataConflict = evaluateMemoryCandidate(baseCandidate({
  semanticFacet: "scene_only",
  proposedAuthorityRole: "durable_candidate",
  resolvedAuthorityRole: "durable_candidate",
}));
assert.equal(metadataConflict.state, "rejected");
assert.equal(metadataConflict.reason, "metadata_conflict");

const unsafeAuthority = evaluateMemoryCandidate(baseCandidate({
  proposedAuthorityRole: "unknown",
  resolvedAuthorityRole: "durable_candidate",
}));
assert.equal(unsafeAuthority.state, "needs_review");
assert.equal(unsafeAuthority.reason, "unsafe_authority_role");

const runtimeEnvelope: MemoryExtractionSourceEnvelope = {
  characterId: "runtime-character",
  relationId: "runtime-relation",
  userIdentityId: "runtime-user",
  conversationId: "runtime-conversation",
  messageSources: [{ messageId: "message-1", role: "user", actorId: "runtime-user", timestamp: 10 }],
  allowedSourceMessageIds: ["message-1"],
};
const runtimeParsed = parseMemoryExtractionCandidateV2Output(JSON.stringify(v2Payload({
  actorRole: "character",
  targetRole: "user",
  characterId: "spoofed-character",
  relationId: "spoofed-relation",
  userIdentityId: "spoofed-user",
  authoritative: true,
})), allowed);
const runtimeExtraction = {
  extractedMemories: [],
  acceptedClaims: [],
  rejectedCandidateCount: 0,
  structuredCandidatesV2: runtimeParsed,
  sourceEnvelope: runtimeEnvelope,
};
const runtimeCandidate = adaptDirectChatMemoryExtractionToCandidates({
  extraction: runtimeExtraction,
  sourceEnvelope: runtimeEnvelope,
  scope: runtimeEnvelope,
  recordedAt: 100,
  createCandidateId: () => "runtime-candidate",
}).candidates[0]!;
assert.equal(runtimeCandidate.scope.characterId, "runtime-character");
assert.equal(runtimeCandidate.scope.relationId, "runtime-relation");
assert.equal(runtimeCandidate.scope.userIdentityId, "runtime-user");
assert.equal(runtimeCandidate.provenance.actorId, "runtime-character");
assert.equal(runtimeCandidate.provenance.targetId, "runtime-user");
assert.equal(runtimeCandidate.provenance.authorship, "user");
assert.equal("authoritative" in runtimeCandidate, false);

configureDirectChatMemoryAdmissionShadowEvidence({ enabled: true, explicitDebug: true, maxObservations: 10 });
clearDirectChatMemoryAdmissionShadowEvidence();
const shadowCandidate = {
  ...baseCandidate({ candidateId: "shadow-metadata", candidateKind: "plan", planLifecycle: "uncertain", temporal: { status: "future", recordedAt: 100 } }),
};
const shadowParsed = parseMemoryExtractionCandidateV2Output(JSON.stringify(v2Payload({
  kind: "plan",
  temporalStatus: "future",
  epistemicStatus: "uncertain",
  planLifecycle: "uncertain",
})), allowed);
const shadow = observeDirectChatMemoryAdmissionShadow({
  extraction: {
    extractedMemories: [],
    acceptedClaims: [],
    rejectedCandidateCount: 0,
    sourceEnvelope: runtimeEnvelope,
    structuredCandidatesV2: [shadowParsed[0] as MemoryExtractionCandidateV2],
  },
  scope: runtimeEnvelope,
  recordedAt: 100,
  createCandidateId: () => shadowCandidate.candidateId,
});
recordDirectChatMemoryAdmissionShadowEvidence({
  scope: {
    characterId: runtimeEnvelope.characterId,
    relationId: runtimeEnvelope.relationId!,
    userIdentityId: runtimeEnvelope.userIdentityId!,
    conversationId: runtimeEnvelope.conversationId!,
  },
  result: shadow,
  evidenceOrigin: "synthetic",
});
const exported = exportDirectChatMemoryAdmissionShadowJson();
assert.match(exported, /epistemicStatus/);
assert.match(exported, /proposedAuthorityRole/);
assert.match(exported, /resolvedAuthorityRole/);
assert.match(exported, /planLifecycle/);
assert.doesNotMatch(exported, /用户喜欢咖啡|message-1|runtime-character|candidateId|idempotencyKey/u);
clearDirectChatMemoryAdmissionShadowEvidence();
configureDirectChatMemoryAdmissionShadowEvidence({ enabled: false, explicitDebug: true });

console.log("PASS additive epistemic, plan lifecycle, authority role metadata, policy derivation, runtime ownership, and sanitized Shadow telemetry");
