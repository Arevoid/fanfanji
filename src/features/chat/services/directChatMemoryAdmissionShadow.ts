import { evaluateKnowledgeWrite } from "../../../domain/characterKnowledge/knowledgeWritePolicy";
import type { KnowledgeClaim, KnowledgeWriteCandidate } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {
  evaluateMemoryCandidate,
  type MemoryAdmissionDecision,
  type MemoryAdmissionState,
  type MemoryAdmissionTarget,
} from "../../../domain/memory/memoryAdmission";
import type { MemoryCandidate } from "../../../domain/memory/memoryCandidate";
import type { MemoryExtractionResult } from "../../../domain/memory/memoryTypes";
import {
  adaptDirectChatMemoryExtractionToCandidates,
  type DirectChatMemoryCandidateAdapterInput,
} from "./directChatMemoryCandidateAdapter";
export type DirectChatMemoryMismatchCategory =
  | "both_allow"
  | "old_allow_new_reject"
  | "old_allow_new_review"
  | "old_reject_new_accept"
  | "both_reject"
  | "incomparable";

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
  mismatch: DirectChatMemoryMismatchCategory;
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
  unknownKindCount: number;
  missingTemporalCount: number;
  sceneClassificationUnavailableCount: number;
  mismatchCounts: Record<DirectChatMemoryMismatchCategory, number>;
  observations: readonly DirectChatMemoryShadowObservation[];
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

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] || 0) + 1;
}

function legacyWriteCandidate(claim: KnowledgeClaim): KnowledgeWriteCandidate {
  return {
    id: claim.id,
    relationId: claim.relationId,
    characterId: claim.characterId,
    userIdentityId: claim.userIdentityId,
    ...(claim.conversationId ? { conversationId: claim.conversationId } : {}),
    kind: claim.kind,
    subject: claim.subject,
    statement: claim.statement,
    temporalStatus: claim.temporalStatus,
    source: claim.source,
    confidence: claim.confidence,
    ...(claim.importance !== undefined ? { importance: claim.importance } : {}),
    userConfirmed: claim.userConfirmed,
    ...(claim.occurredAt !== undefined ? { occurredAt: claim.occurredAt } : {}),
    recordedAt: claim.recordedAt,
    ...(claim.validFrom !== undefined ? { validFrom: claim.validFrom } : {}),
    ...(claim.validTo !== undefined ? { validTo: claim.validTo } : {}),
  };
}

function mismatchFor(oldAllowed: boolean, decision: MemoryAdmissionDecision): DirectChatMemoryMismatchCategory {
  if (oldAllowed && decision.state === "accepted") return "both_allow";
  if (oldAllowed && decision.state === "rejected") return "old_allow_new_reject";
  if (oldAllowed && decision.state === "needs_review") return "old_allow_new_review";
  if (!oldAllowed && decision.state === "accepted") return "old_reject_new_accept";
  if (!oldAllowed && decision.state === "rejected") return "both_reject";
  return "incomparable";
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
    unknownKindCount: 0,
    missingTemporalCount: 0,
    sceneClassificationUnavailableCount: 0,
    mismatchCounts: emptyMismatches(),
    observations: [],
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
    const observations: DirectChatMemoryShadowObservation[] = [];
    let duplicateCount = 0;
    let missingScopeCount = 0;
    let missingProvenanceCount = 0;
    let unknownKindCount = 0;
    let missingTemporalCount = 0;

    adapted.candidates.forEach((candidate, index) => {
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

      const oldDecision = input.extraction.acceptedClaims[index]
        ? evaluateKnowledgeWrite(legacyWriteCandidate(input.extraction.acceptedClaims[index]))
        : undefined;
      const mismatch = oldDecision ? mismatchFor(oldDecision.accepted, decision) : "incomparable";
      mismatchCounts[mismatch] += 1;
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
        mismatch,
      });
    });
    mismatchCounts.incomparable += input.extraction.rejectedCandidateCount;

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
      unknownKindCount: adapted.unsupportedKindCount,
      missingTemporalCount,
      sceneClassificationUnavailableCount: adapted.sceneClassificationUnavailableCount,
      mismatchCounts,
      observations,
    };
  } catch {
    return failedOpenResult();
  }
}
