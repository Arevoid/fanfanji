import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { MemoryAdmissionDecision } from "../src/domain/memory/memoryAdmission";
import type { MemoryCandidate } from "../src/domain/memory/memoryCandidate";
import {
  decideDirectChatMemoryBridge,
  matchDirectChatMemoryCandidates,
  type DirectChatMemoryBridgeRuntimeContext,
  type DirectChatMemoryLegacyCandidate,
  type DirectChatMemoryV2Candidate,
} from "../src/features/chat/services/directChatMemoryAdmissionBridge";
import { buildMemoryCandidateIdempotencyKey } from "../src/domain/memory/memoryCandidate";
import { buildMemoryShadowCorrelationKey } from "../src/domain/memory/memoryShadowCorrelation";

const runtime: DirectChatMemoryBridgeRuntimeContext = {
  scope: {
    characterId: "character-1",
    relationId: "relation-1",
    userIdentityId: "identity-1",
    conversationId: "conversation-1",
  },
  allowedSourceRefs: ["m1", "m2"],
  trustedProvenance: true,
};

const policy = (overrides: Partial<DirectChatMemoryLegacyCandidate["policy"]> = {}): DirectChatMemoryLegacyCandidate["policy"] => ({
  epistemicStatus: "objective",
  durability: "stable",
  planLifecycle: "unknown",
  resolvedAuthorityRole: "durable_candidate",
  ...overrides,
});

const legacy = (overrides: Partial<DirectChatMemoryLegacyCandidate> = {}): DirectChatMemoryLegacyCandidate => ({
  id: "legacy-1",
  diagnostic: {
    decision: "accepted",
    reason: "accepted",
    candidateKind: "fact",
    temporalStatus: "present",
    correlationKey: buildMemoryShadowCorrelationKey(["m1"], "present"),
  },
  candidateKind: "fact",
  temporalStatus: "present",
  sourceRefs: ["m1"],
  scope: runtime.scope,
  provenanceTrusted: true,
  provenance: { producer: "memory-extractor.chat.v1", sourceType: "user_message" },
  policy: policy(),
  ...overrides,
});

const v2 = (overrides: Partial<MemoryCandidate> = {}, decisionOverrides: Partial<MemoryAdmissionDecision> = {}): DirectChatMemoryV2Candidate => {
  const candidate: MemoryCandidate = {
    schemaVersion: 1,
    candidateId: "v2-1",
    candidateKind: "fact",
    metadataSource: "v2",
    epistemicStatus: "objective",
    durability: "stable",
    proposedAuthorityRole: "durable_candidate",
    resolvedAuthorityRole: "durable_candidate",
    statement: "第一种表述",
    scope: runtime.scope,
    provenance: {
      producer: "direct_chat",
      sourceType: "user_message",
      authorship: "user",
      sourceMessageIds: ["m1"],
      conversationId: runtime.scope.conversationId,
    },
    evidence: { sourceMessageIds: ["m1"], evidenceKey: "evidence:m1" },
    temporal: { status: "present", recordedAt: 100 },
    ...overrides,
  };
  return {
    candidate,
    decision: {
      state: "accepted",
      reason: "accepted_fact",
      candidateId: candidate.candidateId,
      idempotencyKey: buildMemoryCandidateIdempotencyKey(candidate),
      target: "truth",
      authority: "candidate_only",
      ...decisionOverrides,
    },
    runtime,
  };
};

const match = (legacyCandidates: readonly DirectChatMemoryLegacyCandidate[], v2Candidates: readonly DirectChatMemoryV2Candidate[]) =>
  matchDirectChatMemoryCandidates({ legacy: legacyCandidates, v2: v2Candidates, runtime });

const decide = (legacyCandidates: readonly DirectChatMemoryLegacyCandidate[], v2Candidates: readonly DirectChatMemoryV2Candidate[], knownIdempotencyKeys?: ReadonlySet<string>) => {
  const result = match(legacyCandidates, v2Candidates);
  assert.equal(result.matches.length, 1);
  return decideDirectChatMemoryBridge(result.matches[0]!, { runtime, knownIdempotencyKeys });
};

const objective = v2();
const exactResult = match([legacy()], [objective]);
assert.equal(exactResult.matches[0]?.correlation, "exact");
assert.equal(decide([legacy()], [objective]).state, "write_proposal");

// Policy dimensions are not identity dimensions: the same source candidate
// remains paired when epistemic status conflicts.
const subjective = v2({
  candidateId: "v2-subjective",
  candidateKind: "belief",
  epistemicStatus: "subjective",
  proposedAuthorityRole: "non_objective",
  resolvedAuthorityRole: "non_objective",
}, { state: "rejected", reason: "subjective_not_objective_truth", target: undefined });
const authorityConflict = match([legacy()], [subjective]);
assert.equal(authorityConflict.matches[0]?.correlation, "conflict");
assert.equal(decide([legacy()], [subjective]).state, "safety_veto");

const legacyBelief = legacy({ candidateKind: "belief", diagnostic: { ...legacy().diagnostic, candidateKind: "belief" }, policy: policy({ epistemicStatus: "subjective", resolvedAuthorityRole: "non_objective" }) });
assert.equal(decide([legacyBelief], [subjective]).state, "legacy_passthrough");

const rejectedLegacy = legacy({ diagnostic: { ...legacy().diagnostic, decision: "rejected", reason: "legacy_rejected" } });
assert.equal(decide([rejectedLegacy], [objective]).state, "review");
assert.equal(decide([rejectedLegacy], [objective]).reason, "old_reject_new_accept");

const v2Only = match([], [objective]);
assert.equal(v2Only.matches[0]?.correlation, "v2_only");
assert.equal(decide([], [objective]).state, "review");
const legacyOnly = match([legacy()], []);
assert.equal(legacyOnly.matches[0]?.correlation, "legacy_only");
assert.equal(decide([legacy()], []).state, "legacy_passthrough");

const ambiguousV2 = v2({ candidateId: "v2-2", statement: "第二种表述", epistemicStatus: "subjective", proposedAuthorityRole: "non_objective", resolvedAuthorityRole: "non_objective" }, { state: "rejected", reason: "subjective_not_objective_truth", target: undefined });
const ambiguous = match([legacy()], [objective, ambiguousV2]);
assert.equal(ambiguous.matches[0]?.correlation, "ambiguous");
assert.equal(decide([legacy()], [objective, ambiguousV2]).state, "review");
const ambiguousLegacy = match(
  [legacy(), legacy({ id: "legacy-2", policy: policy({ epistemicStatus: "subjective", resolvedAuthorityRole: "non_objective" }) })],
  [objective],
);
assert.equal(ambiguousLegacy.matches[0]?.correlation, "ambiguous");

const duplicate = match([legacy()], [objective, v2({ candidateId: "v2-duplicate" })]);
// Same structural/policy identity produces one logical proposal.
assert.equal(duplicate.matches[0]?.correlation, "duplicate");
const duplicateDecision = decide([legacy()], [objective, v2({ candidateId: "v2-duplicate" })]);
assert.equal(duplicateDecision.state, "write_proposal");
if (duplicateDecision.state === "write_proposal") {
  assert.equal(decide([legacy()], [objective, v2({ candidateId: "v2-duplicate" })], new Set([duplicateDecision.proposal.idempotencyKey])).reason, "duplicate_same_intent");
}

const conflictingDuplicate = match(
  [legacy({ id: "legacy-1" }), legacy({ id: "legacy-2", policy: policy({ epistemicStatus: "subjective", resolvedAuthorityRole: "non_objective" }) })],
  [objective, v2({ candidateId: "v2-conflict", epistemicStatus: "subjective", proposedAuthorityRole: "non_objective", resolvedAuthorityRole: "non_objective" }, { state: "rejected", reason: "subjective_not_objective_truth", target: undefined })],
);
assert.equal(conflictingDuplicate.matches[0]?.correlation, "conflict");
assert.equal(decideDirectChatMemoryBridge(conflictingDuplicate.matches[0]!, { runtime }).reason, "conflicting_duplicate");

const event = v2({ candidateId: "event-1", candidateKind: "event", epistemicStatus: "objective" }, { reason: "accepted_event", target: "event" });
assert.deepEqual(decide([legacy({ candidateKind: "event", diagnostic: { ...legacy().diagnostic, candidateKind: "event" } })], [event]), { state: "route", reason: "event_route", correlation: "exact", destination: "event" });
const episodic = v2({ candidateId: "episodic-1", candidateKind: "episodic" }, { reason: "accepted_episodic", target: "episodic" });
assert.equal(decide([legacy({ candidateKind: "episodic", diagnostic: { ...legacy().diagnostic, candidateKind: "episodic" } })], [episodic]).state, "route");

const stablePreference = v2({ semanticFacet: "preference" }, { state: "needs_review", reason: "stable_preference_requires_review", target: undefined });
assert.equal(decide([legacy({ candidateKind: "preference" })], [stablePreference]).reason, "stable_preference_review");
const temporaryPreference = v2({ semanticFacet: "preference", durability: "temporary", resolvedAuthorityRole: "transient" }, { state: "needs_review", reason: "temporary_preference_not_durable", target: undefined });
assert.equal(decide([legacy({ candidateKind: "preference", policy: policy({ durability: "stable" }) })], [temporaryPreference]).state, "safety_veto");
const cancelledPlan = v2({ candidateKind: "plan", planLifecycle: "cancelled" }, { state: "rejected", reason: "cancelled_plan_not_active", target: undefined });
const cancelledPlanMatch = match([legacy({ candidateKind: "plan", diagnostic: { ...legacy().diagnostic, candidateKind: "plan" }, policy: policy({ planLifecycle: "active" }) })], [cancelledPlan]);
assert.equal(cancelledPlanMatch.matches[0]?.correlation, "conflict");
assert.equal(decide([legacy({ candidateKind: "plan", diagnostic: { ...legacy().diagnostic, candidateKind: "plan" }, policy: policy({ planLifecycle: "active" }) })], [cancelledPlan]).state, "safety_veto");
const completedPlan = v2({ candidateKind: "plan", planLifecycle: "completed" }, { state: "rejected", reason: "completed_plan_not_active", target: undefined });
assert.equal(decide([legacy({ candidateKind: "plan", diagnostic: { ...legacy().diagnostic, candidateKind: "plan" }, policy: policy({ planLifecycle: "active" }) })], [completedPlan]).state, "safety_veto");
const uncertainPlan = v2({ candidateKind: "plan", planLifecycle: "uncertain" }, { state: "needs_review", reason: "uncertain_plan_requires_review", target: undefined });
assert.equal(decide([legacy({ candidateKind: "plan", diagnostic: { ...legacy().diagnostic, candidateKind: "plan" } })], [uncertainPlan]).reason, "uncertain_plan_review");

const scene = v2({ candidateId: "scene-1", candidateKind: "scene_only", epistemicStatus: "objective", proposedAuthorityRole: "scene_only", resolvedAuthorityRole: "scene_only" }, { state: "rejected", reason: "scene_only_not_truth", target: undefined });
assert.equal(decide([legacy()], [scene]).state, "safety_veto");
assert.equal(decide([legacy({ candidateKind: "scene_only", diagnostic: { ...legacy().diagnostic, candidateKind: "scene_only" }, policy: policy({ resolvedAuthorityRole: "scene_only" }) })], [scene]).state, "reject");
const relationship = v2({ candidateId: "relationship-1", candidateKind: "relationship_signal", proposedAuthorityRole: "relationship_signal", resolvedAuthorityRole: "relationship_signal" }, { state: "needs_review", reason: "relationship_signal_requires_review", target: undefined });
assert.equal(decide([legacy()], [relationship]).state, "safety_veto");
assert.equal(decide([legacy({ candidateKind: "relationship_signal", diagnostic: { ...legacy().diagnostic, candidateKind: "relationship_signal" }, policy: policy({ resolvedAuthorityRole: "relationship_signal" }) })], [relationship]).state, "route");
const unknown = v2({ candidateId: "unknown-1", candidateKind: "unknown", epistemicStatus: "unknown", proposedAuthorityRole: "unknown", resolvedAuthorityRole: "unknown" }, { state: "rejected", reason: "unsupported_kind", target: undefined });
assert.equal(decide([legacy({ candidateKind: "unknown", diagnostic: { ...legacy().diagnostic, candidateKind: "unknown" }, policy: policy({ epistemicStatus: "unknown", durability: "unknown", resolvedAuthorityRole: "unknown" }) })], [unknown]).reason, "unknown_semantics");

// Source references are canonicalized and statement text is not identity.
const reordered = v2({ candidateId: "reordered", statement: "改写后的同一命题", provenance: { ...objective.candidate.provenance, sourceMessageIds: ["m1"] }, evidence: { sourceMessageIds: ["m1"], evidenceKey: "evidence:m1" } });
assert.equal(match([legacy()], [reordered]).matches[0]?.correlation, "exact");
assert.equal(buildMemoryCandidateIdempotencyKey(objective.candidate), buildMemoryCandidateIdempotencyKey(reordered.candidate));
const noisyRefs = v2({ candidateId: "noisy-refs", provenance: { ...objective.candidate.provenance, sourceMessageIds: ["m1", "m1"] }, evidence: { sourceMessageIds: ["m1", "m1"], evidenceKey: "evidence:m1" } });
assert.equal(match([legacy()], [noisyRefs]).matches[0]?.correlation, "exact");
assert.equal(buildMemoryShadowCorrelationKey(["m1", "m2"], "present"), buildMemoryShadowCorrelationKey(["m2", "m1", "m2"], "present"));

const temporalMismatch = match([legacy()], [v2({ temporal: { status: "future", recordedAt: 100 }, candidateId: "future" })]);
assert.equal(temporalMismatch.matches.some((item) => item.correlation === "exact"), false);
const scopeMismatch = match([legacy()], [v2({ scope: { ...runtime.scope, conversationId: "conversation-2" }, candidateId: "scope-mismatch" })]);
assert.equal(scopeMismatch.matches.some((item) => item.correlation === "exact"), false);
const untrusted = v2({ candidateId: "untrusted" });
untrusted.runtime.trustedProvenance = false;
const provenanceMismatch = match([legacy()], [untrusted]);
assert.equal(provenanceMismatch.matches.some((item) => item.correlation === "exact"), false);

// Production import isolation: only the approved shadow adapter may import the
// pure bridge module. The shadow adapter itself remains observation-only.
function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? listSourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}
const bridgeModule = "directChatMemoryAdmissionBridge";
const approvedIntegration = "directChatMemoryAdmissionBridgeShadow.ts";
const bridgeImport = /(?:from|import\()\s*["'][^"']*directChatMemoryAdmissionBridge["']/u;
listSourceFiles(resolve(process.cwd(), "src")).filter((path) => !path.endsWith(`${bridgeModule}.ts`)).forEach((path) => {
  const source = readFileSync(path, "utf8");
  if (path.endsWith(approvedIntegration)) {
    assert.match(source, bridgeImport, `approved shadow adapter must import ${bridgeModule}: ${path}`);
  } else {
    assert.doesNotMatch(source, bridgeImport, `production file must not import ${bridgeModule} directly: ${path}`);
  }
});

console.log("PASS Stage 4D-10B pure matcher, bridge decision, safety-veto, idempotency, replay and import isolation contract");
