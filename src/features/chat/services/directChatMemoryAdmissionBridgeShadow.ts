import type {
  KnowledgeClaim,
  KnowledgeKind,
  KnowledgeSourceKind,
  TemporalStatus,
} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {
  evaluateMemoryCandidate,
  type MemoryAdmissionDecision,
  type MemoryAdmissionState,
} from "../../../domain/memory/memoryAdmission";
import type {
  MemoryCandidate,
  MemoryCandidateKind,
  MemoryCandidateDurability,
  MemoryCandidateEpistemicStatus,
  MemoryCandidatePlanLifecycle,
  MemoryCandidateAuthorityRole,
  MemoryCandidateSemanticFacet,
} from "../../../domain/memory/memoryCandidate";
import type {
  MemoryExtractionCandidateDecision,
  MemoryExtractionRejectionDiagnostic,
} from "../../../domain/memory/memoryExtractionSchema";
import type { MemoryExtractionResult } from "../../../domain/memory/memoryTypes";
import { getRuntimeExtractionLineage } from "../../characterKnowledge/services/knowledgeExtractionProtocol";
import { buildMemoryShadowCorrelationKey } from "../../../domain/memory/memoryShadowCorrelation";
import {
  classifyLegacyAdmissionSemantics,
  classifyV2AdmissionSemantics,
  classifyAdmissionComparisonMismatch,
  type MemoryAdmissionComparisonAuthorityClass,
  type MemoryAdmissionComparisonMismatchClass,
  type MemoryAdmissionComparisonSemanticKind,
} from "./directChatMemoryAdmissionComparison";
import {
  decideDirectChatMemoryBridge,
  matchDirectChatMemoryCandidates,
  trustedCandidate,
  type DirectChatMemoryBridgeReason,
  type DirectChatMemoryBridgeRuntimeContext,
  type DirectChatMemoryBridgeScope,
  type DirectChatMemoryBridgeState,
  type DirectChatMemoryCorrelationState,
  type DirectChatMemoryBridgePolicyDimensions,
  type DirectChatMemoryIdentityDiagnostics,
  type DirectChatMemoryPairCandidateMatrixEntry,
  type DirectChatMemoryLegacyCandidate,
  type DirectChatMemoryV2Candidate,
} from "./directChatMemoryAdmissionBridge";
import {
  adaptDirectChatMemoryExtractionToCandidates,
  type DirectChatMemoryCandidateAdapterInput,
} from "./directChatMemoryCandidateAdapter";

export type DirectChatMemoryBridgeShadowMetadataSource =
  | "legacy_claim_semantics"
  | "legacy_policy_derived"
  | "v2_model_native"
  | "runtime_owned"
  | "unknown";

export interface DirectChatMemoryBridgeShadowObservation {
  bridgeCorrelation: DirectChatMemoryCorrelationState;
  /** Runtime-only correlation classification; the opaque lineage token is never exposed. */
  lineageStatus: "shared" | "partial" | "mismatch" | "absent";
  /** True only when this observation contains exactly one legacy/V2 pair. */
  pairUnique: boolean;
  legacyAccepted: boolean;
  legacyWriteEligibility: "canonical_write" | "not_write_eligible" | "needs_review" | "unknown";
  legacyProvenanceTrusted: boolean;
  v2ProvenanceTrusted: boolean;
  bridgeState: DirectChatMemoryBridgeState;
  bridgeReason: DirectChatMemoryBridgeReason;
  legacySemanticKind: MemoryAdmissionComparisonSemanticKind;
  v2SemanticKind: MemoryAdmissionComparisonSemanticKind;
  legacyAuthorityClass: MemoryAdmissionComparisonAuthorityClass;
  v2AuthorityClass: MemoryAdmissionComparisonAuthorityClass;
  legacyPolicySource: DirectChatMemoryBridgeShadowMetadataSource;
  v2MetadataSource: DirectChatMemoryBridgeShadowMetadataSource;
  wouldWriteProposal: boolean;
  wouldSafetyVeto: boolean;
  wouldPassthrough: boolean;
  wouldReview: boolean;
  wouldReject: boolean;
  wouldRoute: boolean;
  /**
   * Metadata-only anatomy for a paired observation. It is intentionally
   * additive and never feeds matcher or bridge decisions.
   */
  conflictAnatomy?: DirectChatMemoryConflictAnatomy;
  legacyIdentity?: DirectChatMemoryIdentityDiagnostics;
  v2Identity?: DirectChatMemoryIdentityDiagnostics;
}

export interface DirectChatMemoryConflictAnatomy {
  legacy: {
    semanticKind: MemoryAdmissionComparisonSemanticKind;
    claimKind?: KnowledgeKind;
    truthStatus?: KnowledgeClaim["truthStatus"];
    temporalStatus: TemporalStatus;
    epistemicProjection: MemoryCandidateEpistemicStatus;
    durabilityProjection: MemoryCandidateDurability;
    planLifecycleProjection: MemoryCandidatePlanLifecycle;
    resolvedAuthorityRole: MemoryCandidateAuthorityRole;
    metadataSource: DirectChatMemoryBridgeShadowMetadataSource;
    actorTargetShape: DirectChatMemoryIdentityDiagnostics["actorTargetShape"];
  };
  v2: {
    candidateKind: MemoryCandidateKind;
    semanticFacet?: MemoryCandidateSemanticFacet;
    semanticKind: MemoryAdmissionComparisonSemanticKind;
    epistemicStatus: MemoryCandidateEpistemicStatus;
    durability: MemoryCandidateDurability;
    planLifecycle: MemoryCandidatePlanLifecycle;
    resolvedAuthorityRole: MemoryCandidateAuthorityRole;
    admissionState: MemoryAdmissionState;
    admissionReason: MemoryAdmissionDecision["reason"];
    metadataSource: DirectChatMemoryBridgeShadowMetadataSource;
    actorTargetShape: DirectChatMemoryIdentityDiagnostics["actorTargetShape"];
  };
  comparison: {
    semanticCompatible: boolean;
    epistemicConflict: boolean;
    durabilityConflict: boolean;
    lifecycleConflict: boolean;
    authorityConflict: boolean;
    actorTargetConflict: boolean;
    temporalConflict: boolean;
    conflictFields: readonly (keyof DirectChatMemoryBridgePolicyDimensions)[];
    unsafe: boolean;
    mismatchClass: MemoryAdmissionComparisonMismatchClass;
    bridgeState: DirectChatMemoryBridgeState;
    bridgeReason: DirectChatMemoryBridgeReason;
  };
}

export interface DirectChatMemoryBridgeShadowMetrics {
  totalObservations: number;
  exactCount: number;
  ambiguousCount: number;
  unmatchedLegacyCount: number;
  unmatchedV2Count: number;
  legacyOnlyCount: number;
  v2OnlyCount: number;
  duplicateCount: number;
  conflictCount: number;
  wouldWriteProposal: number;
  wouldSafetyVeto: number;
  wouldPassthrough: number;
  wouldReview: number;
  wouldReject: number;
  wouldRoute: number;
  stateCounts: Record<DirectChatMemoryBridgeState, number>;
  safetyVetoReasonCounts: Partial<Record<DirectChatMemoryBridgeReason, number>>;
}

export interface DirectChatMemoryBridgeShadowResult {
  failedOpen: boolean;
  metrics: DirectChatMemoryBridgeShadowMetrics;
  observations: readonly DirectChatMemoryBridgeShadowObservation[];
  pairCandidateMatrix: readonly DirectChatMemoryPairCandidateMatrixEntry[];
}

const emptyCandidateAdapterResult = {
  candidates: [] as MemoryCandidate[],
  unsupportedKindCount: 0,
  missingSourceReferenceCount: 0,
  invalidSourceReferenceCount: 0,
  duplicateSourceReferenceCount: 0,
  partialSourceReferenceCount: 0,
  scopeMismatchCount: 0,
  canonicalBindingSuccessCount: 0,
  sceneClassificationUnavailableCount: 0,
};

const UNKNOWN = "unknown" as const;

const emptyMetrics = (): DirectChatMemoryBridgeShadowMetrics => ({
  totalObservations: 0,
  exactCount: 0,
  ambiguousCount: 0,
  unmatchedLegacyCount: 0,
  unmatchedV2Count: 0,
  legacyOnlyCount: 0,
  v2OnlyCount: 0,
  duplicateCount: 0,
  conflictCount: 0,
  wouldWriteProposal: 0,
  wouldSafetyVeto: 0,
  wouldPassthrough: 0,
  wouldReview: 0,
  wouldReject: 0,
  wouldRoute: 0,
  stateCounts: {
    legacy_passthrough: 0,
    write_proposal: 0,
    review: 0,
    reject: 0,
    route: 0,
    safety_veto: 0,
  },
  safetyVetoReasonCounts: {},
});

const normalize = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

const normalizeRefs = (values: readonly string[]): string[] => Array.from(new Set(
  values.map((value) => value.trim()).filter(Boolean),
)).sort();

function scopeFromInput(input: DirectChatMemoryCandidateAdapterInput): DirectChatMemoryBridgeScope {
  return {
    characterId: normalize(input.scope.characterId) || "",
    relationId: normalize(input.scope.relationId) || "",
    userIdentityId: normalize(input.scope.userIdentityId) || "",
    conversationId: normalize(input.scope.conversationId) || "",
  };
}

function sameScope(left: Partial<DirectChatMemoryBridgeScope>, right: DirectChatMemoryBridgeScope): boolean {
  return Boolean(normalize(left.characterId)
    && normalize(left.relationId)
    && normalize(left.userIdentityId)
    && normalize(left.conversationId))
    && normalize(left.characterId) === normalize(right.characterId)
    && normalize(left.relationId) === normalize(right.relationId)
    && normalize(left.userIdentityId) === normalize(right.userIdentityId)
    && normalize(left.conversationId) === normalize(right.conversationId);
}

function claimSourceRefs(claim: KnowledgeClaim): string[] {
  return normalizeRefs([
    ...(claim.source.messageIds || []),
    ...(claim.source.eventId ? [claim.source.eventId] : []),
    ...(claim.source.sourceRecordId ? [claim.source.sourceRecordId] : []),
    ...(claim.source.storyId ? [claim.source.storyId] : []),
  ]);
}

function claimCorrelationKey(claim: KnowledgeClaim): string | undefined {
  const refs = claimSourceRefs(claim);
  return refs.length > 0 ? buildMemoryShadowCorrelationKey(refs, claim.temporalStatus) : undefined;
}

function sourceTypeForClaim(kind: KnowledgeSourceKind): DirectChatMemoryLegacyCandidate["provenance"]["sourceType"] {
  switch (kind) {
    case "user_message":
    case "automatic_summary":
    case "deterministic_action":
    case "manual":
    case "offline_story":
    case "import":
      return kind;
    case "legacy_memory":
    case "ooc_correction":
      return "import";
    default:
      return "import";
  }
}

function actorTargetForClaim(claim: KnowledgeClaim, scope: DirectChatMemoryBridgeScope): { actorId?: string; targetId?: string } {
  if (claim.subject === "user") return { actorId: scope.userIdentityId, targetId: scope.characterId };
  if (claim.subject === "character") return { actorId: scope.characterId, targetId: scope.userIdentityId };
  return {};
}

function semanticKindForClaim(
  claim: KnowledgeClaim | undefined,
  diagnostic: MemoryExtractionRejectionDiagnostic,
): MemoryAdmissionComparisonSemanticKind {
  if (claim?.kind === "preference") return "preference";
  if (claim?.kind === "hypothesis") return "hypothesis";
  if (claim?.kind) return claim.kind;
  if (diagnostic.candidateKind) return diagnostic.candidateKind;
  return "unknown";
}

function epistemicForClaim(claim: KnowledgeClaim): DirectChatMemoryLegacyCandidate["policy"]["epistemicStatus"] {
  if (claim.kind === "fact" && claim.truthStatus === "confirmed") return "objective";
  if (claim.kind === "belief" || claim.kind === "hypothesis") {
    return claim.truthStatus === "inferred" || claim.truthStatus === "disputed" || claim.truthStatus === "legacy_unverified"
      ? "uncertain"
      : "subjective";
  }
  if (claim.kind === "fact") return "uncertain";
  return UNKNOWN;
}

function policyForLegacy(claim: KnowledgeClaim | undefined, semanticKind: MemoryAdmissionComparisonSemanticKind): {
  policy: DirectChatMemoryLegacyCandidate["policy"];
  source: DirectChatMemoryBridgeShadowMetadataSource;
} {
  if (claim?.kind === "fact" && claim.truthStatus === "confirmed") {
    return {
      policy: {
        epistemicStatus: "objective",
        // Legacy KnowledgeClaim has no durability field; confirmed fact does
        // not justify inventing a stable/temporary classification.
        durability: UNKNOWN,
        planLifecycle: UNKNOWN,
        resolvedAuthorityRole: "durable_candidate",
      },
      source: "legacy_claim_semantics",
    };
  }
  if (claim?.kind === "fact") {
    return {
      policy: {
        epistemicStatus: epistemicForClaim(claim),
        durability: UNKNOWN,
        planLifecycle: UNKNOWN,
        resolvedAuthorityRole: "non_objective",
      },
      source: "legacy_claim_semantics",
    };
  }
  if (claim?.kind === "belief" || claim?.kind === "hypothesis") {
    return {
      policy: {
        epistemicStatus: epistemicForClaim(claim),
        durability: UNKNOWN,
        planLifecycle: UNKNOWN,
        resolvedAuthorityRole: "non_objective",
      },
      source: "legacy_claim_semantics",
    };
  }
  if (semanticKind === "preference") {
    return {
      policy: {
        epistemicStatus: UNKNOWN,
        durability: UNKNOWN,
        planLifecycle: UNKNOWN,
        resolvedAuthorityRole: "non_objective",
      },
      source: "unknown",
    };
  }
  if (semanticKind === "plan") {
    return {
      policy: {
        epistemicStatus: UNKNOWN,
        durability: UNKNOWN,
        planLifecycle: UNKNOWN,
        resolvedAuthorityRole: "non_objective",
      },
      source: "unknown",
    };
  }
  return {
    policy: {
      epistemicStatus: UNKNOWN,
      durability: UNKNOWN,
      planLifecycle: UNKNOWN,
      resolvedAuthorityRole: UNKNOWN,
    },
    source: claim ? "legacy_policy_derived" : "unknown",
  };
}

function trustedClaim(
  claim: KnowledgeClaim | undefined,
  scope: DirectChatMemoryBridgeScope,
  allowedSourceRefs: ReadonlySet<string>,
): boolean {
  if (!claim || !sameScope(claim, scope)) return false;
  const refs = claimSourceRefs(claim);
  return refs.length > 0 && refs.every((ref) => allowedSourceRefs.has(ref));
}

function diagnosticsForExtraction(extraction: MemoryExtractionResult): readonly MemoryExtractionRejectionDiagnostic[] {
  if (Array.isArray(extraction.rejectedCandidates)) return extraction.rejectedCandidates;
  return extraction.acceptedClaims.map((claim) => ({
    decision: "accepted" as const,
    stage: "knowledge_gate" as const,
    reason: "accepted",
    candidateKind: claim.kind === "preference" ? "fact" : claim.kind === "hypothesis" ? "belief" : claim.kind,
    temporalStatus: claim.temporalStatus,
    ...(claimCorrelationKey(claim) ? { correlationKey: claimCorrelationKey(claim) } : {}),
  }));
}

function buildLegacyCandidates(input: {
  extraction: MemoryExtractionResult;
  scope: DirectChatMemoryBridgeScope;
  allowedSourceRefs: ReadonlySet<string>;
}): DirectChatMemoryLegacyCandidate[] {
  const diagnostics = diagnosticsForExtraction(input.extraction);
  const claimsByKey = new Map<string, KnowledgeClaim[]>();
  input.extraction.acceptedClaims.forEach((claim) => {
    const key = claimCorrelationKey(claim);
    if (!key) return;
    const claims = claimsByKey.get(key) || [];
    claims.push(claim);
    claimsByKey.set(key, claims);
  });
  const usedClaims = new Set<string>();
  const candidates = diagnostics.map((diagnostic, index) => {
    const claim = diagnostic.correlationKey
      ? (claimsByKey.get(diagnostic.correlationKey) || []).find((item) => !usedClaims.has(item.id))
      : undefined;
    if (claim) usedClaims.add(claim.id);
    const semanticKind = semanticKindForClaim(claim, diagnostic);
    const policy = policyForLegacy(claim, semanticKind);
    const sourceRefs = claim ? claimSourceRefs(claim) : [];
    const actorTarget = claim ? actorTargetForClaim(claim, input.scope) : {};
    return {
      id: claim?.id || `legacy-diagnostic-${index}`,
      ...(getRuntimeExtractionLineage(diagnostic) ? { runtimeLineageId: getRuntimeExtractionLineage(diagnostic) } : {}),
      diagnostic: {
        decision: diagnostic.decision,
        candidateKind: diagnostic.candidateKind,
        temporalStatus: diagnostic.temporalStatus,
        correlationKey: diagnostic.correlationKey,
        reason: diagnostic.reason,
      },
      ...(claim ? { claim } : {}),
      candidateKind: semanticKind,
      ...(claim?.truthStatus ? { truthStatus: claim.truthStatus } : {}),
      temporalStatus: claim?.temporalStatus || diagnostic.temporalStatus || "unknown" as TemporalStatus,
      sourceRefs,
      scope: input.scope,
      provenanceTrusted: trustedClaim(claim, input.scope, input.allowedSourceRefs),
      provenance: {
        producer: claim?.source.producer || "legacy-diagnostic",
        sourceType: claim ? sourceTypeForClaim(claim.source.kind) : "import" as const,
        ...(normalize(actorTarget.actorId) ? { actorId: normalize(actorTarget.actorId) } : {}),
        ...(normalize(actorTarget.targetId) ? { targetId: normalize(actorTarget.targetId) } : {}),
        ...(claim?.source.evidenceKey ? { evidenceKey: claim.source.evidenceKey } : {}),
      },
      policy: policy.policy,
    } satisfies DirectChatMemoryLegacyCandidate;
  });

  input.extraction.acceptedClaims.forEach((claim, index) => {
    if (usedClaims.has(claim.id)) return;
    const semanticKind = semanticKindForClaim(claim, {
      decision: "accepted",
      stage: "knowledge_gate",
      reason: "accepted",
      candidateKind: claim.kind === "preference" ? "fact" : claim.kind === "hypothesis" ? "belief" : claim.kind,
      temporalStatus: claim.temporalStatus,
      correlationKey: claimCorrelationKey(claim),
    });
    const policy = policyForLegacy(claim, semanticKind);
    const actorTarget = actorTargetForClaim(claim, input.scope);
    candidates.push({
      id: claim.id || `legacy-claim-${index}`,
      diagnostic: {
        decision: "accepted",
        candidateKind: semanticKind === "preference" ? "fact" : semanticKind === "hypothesis" ? "belief" : semanticKind,
        temporalStatus: claim.temporalStatus,
        correlationKey: claimCorrelationKey(claim),
        reason: "accepted",
      },
      claim,
      candidateKind: semanticKind,
      truthStatus: claim.truthStatus,
      temporalStatus: claim.temporalStatus,
      sourceRefs: claimSourceRefs(claim),
      scope: input.scope,
      provenanceTrusted: trustedClaim(claim, input.scope, input.allowedSourceRefs),
      provenance: {
        producer: claim.source.producer,
        sourceType: sourceTypeForClaim(claim.source.kind),
        ...(normalize(actorTarget.actorId) ? { actorId: normalize(actorTarget.actorId) } : {}),
        ...(normalize(actorTarget.targetId) ? { targetId: normalize(actorTarget.targetId) } : {}),
        ...(claim.source.evidenceKey ? { evidenceKey: claim.source.evidenceKey } : {}),
      },
      policy: policy.policy,
    });
  });
  return candidates;
}

function v2MetadataSource(candidate: MemoryCandidate): DirectChatMemoryBridgeShadowMetadataSource {
  if (candidate.metadataSource === "v2") return "v2_model_native";
  if (candidate.metadataSource === "legacy") return "legacy_policy_derived";
  return "unknown";
}

function buildConflictAnatomy(
  match: ReturnType<typeof matchDirectChatMemoryCandidates>["matches"][number],
  decision: ReturnType<typeof decideDirectChatMemoryBridge>,
): DirectChatMemoryConflictAnatomy | undefined {
  const legacy = match.legacy[0];
  const v2 = match.v2[0];
  if (!legacy || !v2) return undefined;

  const legacyComparison = classifyLegacyAdmissionSemantics({
    decision: legacy.diagnostic.decision,
    candidateKind: legacy.candidateKind,
    truthStatus: legacy.truthStatus,
  }, legacy.claim);
  const v2Comparison = classifyV2AdmissionSemantics(v2.candidate, v2.decision);
  const legacyPolicy = legacy.policy;
  const v2Policy = {
    epistemicStatus: v2.candidate.epistemicStatus || UNKNOWN,
    durability: v2.candidate.durability || UNKNOWN,
    planLifecycle: v2.candidate.planLifecycle || UNKNOWN,
    resolvedAuthorityRole: v2.candidate.resolvedAuthorityRole || UNKNOWN,
  } satisfies DirectChatMemoryBridgePolicyDimensions;
  const fields = match.policyConflict?.fields || [];
  const hasConflict = (field: keyof DirectChatMemoryBridgePolicyDimensions): boolean => fields.includes(field);
  const actorTargetConflict = Boolean(
    legacy.provenance.actorId
      && v2.candidate.provenance.actorId
      && legacy.provenance.actorId !== v2.candidate.provenance.actorId,
  ) || Boolean(
    legacy.provenance.targetId
      && v2.candidate.provenance.targetId
      && legacy.provenance.targetId !== v2.candidate.provenance.targetId,
  );
  const temporalConflict = legacy.temporalStatus !== "unknown"
    && v2.candidate.temporal.status !== "unknown"
    && legacy.temporalStatus !== v2.candidate.temporal.status;

  return {
    legacy: {
      semanticKind: legacyComparison.semanticKind,
      ...(legacy.claim?.kind ? { claimKind: legacy.claim.kind } : {}),
      ...(legacy.truthStatus ? { truthStatus: legacy.truthStatus } : {}),
      temporalStatus: legacy.temporalStatus,
      epistemicProjection: legacyPolicy.epistemicStatus,
      durabilityProjection: legacyPolicy.durability,
      planLifecycleProjection: legacyPolicy.planLifecycle,
      resolvedAuthorityRole: legacyPolicy.resolvedAuthorityRole,
      metadataSource: policyForLegacy(legacy.claim, legacySemanticKindForCandidate(legacy)).source,
      actorTargetShape: match.legacyIdentity?.actorTargetShape || "none",
    },
    v2: {
      candidateKind: v2.candidate.candidateKind,
      ...(v2.candidate.semanticFacet ? { semanticFacet: v2.candidate.semanticFacet } : {}),
      semanticKind: v2Comparison.semanticKind,
      epistemicStatus: v2Policy.epistemicStatus,
      durability: v2Policy.durability,
      planLifecycle: v2Policy.planLifecycle,
      resolvedAuthorityRole: v2Policy.resolvedAuthorityRole,
      admissionState: v2.decision.state,
      admissionReason: v2.decision.reason,
      metadataSource: v2MetadataSource(v2.candidate),
      actorTargetShape: match.v2Identity?.actorTargetShape || "none",
    },
    comparison: {
      semanticCompatible: match.legacyIdentity?.semanticCompatible ?? true,
      epistemicConflict: hasConflict("epistemicStatus"),
      durabilityConflict: hasConflict("durability"),
      lifecycleConflict: hasConflict("planLifecycle"),
      authorityConflict: hasConflict("resolvedAuthorityRole"),
      actorTargetConflict,
      temporalConflict,
      conflictFields: fields,
      unsafe: Boolean(match.policyConflict?.unsafe),
      mismatchClass: classifyAdmissionComparisonMismatch(legacyComparison, v2Comparison),
      bridgeState: decision.state,
      bridgeReason: decision.reason,
    },
  };
}

function shadowObservation(
  match: ReturnType<typeof matchDirectChatMemoryCandidates>["matches"][number],
  decision: ReturnType<typeof decideDirectChatMemoryBridge>,
): DirectChatMemoryBridgeShadowObservation {
  const legacy = match.legacy[0];
  const v2 = match.v2[0];
  const legacyComparison = legacy
    ? classifyLegacyAdmissionSemantics({
      decision: legacy.diagnostic.decision,
      candidateKind: legacy.candidateKind,
      truthStatus: legacy.truthStatus,
    }, legacy.claim)
    : undefined;
  const v2Comparison = v2
    ? classifyV2AdmissionSemantics(v2.candidate, v2.decision)
    : undefined;
  const legacyLineage = legacy?.runtimeLineageId;
  const v2Lineage = v2?.candidate.runtimeLineageId;
  const lineageStatus: DirectChatMemoryBridgeShadowObservation["lineageStatus"] = !legacyLineage && !v2Lineage
    ? "absent"
    : !legacyLineage || !v2Lineage
      ? "partial"
      : legacyLineage === v2Lineage
        ? "shared"
        : "mismatch";
  return {
    bridgeCorrelation: match.correlation,
    lineageStatus,
    pairUnique: match.legacy.length === 1 && match.v2.length === 1,
    legacyAccepted: legacy?.diagnostic.decision === "accepted",
    legacyWriteEligibility: legacyComparison?.writeEligibility || "unknown",
    legacyProvenanceTrusted: Boolean(legacy?.provenanceTrusted),
    v2ProvenanceTrusted: Boolean(v2 && trustedCandidate(v2)),
    bridgeState: decision.state,
    bridgeReason: decision.reason,
    legacySemanticKind: legacyComparison?.semanticKind || "unknown",
    v2SemanticKind: v2Comparison?.semanticKind || "unknown",
    legacyAuthorityClass: legacyComparison?.authorityClass || "unknown",
    v2AuthorityClass: v2Comparison?.authorityClass || "unknown",
    legacyPolicySource: legacy
      ? policyForLegacy(legacy.claim, legacySemanticKindForCandidate(legacy)).source
      : "unknown",
    v2MetadataSource: v2 ? v2MetadataSource(v2.candidate) : "unknown",
    wouldWriteProposal: decision.state === "write_proposal",
    wouldSafetyVeto: decision.state === "safety_veto",
    wouldPassthrough: decision.state === "legacy_passthrough",
    wouldReview: decision.state === "review",
    wouldReject: decision.state === "reject",
    wouldRoute: decision.state === "route",
    ...(buildConflictAnatomy(match, decision) ? { conflictAnatomy: buildConflictAnatomy(match, decision) } : {}),
    ...(match.legacyIdentity ? { legacyIdentity: match.legacyIdentity } : {}),
    ...(match.v2Identity ? { v2Identity: match.v2Identity } : {}),
  };
}

function legacySemanticKindForCandidate(candidate: DirectChatMemoryLegacyCandidate): MemoryAdmissionComparisonSemanticKind {
  if (candidate.claim?.kind === "preference") return "preference";
  if (candidate.claim?.kind === "hypothesis") return "hypothesis";
  return candidate.candidateKind || candidate.diagnostic.candidateKind || "unknown";
}

function incrementMetric(metrics: DirectChatMemoryBridgeShadowMetrics, observation: DirectChatMemoryBridgeShadowObservation): void {
  metrics.totalObservations += 1;
  metrics.stateCounts[observation.bridgeState] += 1;
  if (observation.bridgeCorrelation === "exact") metrics.exactCount += 1;
  if (observation.bridgeCorrelation === "ambiguous") metrics.ambiguousCount += 1;
  if (observation.bridgeCorrelation === "unmatched_legacy") metrics.unmatchedLegacyCount += 1;
  if (observation.bridgeCorrelation === "unmatched_v2") metrics.unmatchedV2Count += 1;
  if (observation.bridgeCorrelation === "legacy_only") metrics.legacyOnlyCount += 1;
  if (observation.bridgeCorrelation === "v2_only") metrics.v2OnlyCount += 1;
  if (observation.bridgeCorrelation === "duplicate") metrics.duplicateCount += 1;
  if (observation.bridgeCorrelation === "conflict") metrics.conflictCount += 1;
  if (observation.wouldWriteProposal) metrics.wouldWriteProposal += 1;
  if (observation.wouldSafetyVeto) metrics.wouldSafetyVeto += 1;
  if (observation.wouldPassthrough) metrics.wouldPassthrough += 1;
  if (observation.wouldReview) metrics.wouldReview += 1;
  if (observation.wouldReject) metrics.wouldReject += 1;
  if (observation.wouldRoute) metrics.wouldRoute += 1;
  if (observation.wouldSafetyVeto) {
    metrics.safetyVetoReasonCounts[observation.bridgeReason] = (metrics.safetyVetoReasonCounts[observation.bridgeReason] || 0) + 1;
  }
}

function failedOpenResult(): DirectChatMemoryBridgeShadowResult {
  return { failedOpen: true, metrics: emptyMetrics(), observations: [], pairCandidateMatrix: [] };
}

/**
 * Adapt an already parsed Direct Chat extraction result to the formal 10B
 * matcher. This function is observation-only: it does not call a Provider,
 * write storage, or alter the legacy extraction result.
 */
export function observeDirectChatMemoryAdmissionBridgeShadow(
  input: DirectChatMemoryCandidateAdapterInput,
): DirectChatMemoryBridgeShadowResult {
  try {
    const sourceEnvelope = input.sourceEnvelope || input.extraction.sourceEnvelope;
    const scope = scopeFromInput(input);
    const allowedSourceRefs = new Set(sourceEnvelope?.allowedSourceMessageIds || []);
    const runtime: DirectChatMemoryBridgeRuntimeContext = {
      scope,
      allowedSourceRefs: Array.from(allowedSourceRefs),
      trustedProvenance: Boolean(sourceEnvelope
        && sourceEnvelope.characterId.trim() === scope.characterId
        && (sourceEnvelope.relationId || "").trim() === scope.relationId
        && (sourceEnvelope.userIdentityId || "").trim() === scope.userIdentityId
        && (sourceEnvelope.conversationId || "").trim() === scope.conversationId),
    };
    // The candidate adapter intentionally has a legacy fallback that projects
    // accepted claims into compatibility candidates for the existing shadow
    // comparator. The bridge must not reinterpret those claims as V2 input:
    // without an explicit structured/shadow V2 array this side is V2-only
    // absent, so the bridge can correctly emit legacy_only.
    const hasV2Candidates = Boolean(input.extraction.structuredCandidatesV2?.length || input.extraction.shadowCandidatesV2?.length);
    const adapted = hasV2Candidates
      ? adaptDirectChatMemoryExtractionToCandidates({ ...input, sourceEnvelope })
      : emptyCandidateAdapterResult;
    const decisions: MemoryAdmissionDecision[] = adapted.candidates.map((candidate) => evaluateMemoryCandidate(candidate, {
      knownIdempotencyKeys: input.knownIdempotencyKeys,
    }));
    const legacy = buildLegacyCandidates({ extraction: input.extraction, scope, allowedSourceRefs });
    const v2: DirectChatMemoryV2Candidate[] = adapted.candidates.map((candidate, index) => ({
      candidate,
      decision: decisions[index]!,
      runtime,
    }));
    const matched = matchDirectChatMemoryCandidates({ legacy, v2, runtime });
    const metrics = emptyMetrics();
    const observations = matched.matches.map((match) => {
      const decision = decideDirectChatMemoryBridge(match, { runtime, knownIdempotencyKeys: input.knownIdempotencyKeys });
      const observation = shadowObservation(match, decision);
      incrementMetric(metrics, observation);
      return observation;
    });
    return { failedOpen: false, metrics, observations, pairCandidateMatrix: matched.pairCandidateMatrix };
  } catch {
    return failedOpenResult();
  }
}

export type { MemoryAdmissionState, MemoryCandidateKind, KnowledgeKind };
export type { DirectChatMemoryPairCandidateMatrixEntry };
