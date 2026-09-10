type DirectChatMemoryBridgeState =
  | "legacy_passthrough"
  | "write_proposal"
  | "review"
  | "reject"
  | "route"
  | "safety_veto";
type DirectChatMemoryBridgeReason = string;
type DirectChatMemoryCorrelationState = string;
type DirectChatMemoryLineageStatus = "shared" | "partial" | "mismatch" | "absent";

export const APPROVED_DIRECT_CHAT_SAFETY_VETO_REASONS = [
  "SAFETY_VETO_CANCELLED_PLAN",
  "SAFETY_VETO_TEMPORARY_PREFERENCE",
] as const;

export type ApprovedDirectChatSafetyVetoReason =
  typeof APPROVED_DIRECT_CHAT_SAFETY_VETO_REASONS[number];

export type DirectChatSafetyVetoValidation =
  | { result: "allow_veto"; reason: ApprovedDirectChatSafetyVetoReason }
  | { result: "deny_veto"; reason: string }
  | { result: "insufficient"; reason: string };

export type DirectChatSafetyVetoFeatureScope =
  | "automatic_direct_chat"
  | "group"
  | "offline"
  | "manual"
  | "other";

export type DirectChatSafetyVetoMetadataSource =
  | "v2_model_native"
  | "legacy_claim_semantics"
  | "legacy_policy_derived"
  | "runtime_owned"
  | "unknown";

export interface DirectChatSafetyVetoLegacyInput {
  accepted: boolean;
  semanticKind: string;
  /** The existing legacy candidate would reach canonical durable storage. */
  writeEligibility: "canonical_write" | "not_write_eligible" | "needs_review" | "unknown";
}

export interface DirectChatSafetyVetoV2Input {
  semanticKind: string;
  durability?: "stable" | "temporary" | "unknown";
  planLifecycle?: "active" | "cancelled" | "uncertain" | "completed" | "unknown";
  metadataSource: DirectChatSafetyVetoMetadataSource;
}

export interface DirectChatSafetyVetoCorrelationInput {
  /** Only shared parser-owned lineage is accepted by this first validator. */
  lineageStatus: DirectChatMemoryLineageStatus;
  /** Runtime lineage is the current operation identity in this contract. */
  sameExtractionOperation: boolean;
  pairUnique: boolean;
  ambiguous: boolean;
  duplicate: boolean;
  staleOperation: boolean;
}

export interface DirectChatSafetyVetoInput {
  featureScope: DirectChatSafetyVetoFeatureScope;
  legacy?: DirectChatSafetyVetoLegacyInput;
  v2?: DirectChatSafetyVetoV2Input;
  bridgeState: DirectChatMemoryBridgeState;
  bridgeReason: DirectChatMemoryBridgeReason | string;
  correlationState: DirectChatMemoryCorrelationState | string;
  correlation: DirectChatSafetyVetoCorrelationInput;
  exactScope: boolean;
  trustedProvenance: boolean;
}

const APPROVED_REASON_BY_BRIDGE_REASON: Readonly<Partial<Record<string, ApprovedDirectChatSafetyVetoReason>>> = {
  cancelled_plan_not_active: "SAFETY_VETO_CANCELLED_PLAN",
  temporary_preference_not_durable: "SAFETY_VETO_TEMPORARY_PREFERENCE",
};

const deny = (reason: string): DirectChatSafetyVetoValidation => ({ result: "deny_veto", reason });
const insufficient = (reason: string): DirectChatSafetyVetoValidation => ({ result: "insufficient", reason });

const isUncertainCorrelation = (input: DirectChatSafetyVetoInput): boolean => {
  const correlation = input.correlation;
  return correlation.lineageStatus !== "shared"
    || !correlation.sameExtractionOperation
    || !correlation.pairUnique
    || correlation.ambiguous
    || correlation.duplicate
    || correlation.staleOperation
    || input.correlationState === "ambiguous"
    || input.correlationState === "duplicate"
    || input.correlationState === "v2_only"
    || input.correlationState === "unmatched_v2"
    || input.correlationState === "unmatched_legacy";
};

/**
 * Pure, candidate-local safety-veto validator.
 *
 * The function has no storage, Provider, Prompt, React, cursor, or writer
 * dependency. `deny_veto` and `insufficient` both preserve the existing
 * legacy decision when consumed by a future shadow/canary adapter.
 */
export function validateDirectChatSafetyVeto(
  input: DirectChatSafetyVetoInput,
): DirectChatSafetyVetoValidation {
  try {
    if (input.featureScope !== "automatic_direct_chat") return deny("feature_scope_not_eligible");
    if (!input.legacy || !input.v2) return deny("legacy_or_v2_candidate_missing");
    if (!input.legacy.accepted) return deny("legacy_rejected");
    if (input.bridgeState !== "safety_veto") return deny("bridge_not_safety_veto");
    // Completed-plan safety veto is explicitly disabled in the first contract
    // even though it is a known Bridge reason.
    if (input.bridgeReason === "completed_plan_not_active") return deny("predicate_disabled");

    const approvedReason = APPROVED_REASON_BY_BRIDGE_REASON[input.bridgeReason];
    if (!approvedReason) return deny("reason_not_allowlisted");

    if (isUncertainCorrelation(input)) {
      return insufficient("correlation_not_reliable");
    }
    if (!input.exactScope) return insufficient("scope_not_exact");
    if (!input.trustedProvenance) return insufficient("provenance_not_trusted");
    if (input.legacy.writeEligibility !== "canonical_write") return deny("legacy_not_write_eligible");
    if (input.v2.metadataSource !== "v2_model_native") return insufficient("v2_metadata_not_trusted");

    if (approvedReason === "SAFETY_VETO_CANCELLED_PLAN") {
      if (input.legacy.semanticKind !== "plan" || input.v2.semanticKind !== "plan") {
        return deny("cancelled_plan_semantic_mismatch");
      }
      if (input.v2.planLifecycle !== "cancelled") return deny("cancelled_plan_predicate_failed");
      return { result: "allow_veto", reason: approvedReason };
    }

    if (input.legacy.semanticKind !== "preference" || input.v2.semanticKind !== "preference") {
      return deny("temporary_preference_semantic_mismatch");
    }
    if (input.v2.durability !== "temporary") return deny("temporary_preference_predicate_failed");
    return { result: "allow_veto", reason: approvedReason };
  } catch {
    // A future shadow caller also catches around this pure boundary. Keeping
    // the pure function total makes malformed test/runtime DTOs fail open.
    return insufficient("validator_error_fail_open");
  }
}

export function isApprovedDirectChatSafetyVetoReason(
  value: string,
): value is ApprovedDirectChatSafetyVetoReason {
  return (APPROVED_DIRECT_CHAT_SAFETY_VETO_REASONS as readonly string[]).includes(value);
}
