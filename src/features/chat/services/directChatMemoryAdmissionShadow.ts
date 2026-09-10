import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {
  evaluateMemoryCandidate,
  type MemoryAdmissionDecision,
  type MemoryAdmissionState,
  type MemoryAdmissionTarget,
} from "../../../domain/memory/memoryAdmission";
import type { MemoryCandidate } from "../../../domain/memory/memoryCandidate";
import type { MemoryExtractionResult } from "../../../domain/memory/memoryTypes";
import type { MemoryExtractionCandidateDecision, MemoryExtractionRejectionDiagnostic } from "../../../domain/memory/memoryExtractionSchema";
import { buildMemoryShadowCorrelationKey } from "../../../domain/memory/memoryShadowCorrelation";
import {
  adaptDirectChatMemoryExtractionToCandidates,
  type DirectChatMemoryCandidateAdapterInput,
} from "./directChatMemoryCandidateAdapter";
import {
  classifyAdmissionComparisonMismatch,
  classifyLegacyAdmissionSemantics,
  classifyV2AdmissionSemantics,
  legacyClaimMatchesDiagnostic,
  type MemoryAdmissionComparisonMismatchClass,
  type MemoryAdmissionComparisonSemantics,
} from "./directChatMemoryAdmissionComparison";
import {
  observeDirectChatMemoryAdmissionBridgeShadow,
  type DirectChatMemoryBridgeShadowResult,
} from "./directChatMemoryAdmissionBridgeShadow";
export type DirectChatMemoryMismatchCategory =
  | "both_allow"
  | "old_allow_new_reject"
  | "old_allow_new_review"
  | "old_reject_new_accept"
  | "both_reject"
  | "incomparable";

export type DirectChatMemoryShadowSeverity = "P0" | "P1" | "P2" | "P3" | "P4";

export interface DirectChatMemoryShadowObservation {
  candidateId: string;
  idempotencyKey: string;
  candidateKind: MemoryCandidate["candidateKind"];
  decision: MemoryAdmissionState;
  reason: MemoryAdmissionDecision["reason"];
  target?: MemoryAdmissionTarget;
  sourceMessageCount: number;
  sourceEventCount: number;
  sourceRecordCount: number;
  scopeComplete: boolean;
  provenancePresent: boolean;
  temporalStatus: MemoryCandidate["temporal"]["status"];
  metadataSource?: MemoryCandidate["metadataSource"];
  epistemicStatus?: MemoryCandidate["epistemicStatus"];
  planLifecycle?: MemoryCandidate["planLifecycle"];
  proposedAuthorityRole?: MemoryCandidate["proposedAuthorityRole"];
  resolvedAuthorityRole?: MemoryCandidate["resolvedAuthorityRole"];
  mismatch: DirectChatMemoryMismatchCategory;
  mismatchClass: MemoryAdmissionComparisonMismatchClass;
  legacyComparison?: MemoryAdmissionComparisonSemantics;
  v2Comparison: MemoryAdmissionComparisonSemantics;
  legacyDecision: MemoryExtractionCandidateDecision;
  legacyReasonCode: string;
  v2State: MemoryAdmissionState;
  v2ReasonCode: MemoryAdmissionDecision["reason"];
  v2TargetKind?: MemoryAdmissionTarget;
  scopeExact: boolean;
  evidenceTraceable: boolean;
  duplicateDetected: boolean;
  sourceCount: number;
  sourceFingerprint: string;
  lineagePresent: boolean;
  kindMismatch: boolean;
  temporalMismatch: boolean;
  scopeMismatch: boolean;
  provenanceMismatch: boolean;
  severity: DirectChatMemoryShadowSeverity;
}

export interface DirectChatMemoryAdmissionShadowResult {
  failedOpen: boolean;
  candidateCount: number;
  decisionCounts: Record<MemoryAdmissionState, number>;
  acceptedByTarget: Record<MemoryAdmissionTarget, number>;
  rejectedByReason: Record<string, number>;
  needsReviewByReason: Record<string, number>;
  duplicateCount: number;
  missingScopeCount: number;
  missingProvenanceCount: number;
  invalidSourceReferenceCount: number;
  duplicateSourceReferenceCount: number;
  partialSourceReferenceCount: number;
  scopeMismatchCount: number;
  canonicalBindingSuccessCount: number;
  unknownKindCount: number;
  missingTemporalCount: number;
  sceneClassificationUnavailableCount: number;
  mismatchCounts: Record<DirectChatMemoryMismatchCategory, number>;
  comparisonMismatchCounts: Record<MemoryAdmissionComparisonMismatchClass, number>;
  severityCounts: Record<DirectChatMemoryShadowSeverity, number>;
  observations: readonly DirectChatMemoryShadowObservation[];
  /** Additive pure bridge characterization; never feeds legacy decisions. */
  bridgeShadow: DirectChatMemoryBridgeShadowResult;
}

const emptyDecisionCounts = (): Record<MemoryAdmissionState, number> => ({
  accepted: 0,
  rejected: 0,
  deferred: 0,
  duplicate: 0,
  needs_review: 0,
});

const emptyTargets = (): Record<MemoryAdmissionTarget, number> => ({ truth: 0, event: 0, episodic: 0, belief: 0 });
const emptyMismatches = (): Record<DirectChatMemoryMismatchCategory, number> => ({
  both_allow: 0,
  old_allow_new_reject: 0,
  old_allow_new_review: 0,
  old_reject_new_accept: 0,
  both_reject: 0,
  incomparable: 0,
});
const emptyComparisonMismatches = (): Record<MemoryAdmissionComparisonMismatchClass, number> => ({
  none: 0,
  safe_semantic_divergence: 0,
  authority_escalation: 0,
  destination_divergence: 0,
  write_eligibility_divergence: 0,
  incomparable: 0,
});
const emptySeverities = (): Record<DirectChatMemoryShadowSeverity, number> => ({ P0: 0, P1: 0, P2: 0, P3: 0, P4: 0 });

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] || 0) + 1;
}

const fingerprint = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const candidateCorrelationKey = (candidate: MemoryCandidate): string | undefined => {
  const sourceIds = [
    ...(candidate.evidence.sourceMessageIds || []),
    ...(candidate.evidence.sourceEventIds || []),
    ...(candidate.evidence.sourceRecordIds || []),
  ].filter(Boolean).sort();
  return buildMemoryShadowCorrelationKey(sourceIds, candidate.temporal.status);
};

const claimCorrelationKey = (claim: KnowledgeClaim): string | undefined => {
  const sourceIds = [
    ...(claim.source.messageIds || []),
    claim.source.eventId,
    claim.source.sourceRecordId,
    claim.source.storyId,
  ].filter((value): value is string => Boolean(value)).sort();
  return sourceIds.length > 0
    ? buildMemoryShadowCorrelationKey(sourceIds, claim.temporalStatus)
    : undefined;
};

function fallbackLegacyDiagnostics(input: DirectChatMemoryCandidateAdapterInput): MemoryExtractionRejectionDiagnostic[] {
  return input.extraction.acceptedClaims.map((claim) => {
    const sourceIds = claim.source.messageIds || [];
    return {
      decision: "accepted",
      stage: "knowledge_gate",
      reason: "accepted",
      candidateKind: claim.kind === "preference" || claim.kind === "hypothesis" ? "unknown" : claim.kind,
      sourceMessageCount: sourceIds.length,
      temporalStatus: claim.temporalStatus,
      ...(sourceIds.length ? { correlationKey: buildMemoryShadowCorrelationKey(sourceIds, claim.temporalStatus) } : {}),
    };
  });
}

function mismatchFor(oldAllowed: boolean, decision: MemoryAdmissionDecision): DirectChatMemoryMismatchCategory {
  if (oldAllowed && decision.state === "accepted") return "both_allow";
  if (oldAllowed && decision.state === "rejected") return "old_allow_new_reject";
  if (oldAllowed && decision.state === "needs_review") return "old_allow_new_review";
  if (!oldAllowed && decision.state === "accepted") return "old_reject_new_accept";
  if (!oldAllowed && decision.state === "rejected") return "both_reject";
  return "incomparable";
}

function severityFor(input: {
  mismatch: DirectChatMemoryMismatchCategory;
  mismatchClass: MemoryAdmissionComparisonMismatchClass;
  decision: MemoryAdmissionDecision;
  legacyComparison?: MemoryAdmissionComparisonSemantics;
  scopeExact: boolean;
  provenancePresent: boolean;
  evidenceTraceable: boolean;
}): DirectChatMemoryShadowSeverity {
  if (!input.scopeExact || !input.provenancePresent || !input.evidenceTraceable) return "P0";
  if (input.mismatchClass === "authority_escalation"
    || input.mismatch === "old_reject_new_accept"
    || (input.decision.reason === "cancelled_plan_not_active"
      && input.legacyComparison?.destinationClass === "future_plan")) return "P1";
  if (input.decision.reason === "invalid_temporal"
    || input.decision.reason === "metadata_conflict") return "P1";
  if (input.mismatchClass === "safe_semantic_divergence"
    || input.mismatchClass === "destination_divergence"
    || input.mismatchClass === "write_eligibility_divergence"
    || input.mismatch === "old_allow_new_reject"
    || input.mismatch === "old_allow_new_review") return "P2";
  if (input.mismatch === "incomparable" || input.decision.reason === "unsupported_kind") return "P3";
  return "P4";
}

function failedOpenResult(): DirectChatMemoryAdmissionShadowResult {
  return {
    failedOpen: true,
    candidateCount: 0,
    decisionCounts: emptyDecisionCounts(),
    acceptedByTarget: emptyTargets(),
    rejectedByReason: {},
    needsReviewByReason: {},
    duplicateCount: 0,
    missingScopeCount: 0,
    missingProvenanceCount: 0,
    invalidSourceReferenceCount: 0,
    duplicateSourceReferenceCount: 0,
    partialSourceReferenceCount: 0,
    scopeMismatchCount: 0,
    canonicalBindingSuccessCount: 0,
    unknownKindCount: 0,
    missingTemporalCount: 0,
    sceneClassificationUnavailableCount: 0,
    mismatchCounts: emptyMismatches(),
    comparisonMismatchCounts: emptyComparisonMismatches(),
    severityCounts: emptySeverities(),
    observations: [],
    bridgeShadow: {
      failedOpen: true,
      metrics: {
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
      },
      observations: [],
      pairCandidateMatrix: [],
    },
  };
}

export function observeDirectChatMemoryAdmissionShadow(
  input: DirectChatMemoryCandidateAdapterInput,
): DirectChatMemoryAdmissionShadowResult {
  try {
    const adapted = adaptDirectChatMemoryExtractionToCandidates(input);
    const decisionCounts = emptyDecisionCounts();
    const acceptedByTarget = emptyTargets();
    const rejectedByReason: Record<string, number> = {};
    const needsReviewByReason: Record<string, number> = {};
    const mismatchCounts = emptyMismatches();
    const comparisonMismatchCounts = emptyComparisonMismatches();
    const severityCounts = emptySeverities();
    const observations: DirectChatMemoryShadowObservation[] = [];
    const diagnosticsProvided = Array.isArray(input.extraction.rejectedCandidates);
    const legacyDiagnostics = diagnosticsProvided
      ? input.extraction.rejectedCandidates || []
      : fallbackLegacyDiagnostics(input);
    const usedLegacyDiagnostics = new Set<number>();
    const usedLegacyClaims = new Set<string>();
    const diagnosticsByCorrelation = new Map<string, number[]>();
    const claimsByCorrelation = new Map<string, KnowledgeClaim[]>();
    legacyDiagnostics.forEach((diagnostic, diagnosticIndex) => {
      if (!diagnostic.correlationKey) return;
      const existing = diagnosticsByCorrelation.get(diagnostic.correlationKey) || [];
      existing.push(diagnosticIndex);
      diagnosticsByCorrelation.set(diagnostic.correlationKey, existing);
    });
    input.extraction.acceptedClaims.forEach((claim) => {
      const correlationKey = claimCorrelationKey(claim);
      if (!correlationKey) return;
      const existing = claimsByCorrelation.get(correlationKey) || [];
      existing.push(claim);
      claimsByCorrelation.set(correlationKey, existing);
    });
    let duplicateCount = 0;
    let missingScopeCount = 0;
    let missingProvenanceCount = 0;
    let unknownKindCount = 0;
    let missingTemporalCount = 0;

    adapted.candidates.forEach((candidate) => {
      const decision = evaluateMemoryCandidate(candidate, { knownIdempotencyKeys: input.knownIdempotencyKeys });
      decisionCounts[decision.state] += 1;
      if (decision.target) acceptedByTarget[decision.target] += 1;
      if (decision.state === "rejected") increment(rejectedByReason, decision.reason);
      if (decision.state === "needs_review") increment(needsReviewByReason, decision.reason);
      if (decision.state === "duplicate") duplicateCount += 1;
      if (decision.reason === "insufficient_scope") missingScopeCount += 1;
      if (decision.reason === "missing_provenance") missingProvenanceCount += 1;
      if (decision.reason === "unsupported_kind") unknownKindCount += 1;
      if (decision.reason === "invalid_temporal") missingTemporalCount += 1;

      const correlationKey = candidateCorrelationKey(candidate);
      const matchingDiagnosticIndexes = correlationKey ? diagnosticsByCorrelation.get(correlationKey) || [] : [];
      const availableDiagnosticIndexes = matchingDiagnosticIndexes.filter((diagnosticIndex) => !usedLegacyDiagnostics.has(diagnosticIndex));
      const legacyDiagnostic = availableDiagnosticIndexes.length === 1
        ? legacyDiagnostics[availableDiagnosticIndexes[0]]
        : undefined;
      if (legacyDiagnostic && availableDiagnosticIndexes.length === 1) usedLegacyDiagnostics.add(availableDiagnosticIndexes[0]!);
      const legacyClaims = correlationKey ? claimsByCorrelation.get(correlationKey) || [] : [];
      const legacyClaim = legacyDiagnostic?.decision === "accepted"
        ? legacyClaims.find((claim) => !usedLegacyClaims.has(claim.id)
          && legacyClaimMatchesDiagnostic(claim, legacyDiagnostic.candidateKind))
        : undefined;
      if (legacyClaim) usedLegacyClaims.add(legacyClaim.id);
      const legacyAllowed = legacyDiagnostic?.decision === "accepted";
      const mismatch = legacyDiagnostic
        ? mismatchFor(Boolean(legacyAllowed), decision)
        : "incomparable";
      const legacyComparison = legacyDiagnostic
        ? classifyLegacyAdmissionSemantics({
          decision: legacyDiagnostic.decision,
          candidateKind: legacyDiagnostic.candidateKind,
          truthStatus: legacyClaim?.truthStatus,
        }, legacyClaim)
        : undefined;
      const v2Comparison = classifyV2AdmissionSemantics(candidate, decision);
      const mismatchClass = classifyAdmissionComparisonMismatch(legacyComparison, v2Comparison);
      const scopeExact = Boolean(candidate.scope.characterId
        && candidate.scope.relationId
        && candidate.scope.userIdentityId
        && candidate.scope.conversationId);
      const sourceReferences = [
        ...(candidate.evidence.sourceMessageIds || []),
        ...(candidate.evidence.sourceEventIds || []),
        ...(candidate.evidence.sourceRecordIds || []),
      ].filter(Boolean);
      const provenancePresent = Boolean(candidate.provenance.producer
        && candidate.provenance.sourceType
        && candidate.provenance.authorship);
      const evidenceTraceable = sourceReferences.length > 0;
      const severity = severityFor({
        mismatch,
        mismatchClass,
        decision,
        legacyComparison,
        scopeExact,
        provenancePresent,
        evidenceTraceable,
      });
      mismatchCounts[mismatch] += 1;
      comparisonMismatchCounts[mismatchClass] += 1;
      severityCounts[severity] += 1;
      observations.push({
        candidateId: candidate.candidateId,
        idempotencyKey: decision.idempotencyKey,
        candidateKind: candidate.candidateKind,
        decision: decision.state,
        reason: decision.reason,
        ...(decision.target ? { target: decision.target } : {}),
        sourceMessageCount: candidate.evidence.sourceMessageIds?.length || 0,
        sourceEventCount: candidate.evidence.sourceEventIds?.length || 0,
        sourceRecordCount: candidate.evidence.sourceRecordIds?.length || 0,
        scopeComplete: Boolean(candidate.scope.characterId && candidate.scope.relationId && candidate.scope.userIdentityId),
        provenancePresent: Boolean(candidate.provenance.producer && candidate.provenance.sourceType && candidate.provenance.authorship),
        temporalStatus: candidate.temporal.status,
        ...(candidate.metadataSource ? { metadataSource: candidate.metadataSource } : {}),
        ...(candidate.epistemicStatus ? { epistemicStatus: candidate.epistemicStatus } : {}),
        ...(candidate.planLifecycle ? { planLifecycle: candidate.planLifecycle } : {}),
        ...(candidate.proposedAuthorityRole ? { proposedAuthorityRole: candidate.proposedAuthorityRole } : {}),
        ...(candidate.resolvedAuthorityRole ? { resolvedAuthorityRole: candidate.resolvedAuthorityRole } : {}),
        mismatch,
        mismatchClass,
        ...(legacyComparison ? { legacyComparison } : {}),
        v2Comparison,
        legacyDecision: legacyDiagnostic?.decision || "incomparable",
        legacyReasonCode: legacyDiagnostic?.reason || "legacy_candidate_unavailable",
        v2State: decision.state,
        v2ReasonCode: decision.reason,
        ...(decision.target ? { v2TargetKind: decision.target } : {}),
        scopeExact,
        evidenceTraceable,
        duplicateDetected: decision.state === "duplicate",
        sourceCount: sourceReferences.length,
        sourceFingerprint: fingerprint(sourceReferences.slice().sort().join("\u0000")),
        lineagePresent: Boolean(candidate.lineage?.parentActionId || candidate.lineage?.producerActionId || candidate.lineage?.sourceRequestId),
        kindMismatch: Boolean(legacyDiagnostic?.candidateKind && legacyDiagnostic.candidateKind !== candidate.candidateKind),
        temporalMismatch: Boolean(legacyDiagnostic?.temporalStatus && legacyDiagnostic.temporalStatus !== candidate.temporal.status),
        scopeMismatch: !scopeExact,
        provenanceMismatch: !provenancePresent || !evidenceTraceable,
        severity,
      });
    });
    if (!diagnosticsProvided) {
      mismatchCounts.incomparable += input.extraction.rejectedCandidateCount;
    } else {
      legacyDiagnostics.forEach((_, diagnosticIndex) => {
        if (!usedLegacyDiagnostics.has(diagnosticIndex)) mismatchCounts.incomparable += 1;
      });
    }

    let bridgeShadow: DirectChatMemoryBridgeShadowResult;
    try {
      bridgeShadow = observeDirectChatMemoryAdmissionBridgeShadow(input);
    } catch {
      // Bridge shadow is strictly fail-open; existing comparator output is
      // returned even when the additive adapter cannot characterize a result.
      bridgeShadow = failedOpenResult().bridgeShadow;
    }

    return {
      failedOpen: false,
      candidateCount: adapted.candidates.length,
      decisionCounts,
      acceptedByTarget,
      rejectedByReason,
      needsReviewByReason,
      duplicateCount,
      missingScopeCount,
      missingProvenanceCount,
      invalidSourceReferenceCount: adapted.invalidSourceReferenceCount,
      duplicateSourceReferenceCount: adapted.duplicateSourceReferenceCount,
      partialSourceReferenceCount: adapted.partialSourceReferenceCount,
      scopeMismatchCount: adapted.scopeMismatchCount,
      canonicalBindingSuccessCount: adapted.canonicalBindingSuccessCount,
      unknownKindCount: adapted.unsupportedKindCount,
      missingTemporalCount,
      sceneClassificationUnavailableCount: adapted.sceneClassificationUnavailableCount,
      mismatchCounts,
      comparisonMismatchCounts,
      severityCounts,
      observations,
      bridgeShadow,
    };
  } catch {
    return failedOpenResult();
  }
}
