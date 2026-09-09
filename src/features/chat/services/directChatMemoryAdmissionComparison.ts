import type { KnowledgeClaim, TruthStatus } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type {
  MemoryAdmissionDecision,
  MemoryAdmissionState,
} from "../../../domain/memory/memoryAdmission";
import type { MemoryCandidate, MemoryCandidateKind } from "../../../domain/memory/memoryCandidate";
import type { MemoryExtractionCandidateDecision } from "../../../domain/memory/memoryExtractionSchema";

export type MemoryAdmissionComparisonSemanticKind =
  | MemoryCandidateKind
  | "preference"
  | "hypothesis"
  | "unknown";

export type MemoryAdmissionComparisonDestinationClass =
  | "confirmed_fact"
  | "user_assertion"
  | "belief_hypothesis"
  | "preference"
  | "future_plan"
  | "event"
  | "episodic"
  | "scene_only"
  | "relationship_review"
  | "rejected"
  | "needs_review"
  | "unknown";

export type MemoryAdmissionComparisonAuthorityClass =
  | "objective_truth"
  | "user_assertion"
  | "non_objective_belief"
  | "preference_candidate"
  | "future_plan"
  | "relationship_review"
  | "none"
  | "unknown";

export type MemoryAdmissionComparisonWriteEligibility =
  | "canonical_write"
  | "not_write_eligible"
  | "needs_review"
  | "unknown";

export interface MemoryAdmissionComparisonSemantics {
  semanticKind: MemoryAdmissionComparisonSemanticKind;
  destinationClass: MemoryAdmissionComparisonDestinationClass;
  authorityClass: MemoryAdmissionComparisonAuthorityClass;
  writeEligibility: MemoryAdmissionComparisonWriteEligibility;
}

export type MemoryAdmissionComparisonMismatchClass =
  | "none"
  | "safe_semantic_divergence"
  | "authority_escalation"
  | "destination_divergence"
  | "write_eligibility_divergence"
  | "incomparable";

export interface LegacyAdmissionComparisonInput {
  decision: MemoryExtractionCandidateDecision;
  candidateKind?: MemoryAdmissionComparisonSemanticKind;
  truthStatus?: TruthStatus;
}

const objectiveTruthStatuses = new Set<TruthStatus>(["confirmed"]);
const nonObjectiveTruthStatuses = new Set<TruthStatus>(["asserted", "inferred", "legacy_unverified"]);

const legacySemanticKind = (
  candidateKind: MemoryAdmissionComparisonSemanticKind | undefined,
  claim?: KnowledgeClaim,
): MemoryAdmissionComparisonSemanticKind => {
  if (claim?.kind === "preference") return "preference";
  if (claim?.kind === "hypothesis") return "hypothesis";
  if (claim?.kind) return claim.kind;
  if (candidateKind === "unknown" || candidateKind === undefined) return "unknown";
  return candidateKind;
};

const legacyRejectedSemantics = (
  input: LegacyAdmissionComparisonInput,
): MemoryAdmissionComparisonSemantics => ({
  semanticKind: legacySemanticKind(input.candidateKind),
  destinationClass: input.decision === "rejected" ? "rejected" : "unknown",
  authorityClass: "none",
  writeEligibility: input.decision === "rejected" ? "not_write_eligible" : "unknown",
});

/**
 * Comparison-only projection of an existing legacy diagnostic/claim. It does
 * not change the legacy write policy or any persisted schema.
 */
export function classifyLegacyAdmissionSemantics(
  input: LegacyAdmissionComparisonInput,
  claim?: KnowledgeClaim,
): MemoryAdmissionComparisonSemantics {
  if (input.decision !== "accepted") return legacyRejectedSemantics(input);
  const semanticKind = legacySemanticKind(input.candidateKind, claim);
  const truthStatus = input.truthStatus || claim?.truthStatus;
  if (semanticKind === "fact") {
    if (objectiveTruthStatuses.has(truthStatus as TruthStatus)) {
      return { semanticKind, destinationClass: "confirmed_fact", authorityClass: "objective_truth", writeEligibility: "canonical_write" };
    }
    if (nonObjectiveTruthStatuses.has(truthStatus as TruthStatus)) {
      return { semanticKind, destinationClass: "user_assertion", authorityClass: "user_assertion", writeEligibility: "canonical_write" };
    }
    return { semanticKind, destinationClass: "unknown", authorityClass: "unknown", writeEligibility: "canonical_write" };
  }
  if (semanticKind === "belief" || semanticKind === "hypothesis") {
    return { semanticKind, destinationClass: "belief_hypothesis", authorityClass: "non_objective_belief", writeEligibility: "canonical_write" };
  }
  if (semanticKind === "preference") {
    return { semanticKind, destinationClass: "preference", authorityClass: "preference_candidate", writeEligibility: "canonical_write" };
  }
  if (semanticKind === "plan") {
    return { semanticKind, destinationClass: "future_plan", authorityClass: "future_plan", writeEligibility: "canonical_write" };
  }
  if (semanticKind === "event") {
    return { semanticKind, destinationClass: "event", authorityClass: "unknown", writeEligibility: "canonical_write" };
  }
  if (semanticKind === "episodic") {
    return { semanticKind, destinationClass: "episodic", authorityClass: "unknown", writeEligibility: "canonical_write" };
  }
  return { semanticKind, destinationClass: "unknown", authorityClass: "unknown", writeEligibility: "canonical_write" };
}

const v2SemanticKind = (candidate: MemoryCandidate): MemoryAdmissionComparisonSemanticKind => {
  if (candidate.semanticFacet === "preference") return "preference";
  if (candidate.semanticFacet === "hypothesis") return "hypothesis";
  return candidate.candidateKind;
};

const rejectedV2Semantics = (
  candidate: MemoryCandidate,
  decision: MemoryAdmissionDecision,
): MemoryAdmissionComparisonSemantics => {
  const semanticKind = v2SemanticKind(candidate);
  const destinationClass = decision.reason === "scene_only" || decision.reason === "scene_only_not_truth"
    ? "scene_only"
    : decision.reason === "relationship_signal_requires_review"
      ? "relationship_review"
      : decision.state === "needs_review"
        ? "needs_review"
        : "rejected";
  const authorityClass = candidate.epistemicStatus === "subjective"
    || candidate.resolvedAuthorityRole === "non_objective"
    || semanticKind === "subjective_reflection"
    || semanticKind === "belief"
    || semanticKind === "hypothesis"
    ? "non_objective_belief"
    : decision.reason === "relationship_signal_requires_review"
      ? "relationship_review"
      : "none";
  return {
    semanticKind,
    destinationClass,
    authorityClass,
    writeEligibility: decision.state === "needs_review" ? "needs_review" : "not_write_eligible",
  };
};

/** Comparison-only projection of the existing V2 AdmissionDecision. */
export function classifyV2AdmissionSemantics(
  candidate: MemoryCandidate,
  decision: MemoryAdmissionDecision,
): MemoryAdmissionComparisonSemantics {
  const semanticKind = v2SemanticKind(candidate);
  if (decision.state !== "accepted") return rejectedV2Semantics(candidate, decision);
  if (semanticKind === "fact" && candidate.epistemicStatus === "objective") {
    return { semanticKind, destinationClass: "confirmed_fact", authorityClass: "objective_truth", writeEligibility: "canonical_write" };
  }
  if (semanticKind === "fact") {
    return { semanticKind, destinationClass: "user_assertion", authorityClass: "user_assertion", writeEligibility: "canonical_write" };
  }
  if (semanticKind === "belief" || semanticKind === "hypothesis") {
    return { semanticKind, destinationClass: "belief_hypothesis", authorityClass: "non_objective_belief", writeEligibility: "canonical_write" };
  }
  if (semanticKind === "preference") {
    return { semanticKind, destinationClass: "preference", authorityClass: "preference_candidate", writeEligibility: "canonical_write" };
  }
  if (semanticKind === "plan") {
    return { semanticKind, destinationClass: "future_plan", authorityClass: "future_plan", writeEligibility: "canonical_write" };
  }
  if (semanticKind === "event") {
    return { semanticKind, destinationClass: "event", authorityClass: "unknown", writeEligibility: "canonical_write" };
  }
  if (semanticKind === "episodic") {
    return { semanticKind, destinationClass: "episodic", authorityClass: "unknown", writeEligibility: "canonical_write" };
  }
  return { semanticKind, destinationClass: "unknown", authorityClass: "unknown", writeEligibility: "canonical_write" };
}

const isObjectiveAuthority = (value: MemoryAdmissionComparisonSemantics): boolean =>
  value.authorityClass === "objective_truth" && value.destinationClass === "confirmed_fact";

const isNonObjectiveAuthority = (value: MemoryAdmissionComparisonSemantics): boolean =>
  value.authorityClass === "non_objective_belief"
  || value.authorityClass === "user_assertion"
  || value.authorityClass === "preference_candidate"
  || value.authorityClass === "future_plan";

/**
 * Compare semantic destinations and authority, not just the old allow/reject
 * Boolean. The legacy mismatch field remains separately available for
 * telemetry compatibility.
 */
export function classifyAdmissionComparisonMismatch(
  legacy: MemoryAdmissionComparisonSemantics | undefined,
  v2: MemoryAdmissionComparisonSemantics | undefined,
): MemoryAdmissionComparisonMismatchClass {
  if (!legacy || !v2 || legacy.destinationClass === "unknown" || v2.destinationClass === "unknown") return "incomparable";
  if (isObjectiveAuthority(legacy) && !isObjectiveAuthority(v2)) return "authority_escalation";
  if (legacy.destinationClass === "future_plan"
    && (v2.destinationClass === "rejected" || v2.destinationClass === "needs_review")
    && v2.semanticKind === "plan") return "destination_divergence";
  if (legacy.authorityClass === "non_objective_belief" && v2.authorityClass === "non_objective_belief") {
    if (legacy.writeEligibility !== v2.writeEligibility || legacy.destinationClass !== v2.destinationClass) return "safe_semantic_divergence";
    return "none";
  }
  if (legacy.writeEligibility !== v2.writeEligibility) {
    return isNonObjectiveAuthority(legacy) && isNonObjectiveAuthority(v2)
      ? "safe_semantic_divergence"
      : "write_eligibility_divergence";
  }
  if (legacy.destinationClass !== v2.destinationClass || legacy.authorityClass !== v2.authorityClass) return "destination_divergence";
  return "none";
}

export function legacyClaimMatchesDiagnostic(
  claim: KnowledgeClaim,
  diagnosticKind: MemoryCandidateKind | undefined,
): boolean {
  if (!diagnosticKind || diagnosticKind === "unknown") return true;
  if (diagnosticKind === "belief") return claim.kind === "belief" || claim.kind === "hypothesis";
  return claim.kind === diagnosticKind;
}

export type { MemoryAdmissionState };
