import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { KnowledgeClaim, KnowledgeKind, TruthStatus } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { MemoryExtractionCandidateV2, MemoryExtractionRejectionDiagnostic } from "../src/domain/memory/memoryExtractionSchema";
import type { MemoryExtractionResult } from "../src/domain/memory/memoryTypes";
import { buildMemoryShadowCorrelationKey } from "../src/domain/memory/memoryShadowCorrelation";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { Character, Message } from "../src/types";
import { observeDirectChatMemoryAdmissionShadow } from "../src/features/chat/services/directChatMemoryAdmissionShadow";
import {
  clearDirectChatMemoryAdmissionShadowEvidence,
  configureDirectChatMemoryAdmissionShadowEvidence,
  exportDirectChatMemoryAdmissionShadowJson,
  recordDirectChatMemoryAdmissionShadowEvidence,
} from "../src/features/chat/services/directChatMemoryAdmissionShadowTelemetry";

const scope = {
  characterId: "bridge-character",
  relationId: "bridge-relation",
  userIdentityId: "bridge-user",
  conversationId: "bridge-conversation",
};

const sourceEnvelope = {
  ...scope,
  messageSources: [
    { messageId: "m1", role: "user" as const, actorId: scope.userIdentityId, timestamp: 100 },
    { messageId: "m2", role: "character" as const, actorId: scope.characterId, timestamp: 101 },
  ],
  allowedSourceMessageIds: ["m1", "m2"],
};

function claim(
  kind: KnowledgeKind,
  overrides: Partial<KnowledgeClaim> = {},
): KnowledgeClaim {
  return {
    id: `legacy-${kind}`,
    ...scope,
    kind,
    subject: "user",
    statement: `legacy ${kind} statement`,
    truthStatus: "confirmed",
    temporalStatus: kind === "plan" ? "future" : "present",
    source: {
      kind: "user_message",
      authorship: "user",
      messageIds: ["m1"],
      producer: "memory-extractor.chat.v1",
      evidenceKey: `legacy:${kind}:m1`,
    },
    confidence: 0.9,
    userConfirmed: false,
    recordedAt: 100,
    status: "active",
    visibility: "relation_private",
    schemaVersion: 1,
    ...overrides,
  };
}

function diagnosticFor(
  candidate: KnowledgeClaim,
  candidateKind: MemoryExtractionRejectionDiagnostic["candidateKind"] = candidate.kind as MemoryExtractionRejectionDiagnostic["candidateKind"],
  decision: MemoryExtractionRejectionDiagnostic["decision"] = "accepted",
): MemoryExtractionRejectionDiagnostic {
  return {
    decision,
    stage: "knowledge_gate",
    reason: decision === "accepted" ? "accepted" : "legacy_rejected",
    candidateKind,
    temporalStatus: candidate.temporalStatus,
    correlationKey: buildMemoryShadowCorrelationKey(candidate.source.messageIds || [], candidate.temporalStatus),
  };
}

function v2(overrides: Partial<MemoryExtractionCandidateV2> = {}): MemoryExtractionCandidateV2 {
  return {
    schemaVersion: 2,
    kind: "fact",
    epistemicStatus: "objective",
    authorityRole: "durable_candidate",
    actorRole: "user",
    targetRole: "character",
    statement: "v2 statement",
    temporalStatus: "present",
    sourceMessageIds: ["m1"],
    evidenceQuote: "source quote",
    ...overrides,
  };
}

function extraction(input: {
  claims?: readonly KnowledgeClaim[];
  v2Candidates?: readonly MemoryExtractionCandidateV2[];
  diagnostics?: readonly MemoryExtractionRejectionDiagnostic[];
  rejectedCandidateCount?: number;
} = {}): MemoryExtractionResult {
  const claims = input.claims || [];
  return {
    extractedMemories: [],
    acceptedClaims: Array.from(claims),
    rejectedCandidateCount: input.rejectedCandidateCount || 0,
    ...(input.v2Candidates ? { structuredCandidatesV2: Array.from(input.v2Candidates) } : {}),
    ...(input.diagnostics ? { rejectedCandidates: Array.from(input.diagnostics) } : { rejectedCandidates: claims.map((item) => diagnosticFor(item)) }),
    sourceEnvelope,
  };
}

let candidateSequence = 0;
function observe(input: {
  claims?: readonly KnowledgeClaim[];
  v2Candidates?: readonly MemoryExtractionCandidateV2[];
  diagnostics?: readonly MemoryExtractionRejectionDiagnostic[];
  rejectedCandidateCount?: number;
  inputScope?: typeof scope;
  inputEnvelope?: typeof sourceEnvelope;
  knownIdempotencyKeys?: ReadonlySet<string>;
}) {
  return observeDirectChatMemoryAdmissionShadow({
    extraction: extraction(input),
    scope: input.inputScope || scope,
    sourceEnvelope: input.inputEnvelope || sourceEnvelope,
    knownIdempotencyKeys: input.knownIdempotencyKeys,
    createCandidateId: () => `bridge-shadow-candidate-${++candidateSequence}`,
    recordedAt: 100,
  });
}

function oneBridgeObservation(result: ReturnType<typeof observe>) {
  assert.equal(result.bridgeShadow.observations.length, 1);
  return result.bridgeShadow.observations[0]!;
}

// 1. Confirmed objective fact -> one pure write proposal intent.
const objectiveClaim = claim("fact");
const objectiveResult = observe({ claims: [objectiveClaim], v2Candidates: [v2()] });
assert.equal(objectiveResult.bridgeShadow.failedOpen, false);
assert.equal(oneBridgeObservation(objectiveResult).bridgeCorrelation, "exact");
assert.equal(oneBridgeObservation(objectiveResult).bridgeState, "write_proposal");
assert.equal(objectiveResult.bridgeShadow.metrics.wouldWriteProposal, 1);

// 2. Asserted fact is not projected as confirmed objective.
const assertedFact = claim("fact", { id: "asserted-fact", truthStatus: "asserted" as TruthStatus });
const assertedObservation = oneBridgeObservation(observe({ claims: [assertedFact], v2Candidates: [v2()] }));
assert.equal(assertedObservation.legacyAuthorityClass, "user_assertion");
assert.equal(assertedObservation.legacyPolicySource, "legacy_claim_semantics");
assert.equal(assertedObservation.wouldWriteProposal, false);

// 3–5. Belief/hypothesis semantics remain cautious and never become Truth.
const belief = claim("belief", { id: "belief", truthStatus: "asserted" });
const subjectiveBelief = v2({ kind: "belief", epistemicStatus: "subjective", authorityRole: "non_objective" });
assert.equal(oneBridgeObservation(observe({ claims: [belief], v2Candidates: [subjectiveBelief] })).bridgeState, "legacy_passthrough");
const uncertainBelief = v2({ kind: "belief", epistemicStatus: "uncertain", authorityRole: "non_objective" });
assert.equal(oneBridgeObservation(observe({ claims: [belief], v2Candidates: [uncertainBelief] })).bridgeState, "review");
const hypothesis = claim("hypothesis", { id: "hypothesis", truthStatus: "inferred" });
assert.equal(oneBridgeObservation(observe({ claims: [hypothesis], v2Candidates: [v2({ kind: "belief", semanticFacet: "hypothesis", epistemicStatus: "uncertain", authorityRole: "non_objective" })] })).legacySemanticKind, "hypothesis");

// 6. Confirmed objective legacy fact versus subjective V2 is an authority veto.
const subjectiveFact = v2({ kind: "belief", epistemicStatus: "subjective", authorityRole: "non_objective" });
const subjectiveConflict = oneBridgeObservation(observe({ claims: [objectiveClaim], v2Candidates: [subjectiveFact] }));
assert.equal(subjectiveConflict.bridgeCorrelation, "conflict");
assert.equal(subjectiveConflict.bridgeState, "safety_veto");
assert.equal(subjectiveConflict.bridgeReason, "authority_conflict");
assert.equal(subjectiveConflict.conflictAnatomy?.legacy.truthStatus, "confirmed");
assert.equal(subjectiveConflict.conflictAnatomy?.legacy.durabilityProjection, "unknown");
assert.equal(subjectiveConflict.conflictAnatomy?.v2.epistemicStatus, "subjective");
assert.equal(subjectiveConflict.conflictAnatomy?.comparison.authorityConflict, true);
assert.equal(subjectiveConflict.conflictAnatomy?.comparison.unsafe, true);
assert.doesNotMatch(JSON.stringify(subjectiveConflict.conflictAnatomy), /statement|sourceMessageIds|candidateId|bridge-character|bridge-relation|bridge-user|bridge-conversation/u);

// 7–8. Preference lacks legacy durability; stable reviews, temporary vetoes.
const preference = claim("preference", { id: "preference", truthStatus: "asserted" });
const stablePreference = oneBridgeObservation(observe({ claims: [preference], v2Candidates: [v2({ semanticFacet: "preference", durability: "stable", epistemicStatus: "unknown", authorityRole: "non_objective" })] }));
assert.equal(stablePreference.legacyPolicySource, "unknown");
assert.equal(stablePreference.bridgeState, "review");
const temporaryPreference = oneBridgeObservation(observe({ claims: [preference], v2Candidates: [v2({ semanticFacet: "preference", durability: "temporary", epistemicStatus: "unknown", authorityRole: "transient" })] }));
assert.equal(temporaryPreference.bridgeState, "safety_veto");
assert.equal(temporaryPreference.bridgeReason, "temporary_preference_not_durable");

// 9–12. Plan lifecycle remains unknown on legacy; V2 lifecycle controls shadow action.
const plan = claim("plan", { id: "plan", truthStatus: "asserted" });
assert.equal(oneBridgeObservation(observe({ claims: [plan], v2Candidates: [v2({ kind: "plan", epistemicStatus: "unknown", authorityRole: "non_objective", planLifecycle: "active", temporalStatus: "future" })] })).bridgeState, "review");
const cancelledPlan = oneBridgeObservation(observe({ claims: [plan], v2Candidates: [v2({ kind: "plan", epistemicStatus: "unknown", authorityRole: "non_objective", planLifecycle: "cancelled", temporalStatus: "future" })] }));
assert.equal(cancelledPlan.bridgeState, "safety_veto");
assert.equal(cancelledPlan.bridgeReason, "cancelled_plan_not_active");
const completedPlan = oneBridgeObservation(observe({ claims: [plan], v2Candidates: [v2({ kind: "plan", epistemicStatus: "unknown", authorityRole: "non_objective", planLifecycle: "completed", temporalStatus: "future" })] }));
assert.equal(completedPlan.bridgeState, "safety_veto");
assert.equal(completedPlan.bridgeReason, "completed_plan_not_active");
const uncertainPlan = oneBridgeObservation(observe({ claims: [plan], v2Candidates: [v2({ kind: "plan", epistemicStatus: "unknown", authorityRole: "non_objective", planLifecycle: "uncertain", temporalStatus: "future" })] }));
assert.equal(uncertainPlan.bridgeState, "review");

// 13–14. Event/episodic/scene/relationship routing is additive and writer-free.
const eventClaim = claim("fact", { id: "event", kind: "event" as KnowledgeKind });
const event = oneBridgeObservation(observe({ claims: [eventClaim], v2Candidates: [v2({ kind: "event", epistemicStatus: "unknown", authorityRole: "unknown" })] }));
assert.equal(event.bridgeState, "route");
assert.equal(event.bridgeReason, "event_route");
const episodicClaim = claim("fact", { id: "episodic", kind: "episodic" as KnowledgeKind });
assert.equal(oneBridgeObservation(observe({ claims: [episodicClaim], v2Candidates: [v2({ kind: "episodic", epistemicStatus: "unknown", authorityRole: "unknown" })] })).bridgeState, "route");
const sceneConflict = oneBridgeObservation(observe({ claims: [objectiveClaim], v2Candidates: [v2({ kind: "scene_only", semanticFacet: "scene_only", epistemicStatus: "objective", authorityRole: "scene_only" })] }));
assert.equal(sceneConflict.bridgeState, "safety_veto");
const relationshipConflict = oneBridgeObservation(observe({ claims: [objectiveClaim], v2Candidates: [v2({ kind: "relationship_signal", semanticFacet: "relationship_signal", epistemicStatus: "unknown", authorityRole: "relationship_signal" })] }));
assert.equal(relationshipConflict.bridgeState, "safety_veto");

// 15–17. V2-only, legacy-only, ambiguous and duplicate cases are explicit.
assert.equal(oneBridgeObservation(observe({ v2Candidates: [v2()] })).bridgeCorrelation, "v2_only");
assert.equal(oneBridgeObservation(observe({ claims: [objectiveClaim] })).bridgeCorrelation, "legacy_only");
const ambiguous = observe({
  claims: [objectiveClaim],
  v2Candidates: [v2(), v2({ epistemicStatus: "subjective", authorityRole: "non_objective" })],
});
assert.equal(oneBridgeObservation(ambiguous).bridgeCorrelation, "ambiguous");
assert.equal(oneBridgeObservation(ambiguous).wouldWriteProposal, false);
const duplicate = observe({ claims: [objectiveClaim], v2Candidates: [v2(), v2({ statement: "same intent, different candidate" })] });
assert.equal(oneBridgeObservation(duplicate).bridgeCorrelation, "duplicate");
assert.equal(duplicate.bridgeShadow.metrics.wouldWriteProposal, 1);
const conflictingDuplicate = observe({
  claims: [objectiveClaim, claim("fact", { id: "objective-asserted", truthStatus: "asserted" })],
  v2Candidates: [v2(), v2({ epistemicStatus: "subjective", authorityRole: "non_objective" })],
});
assert.equal(oneBridgeObservation(conflictingDuplicate).bridgeCorrelation, "conflict");
assert.equal(oneBridgeObservation(conflictingDuplicate).bridgeReason, "conflicting_duplicate");

// 18–20. Scope/provenance/malformed metadata never become exact writes.
const scopeMismatch = observe({
  claims: [objectiveClaim],
  v2Candidates: [v2()],
  inputScope: { ...scope, conversationId: "other-conversation" },
});
assert.equal(scopeMismatch.bridgeShadow.metrics.wouldWriteProposal, 0);
assert.equal(scopeMismatch.bridgeShadow.observations.some((item) => item.bridgeCorrelation === "exact"), false);
const provenanceMismatch = observe({
  claims: [objectiveClaim],
  v2Candidates: [v2()],
  inputEnvelope: { ...sourceEnvelope, allowedSourceMessageIds: ["m2"] },
});
assert.equal(provenanceMismatch.bridgeShadow.metrics.wouldWriteProposal, 0);
assert.equal(provenanceMismatch.bridgeShadow.observations.some((item) => item.bridgeCorrelation === "exact"), false);
const malformed = observe({
  diagnostics: [],
  v2Candidates: [{ schemaVersion: 2, kind: "fact", statement: "", temporalStatus: "present", sourceMessageIds: [], evidenceQuote: "" } as MemoryExtractionCandidateV2],
});
assert.equal(malformed.bridgeShadow.failedOpen, false);
assert.equal(malformed.bridgeShadow.metrics.wouldWriteProposal, 0);

// Old reject + V2 accept remains a non-write review.
const rejected = observe({
  claims: [objectiveClaim],
  diagnostics: [diagnosticFor(objectiveClaim, "fact", "rejected")],
  v2Candidates: [v2()],
});
assert.equal(oneBridgeObservation(rejected).bridgeReason, "old_reject_new_accept");
assert.equal(rejected.bridgeShadow.metrics.wouldWriteProposal, 0);

// Reusing the real MemoryService-shaped extraction result does not alter legacy claims.
const character: Character = { id: scope.characterId, name: "角色", avatar: "", personality: "", backstory: "" };
const message: Message = {
  id: "m1",
  characterId: scope.characterId,
  relationId: scope.relationId,
  conversationId: scope.conversationId,
  sender: "user",
  content: "我确认这条事实。",
  timestamp: 100,
};
const extractionContext = {
  character,
  ...scope,
  recentMessages: [message],
  existingMemories: [],
  scenario: "chat" as const,
  apiKey: "test-only",
  model: "model-a",
  createId: () => "memory-id",
  currentTime: () => 100,
  formatContent: (items: readonly string[]) => items.join(";"),
};
const providerCandidate = {
  statement: "用户确认一条事实。",
  kind: "fact",
  subject: "user",
  temporalStatus: "present",
  sourceMessageIds: ["m1"],
  evidenceQuote: "我确认这条事实",
};
let providerCalls = 0;
const legacyExtraction = await MemoryService.extractMemories(extractionContext, async () => {
  providerCalls += 1;
  return { items: [providerCandidate] };
});
const shadowExtraction = await MemoryService.extractMemories({ ...extractionContext, enableAdmissionShadowObservation: true }, async () => {
  providerCalls += 1;
  return { items: [providerCandidate] };
});
assert.equal(providerCalls, 2, "one extraction request per run; bridge shadow does not add a Provider request");
assert.deepEqual(shadowExtraction.acceptedClaims, legacyExtraction.acceptedClaims);
assert.deepEqual(shadowExtraction.extractedMemories, legacyExtraction.extractedMemories);
assert.equal(shadowExtraction.rejectedCandidateCount, legacyExtraction.rejectedCandidateCount);

// Telemetry is additive, bounded, and metadata-only.
configureDirectChatMemoryAdmissionShadowEvidence({ enabled: true, explicitDebug: true, maxObservations: 10 });
clearDirectChatMemoryAdmissionShadowEvidence();
recordDirectChatMemoryAdmissionShadowEvidence({ scope, result: objectiveResult, evidenceOrigin: "synthetic" });
const exported = exportDirectChatMemoryAdmissionShadowJson();
const parsedExport = JSON.parse(exported) as { bridgeShadow: { metrics: { totalObservations: number; exactCount: number; wouldWriteProposal: number }; observations: unknown[] } };
assert.equal(parsedExport.bridgeShadow.metrics.totalObservations, 1);
assert.equal(parsedExport.bridgeShadow.metrics.exactCount, 1);
assert.equal(parsedExport.bridgeShadow.metrics.wouldWriteProposal, 1);
assert.equal(parsedExport.bridgeShadow.observations.length, 1);
assert.doesNotMatch(exported, /bridge-character|bridge-relation|bridge-user|bridge-conversation|m1|m2|legacy fact statement|v2 statement|candidateId|idempotencyKey|sourceMessageIds|evidenceQuote/u);
configureDirectChatMemoryAdmissionShadowEvidence({ enabled: false, explicitDebug: true });
clearDirectChatMemoryAdmissionShadowEvidence();

// The only production integration import is the approved shadow adapter seam.
const shadowSource = readFileSync(new URL("../src/features/chat/services/directChatMemoryAdmissionShadow.ts", import.meta.url), "utf8");
assert.match(shadowSource, /observeDirectChatMemoryAdmissionBridgeShadow/u);
const hookSource = readFileSync(new URL("../src/features/chat/hooks/useChatMemoryExtraction.ts", import.meta.url), "utf8");
assert.match(hookSource, /observationPathEligible = isAutomaticDirectChat \|\| manualMessagesOverride === undefined/u);
assert.match(hookSource, /admissionShadowEnabled = observationPathEligible && isDirectChatMemoryAdmissionShadowEvidenceEnabled/u);
assert.doesNotMatch(hookSource, /MemoryExtractor.*bridge/isu);
assert.match(hookSource, /applyDirectChatMemorySafetyVetoCanary[\s\S]*canaryFilteredAcceptedClaims/u);
assert.doesNotMatch(hookSource, /commitMemoryWriteBundle\(\{\s*claims:\s*shadowResult\.bridgeShadow/isu);

console.log("PASS Stage 4D-10C synthetic production-shaped bridge shadow integration, metadata projection, veto metrics, privacy, fail-open and legacy equivalence contract");
