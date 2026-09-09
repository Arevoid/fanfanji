import assert from "node:assert/strict";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import {
  classifyAdmissionComparisonMismatch,
  classifyLegacyAdmissionSemantics,
  classifyV2AdmissionSemantics,
} from "../src/features/chat/services/directChatMemoryAdmissionComparison";
import { evaluateMemoryCandidate } from "../src/domain/memory/memoryAdmission";
import type { MemoryCandidate } from "../src/domain/memory/memoryCandidate";
import { observeDirectChatMemoryAdmissionShadow } from "../src/features/chat/services/directChatMemoryAdmissionShadow";
import { buildMemoryShadowCorrelationKey } from "../src/domain/memory/memoryShadowCorrelation";

const legacy = (candidateKind: "fact" | "belief" | "hypothesis" | "preference" | "plan", truthStatus?: KnowledgeClaim["truthStatus"]) =>
  classifyLegacyAdmissionSemantics({ decision: "accepted", candidateKind, truthStatus });

assert.deepEqual(
  legacy("fact", "asserted"),
  { semanticKind: "fact", destinationClass: "user_assertion", authorityClass: "user_assertion", writeEligibility: "canonical_write" },
);
assert.deepEqual(
  legacy("fact", "confirmed"),
  { semanticKind: "fact", destinationClass: "confirmed_fact", authorityClass: "objective_truth", writeEligibility: "canonical_write" },
);
assert.equal(legacy("belief").authorityClass, "non_objective_belief");
assert.equal(legacy("hypothesis").destinationClass, "belief_hypothesis");
assert.equal(legacy("preference").destinationClass, "preference");
assert.equal(legacy("plan").destinationClass, "future_plan");

const baseCandidate = (overrides: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
  schemaVersion: 1,
  candidateId: "comparator-candidate",
  candidateKind: "belief",
  metadataSource: "v2",
  epistemicStatus: "subjective",
  proposedAuthorityRole: "non_objective",
  resolvedAuthorityRole: "non_objective",
  statement: "用户认为角色并不在乎用户。",
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
    sourceMessageIds: ["message-1"],
    conversationId: "conversation-1",
  },
  evidence: { sourceMessageIds: ["message-1"] },
  temporal: { status: "present", recordedAt: 100 },
  ...overrides,
});

const subjectiveCandidate = baseCandidate();
const subjectiveDecision = evaluateMemoryCandidate(subjectiveCandidate);
const subjectiveV2 = classifyV2AdmissionSemantics(subjectiveCandidate, subjectiveDecision);
assert.equal(subjectiveDecision.reason, "subjective_not_objective_truth");
assert.equal(subjectiveV2.authorityClass, "non_objective_belief");
assert.equal(
  classifyAdmissionComparisonMismatch(legacy("belief"), subjectiveV2),
  "safe_semantic_divergence",
  "legacy cautious belief versus V2 non-objective rejection is not objective-authority P1",
);
assert.equal(
  classifyAdmissionComparisonMismatch(legacy("fact", "asserted"), subjectiveV2),
  "safe_semantic_divergence",
  "asserted user fact is not equivalent to confirmed objective Truth",
);
assert.equal(
  classifyAdmissionComparisonMismatch(legacy("fact", "confirmed"), subjectiveV2),
  "authority_escalation",
  "confirmed objective legacy fact versus subjective V2 remains dangerous",
);

const sceneCandidate = baseCandidate({
  candidateKind: "scene_only",
  epistemicStatus: "objective",
  proposedAuthorityRole: "scene_only",
  resolvedAuthorityRole: "scene_only",
});
const sceneDecision = evaluateMemoryCandidate(sceneCandidate);
assert.equal(sceneDecision.reason, "scene_only_not_truth");
assert.equal(classifyAdmissionComparisonMismatch(legacy("fact", "confirmed"), classifyV2AdmissionSemantics(sceneCandidate, sceneDecision)), "authority_escalation");

const relationshipCandidate = baseCandidate({
  candidateKind: "relationship_signal",
  epistemicStatus: "unknown",
  proposedAuthorityRole: "relationship_signal",
  resolvedAuthorityRole: "relationship_signal",
});
const relationshipDecision = evaluateMemoryCandidate(relationshipCandidate);
assert.equal(relationshipDecision.reason, "relationship_signal_requires_review");
assert.equal(classifyAdmissionComparisonMismatch(legacy("fact", "confirmed"), classifyV2AdmissionSemantics(relationshipCandidate, relationshipDecision)), "authority_escalation");

const cancelledPlan = baseCandidate({
  candidateKind: "plan",
  epistemicStatus: "objective",
  planLifecycle: "cancelled",
  proposedAuthorityRole: "durable_candidate",
  resolvedAuthorityRole: "durable_candidate",
  temporal: { status: "future", recordedAt: 100 },
});
const cancelledDecision = evaluateMemoryCandidate(cancelledPlan);
assert.equal(cancelledDecision.reason, "cancelled_plan_not_active");
assert.equal(classifyAdmissionComparisonMismatch(legacy("plan"), classifyV2AdmissionSemantics(cancelledPlan, cancelledDecision)), "destination_divergence");

const claim = (kind: KnowledgeClaim["kind"], truthStatus: KnowledgeClaim["truthStatus"]): KnowledgeClaim => ({
  id: `claim-${kind}-${truthStatus}`,
  characterId: "character-1",
  relationId: "relation-1",
  userIdentityId: "identity-1",
  conversationId: "conversation-1",
  kind,
  subject: "user",
  statement: "用户认为角色并不在乎用户。",
  truthStatus,
  temporalStatus: "present",
  source: {
    kind: "user_message",
    authorship: "user",
    messageIds: ["message-1"],
    producer: "test",
    evidenceKey: "message-1:subjective",
  },
  confidence: truthStatus === "confirmed" ? 1 : 0.85,
  userConfirmed: truthStatus === "confirmed",
  recordedAt: 100,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
});

const observe = (legacyClaim: KnowledgeClaim) => observeDirectChatMemoryAdmissionShadow({
  extraction: {
    extractedMemories: [],
    acceptedClaims: [legacyClaim],
    rejectedCandidateCount: 0,
    structuredCandidatesV2: [{
      schemaVersion: 2,
      kind: "subjective_reflection",
      semanticFacet: "subjective_reflection",
      epistemicStatus: "subjective",
      authorityRole: "non_objective",
      temporalStatus: "present",
      statement: "用户认为角色并不在乎用户。",
      sourceMessageIds: ["message-1"],
      evidenceQuote: "我觉得他并不在乎我。",
    }],
    rejectedCandidates: [{
      decision: "accepted",
      stage: "knowledge_gate",
      reason: "accepted",
      candidateKind: legacyClaim.kind === "hypothesis" ? "belief" : legacyClaim.kind === "preference" ? "unknown" : legacyClaim.kind,
      sourceMessageCount: 1,
      temporalStatus: "present",
      correlationKey: buildMemoryShadowCorrelationKey(["message-1"], "present"),
    }],
  },
  scope: {
    characterId: "character-1",
    relationId: "relation-1",
    userIdentityId: "identity-1",
    conversationId: "conversation-1",
  },
  createCandidateId: () => "comparison-candidate",
  recordedAt: 100,
});

const safeRuntimeCase = observe(claim("belief", "asserted"));
assert.equal(safeRuntimeCase.observations[0]?.severity, "P2");
assert.equal(safeRuntimeCase.observations[0]?.mismatchClass, "safe_semantic_divergence");

const dangerousRuntimeCase = observe(claim("fact", "confirmed"));
assert.equal(dangerousRuntimeCase.observations[0]?.severity, "P1");
assert.equal(dangerousRuntimeCase.observations[0]?.mismatchClass, "authority_escalation");

console.log("PASS comparison-only legacy authority contract, safe semantic divergence, and dangerous escalation safeguards");
