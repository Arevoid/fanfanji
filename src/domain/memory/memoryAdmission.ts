import {
  buildMemoryCandidateIdempotencyKey,
  hasTraceableMemoryCandidateProvenance,
  isValidMemoryCandidateConfidence,
  isValidMemoryCandidateImportance,
  MEMORY_CANDIDATE_SCHEMA_VERSION,
  type MemoryCandidate,
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
  | "subjective_reflection_not_truth";

export type MemoryAdmissionReviewReason =
  | "duplicate_source"
  | "relationship_signal_requires_review"
  | "temporary_preference_requires_review"
  | "unknown_preference_durability"
  | "hypothesis_missing_subject";

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
