import {
  buildMemoryCandidateIdempotencyKey,
  hasTraceableMemoryCandidateProvenance,
  isValidMemoryCandidateConfidence,
  isValidMemoryCandidateImportance,
  MEMORY_CANDIDATE_SCHEMA_VERSION,
  type MemoryCandidate,
  type MemoryCandidateAuthorityRole,
  type MemoryCandidateKind,
  type MemoryCandidateProducer,
} from "./memoryCandidate";

export type MemoryAdmissionTarget = "truth" | "event" | "episodic" | "belief";
export type MemoryAdmissionState = "accepted" | "rejected" | "deferred" | "duplicate" | "needs_review";

export type MemoryAdmissionAcceptedReason =
  | "accepted_fact"
  | "accepted_plan"
  | "accepted_event"
  | "accepted_episodic"
  | "accepted_belief";

export type MemoryAdmissionRejectionReason =
  | "candidate_invalid"
  | "insufficient_scope"
  | "scope_mismatch"
  | "missing_provenance"
  | "invalid_temporal"
  | "unsupported_kind"
  | "producer_not_permitted"
  | "scene_only"
  | "subjective_reflection_not_truth"
  | "subjective_not_objective_truth"
  | "scene_only_not_truth"
  | "cancelled_plan_not_active"
  | "completed_plan_not_active"
  | "unsafe_authority_role"
  | "metadata_conflict";

export type MemoryAdmissionReviewReason =
  | "duplicate_source"
  | "relationship_signal_requires_review"
  | "temporary_preference_requires_review"
  | "unknown_preference_durability"
  | "hypothesis_missing_subject"
  | "uncertain_plan_requires_review"
  | "active_plan_requires_review"
  | "temporary_preference_not_durable"
  | "stable_preference_requires_review"
  | "missing_epistemic_status";

export type MemoryAdmissionReason =
  | MemoryAdmissionAcceptedReason
  | MemoryAdmissionRejectionReason
  | MemoryAdmissionReviewReason;

export interface MemoryAdmissionDecision {
  state: MemoryAdmissionState;
  reason: MemoryAdmissionReason;
  candidateId: string;
  idempotencyKey: string;
  target?: MemoryAdmissionTarget;
  /** Only explicitly trusted manual input can carry authority at this layer. */
  authority: "candidate_only" | "manual_trusted";
}

export interface MemoryAdmissionPolicyContext {
  /** Caller-owned set; no repository or durable queue is consulted here. */
  knownIdempotencyKeys?: ReadonlySet<string>;
}

export interface MemoryProducerPermission {
  producer: MemoryCandidateProducer;
  allowedKinds: readonly MemoryCandidateKind[];
  requiresUserConfirmation: boolean;
  canBeTrustedAuthority: boolean;
}

const allDurableKinds = ["fact", "event", "plan", "belief", "episodic", "relationship_signal", "scene_only"] as const;

/**
 * Intake permissions are intentionally conservative.  They describe what a
 * producer may propose, not what it may write, and therefore do not replace
 * the existing knowledge write policy or any feature-specific confirmation.
 */
export const MEMORY_PRODUCER_PERMISSIONS: Readonly<Record<MemoryCandidateProducer, MemoryProducerPermission>> = {
  direct_chat: { producer: "direct_chat", allowedKinds: allDurableKinds, requiresUserConfirmation: false, canBeTrustedAuthority: false },
  group_chat: { producer: "group_chat", allowedKinds: allDurableKinds, requiresUserConfirmation: false, canBeTrustedAuthority: false },
  offline: { producer: "offline", allowedKinds: allDurableKinds, requiresUserConfirmation: true, canBeTrustedAuthority: false },
  manual: { producer: "manual", allowedKinds: ["fact", "event", "plan", "belief", "episodic", "relationship_signal"], requiresUserConfirmation: false, canBeTrustedAuthority: true },
  diary: { producer: "diary", allowedKinds: ["plan", "belief", "episodic", "subjective_reflection", "scene_only"], requiresUserConfirmation: true, canBeTrustedAuthority: false },
  moments: { producer: "moments", allowedKinds: ["episodic", "relationship_signal", "scene_only"], requiresUserConfirmation: true, canBeTrustedAuthority: false },
  reading: { producer: "reading", allowedKinds: ["fact", "event", "plan", "belief", "episodic", "scene_only"], requiresUserConfirmation: true, canBeTrustedAuthority: false },
  inner_voice: { producer: "inner_voice", allowedKinds: ["belief", "episodic", "subjective_reflection"], requiresUserConfirmation: true, canBeTrustedAuthority: false },
  character_phone: { producer: "character_phone", allowedKinds: ["episodic", "relationship_signal", "scene_only"], requiresUserConfirmation: true, canBeTrustedAuthority: false },
  proactive: { producer: "proactive", allowedKinds: ["episodic", "relationship_signal", "scene_only"], requiresUserConfirmation: true, canBeTrustedAuthority: false },
  cinema: { producer: "cinema", allowedKinds: ["fact", "event", "plan", "belief", "episodic", "scene_only"], requiresUserConfirmation: true, canBeTrustedAuthority: false },
  forum: { producer: "forum", allowedKinds: ["episodic", "relationship_signal", "scene_only"], requiresUserConfirmation: true, canBeTrustedAuthority: false },
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export interface MemoryCandidateAuthorityResolution {
  role: MemoryCandidateAuthorityRole;
  conflict: boolean;
}

/**
 * Resolve policy authority from model proposals and orthogonal metadata. The
 * returned role is runtime-derived; a Provider proposal never grants write
 * authority by itself.
 */
export function resolveMemoryCandidateAuthorityRole(candidate: MemoryCandidate): MemoryCandidateAuthorityResolution {
  const proposed = candidate.proposedAuthorityRole;
  const semanticRole = candidate.semanticFacet === "scene_only" || candidate.candidateKind === "scene_only"
    ? "scene_only" as const
    : candidate.semanticFacet === "relationship_signal" || candidate.candidateKind === "relationship_signal"
      ? "relationship_signal" as const
      : candidate.semanticFacet === "subjective_reflection" || candidate.candidateKind === "subjective_reflection"
        || candidate.epistemicStatus === "subjective"
        ? "non_objective" as const
        : candidate.semanticFacet === "preference" && candidate.durability === "temporary"
          ? "transient" as const
          : undefined;
  const role = semanticRole
    || (proposed && proposed !== "unknown" ? proposed : undefined)
    || (candidate.epistemicStatus === "objective" && candidate.candidateKind !== "unknown" ? "durable_candidate" : "unknown");
  const proposalConflict = Boolean(
    proposed
    && proposed !== "unknown"
    && semanticRole
    && proposed !== semanticRole,
  );
  const subjectiveDurableConflict = proposed === "durable_candidate" && candidate.epistemicStatus === "subjective";
  const resolvedConflict = Boolean(
    candidate.resolvedAuthorityRole
    && candidate.resolvedAuthorityRole !== role,
  );
  return { role, conflict: proposalConflict || subjectiveDurableConflict || resolvedConflict };
}

function hasExactScope(candidate: MemoryCandidate): boolean {
  return isNonEmptyString(candidate.scope.characterId)
    && isNonEmptyString(candidate.scope.relationId)
    && isNonEmptyString(candidate.scope.userIdentityId);
}

function hasValidTemporal(candidate: MemoryCandidate): boolean {
  const temporal = candidate.temporal;
  if (!isNonEmptyString(temporal.status) || !isFiniteNumber(temporal.recordedAt) || temporal.recordedAt < 0) return false;
  for (const value of [temporal.occurredAt, temporal.validFrom, temporal.validTo]) {
    if (value !== undefined && (!isFiniteNumber(value) || value < 0)) return false;
  }
  return temporal.validFrom === undefined
    || temporal.validTo === undefined
    || temporal.validFrom <= temporal.validTo;
}

function baseDecision(candidate: MemoryCandidate, state: MemoryAdmissionState, reason: MemoryAdmissionReason, idempotencyKey: string, target?: MemoryAdmissionTarget, authority: MemoryAdmissionDecision["authority"] = "candidate_only"): MemoryAdmissionDecision {
  return {
    state,
    reason,
    candidateId: isNonEmptyString(candidate.candidateId) ? candidate.candidateId.trim() : "",
    idempotencyKey,
    ...(target ? { target } : {}),
    authority,
  };
}

function acceptedTarget(kind: MemoryCandidateKind): { target: MemoryAdmissionTarget; reason: MemoryAdmissionAcceptedReason } | undefined {
  switch (kind) {
    case "fact": return { target: "truth", reason: "accepted_fact" };
    case "plan": return { target: "truth", reason: "accepted_plan" };
    case "event": return { target: "event", reason: "accepted_event" };
    case "episodic": return { target: "episodic", reason: "accepted_episodic" };
    case "belief": return { target: "belief", reason: "accepted_belief" };
    default: return undefined;
  }
}

/** Pure intake classification; it does not read or mutate storage or runtime state. */
export function evaluateMemoryCandidate(candidate: MemoryCandidate, context: MemoryAdmissionPolicyContext = {}): MemoryAdmissionDecision {
  const idempotencyKey = buildMemoryCandidateIdempotencyKey(candidate);
  if (candidate.schemaVersion !== MEMORY_CANDIDATE_SCHEMA_VERSION
    || !isNonEmptyString(candidate.candidateId)
    || !isNonEmptyString(candidate.statement)
    || !candidate.provenance
    || !candidate.evidence
    || !candidate.temporal
    || !isValidMemoryCandidateConfidence(candidate.confidence)
    || !isValidMemoryCandidateImportance(candidate.importance)) {
    return baseDecision(candidate, "rejected", "candidate_invalid", idempotencyKey);
  }
  if (!hasExactScope(candidate)) return baseDecision(candidate, "rejected", "insufficient_scope", idempotencyKey);
  if (candidate.provenance.conversationId
    && candidate.scope.conversationId
    && candidate.provenance.conversationId.trim() !== candidate.scope.conversationId.trim()) {
    return baseDecision(candidate, "rejected", "scope_mismatch", idempotencyKey);
  }
  if (!hasTraceableMemoryCandidateProvenance(candidate)) return baseDecision(candidate, "rejected", "missing_provenance", idempotencyKey);
  if (!hasValidTemporal(candidate)) return baseDecision(candidate, "rejected", "invalid_temporal", idempotencyKey);

  if (context.knownIdempotencyKeys?.has(idempotencyKey)) {
    return baseDecision(candidate, "duplicate", "duplicate_source", idempotencyKey);
  }

  if (candidate.candidateKind === "unknown") return baseDecision(candidate, "rejected", "unsupported_kind", idempotencyKey);
  if (candidate.metadataSource === "v2") {
    const authority = resolveMemoryCandidateAuthorityRole(candidate);
    if (authority.conflict) return baseDecision(candidate, "rejected", "metadata_conflict", idempotencyKey);
    if (authority.role === "scene_only") return baseDecision(candidate, "rejected", "scene_only_not_truth", idempotencyKey);
    if (authority.role === "relationship_signal") {
      return baseDecision(candidate, "needs_review", "relationship_signal_requires_review", idempotencyKey);
    }
    if (authority.role === "non_objective") {
      return baseDecision(candidate, "rejected", "subjective_not_objective_truth", idempotencyKey);
    }
    if (candidate.candidateKind === "plan") {
      const lifecycle = candidate.planLifecycle || "unknown";
      if (lifecycle === "cancelled") return baseDecision(candidate, "rejected", "cancelled_plan_not_active", idempotencyKey);
      if (lifecycle === "completed") return baseDecision(candidate, "rejected", "completed_plan_not_active", idempotencyKey);
      if (lifecycle === "uncertain" || lifecycle === "unknown") {
        return baseDecision(candidate, "needs_review", "uncertain_plan_requires_review", idempotencyKey);
      }
      return baseDecision(candidate, "needs_review", "active_plan_requires_review", idempotencyKey);
    }
    if (candidate.semanticFacet === "preference") {
      if (candidate.durability === "temporary") {
        return baseDecision(candidate, "needs_review", "temporary_preference_not_durable", idempotencyKey);
      }
      if (candidate.durability === "unknown") {
        return baseDecision(candidate, "needs_review", "unknown_preference_durability", idempotencyKey);
      }
      if (candidate.durability === "stable") {
        return baseDecision(candidate, "needs_review", "stable_preference_requires_review", idempotencyKey);
      }
    }
    if (!candidate.epistemicStatus || candidate.epistemicStatus === "unknown") {
      return baseDecision(candidate, "needs_review", "missing_epistemic_status", idempotencyKey);
    }
    if (candidate.proposedAuthorityRole === "unknown") {
      return baseDecision(candidate, "needs_review", "unsafe_authority_role", idempotencyKey);
    }
  }
  const permission = MEMORY_PRODUCER_PERMISSIONS[candidate.provenance.producer];
  if (!permission || !permission.allowedKinds.includes(candidate.candidateKind)) {
    return baseDecision(candidate, "rejected", "producer_not_permitted", idempotencyKey);
  }
  if (candidate.candidateKind === "scene_only") return baseDecision(candidate, "rejected", "scene_only", idempotencyKey);
  if (candidate.candidateKind === "subjective_reflection") {
    return baseDecision(candidate, "rejected", "subjective_reflection_not_truth", idempotencyKey);
  }
  if (candidate.candidateKind === "relationship_signal") {
    return baseDecision(candidate, "needs_review", "relationship_signal_requires_review", idempotencyKey);
  }
  if (candidate.semanticFacet === "preference"
    && candidate.durability === "temporary") {
    return baseDecision(candidate, "needs_review", "temporary_preference_requires_review", idempotencyKey);
  }
  if (candidate.semanticFacet === "preference"
    && candidate.durability === "unknown") {
    return baseDecision(candidate, "needs_review", "unknown_preference_durability", idempotencyKey);
  }
  if (candidate.semanticFacet === "hypothesis"
    && !candidate.provenance.actorId
    && !candidate.provenance.targetId) {
    return baseDecision(candidate, "needs_review", "hypothesis_missing_subject", idempotencyKey);
  }

  const target = acceptedTarget(candidate.candidateKind);
  if (!target) return baseDecision(candidate, "rejected", "unsupported_kind", idempotencyKey);
  const trustedManual = permission.canBeTrustedAuthority
    && candidate.provenance.sourceType === "manual"
    && candidate.provenance.authorship === "user";
  return baseDecision(candidate, "accepted", target.reason, idempotencyKey, target.target, trustedManual ? "manual_trusted" : "candidate_only");
}
