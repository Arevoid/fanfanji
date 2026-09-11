import type { MemoryItem } from "../../../types";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { listByRelation as listKnowledgeClaimsByRelation, loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import {
  conversationSummaryRepository,
  loadConversationSummaries,
} from "../../../core/storage/repositories/conversationSummaryRepository";
import { loadMemories } from "../../../core/storage/repositories/memoryRepository";
import { memoryProjectionJobRepository } from "../../../core/storage/repositories/memoryProjectionJobRepository";
import {
  loadAiRequestLedger,
  type AiRequestEnvelope,
} from "../../../core/monitoring/aiRequestLedger";
import type { MemoryExtractionResult } from "../../../domain/memory/memoryTypes";
import type { DirectChatMemoryAdmissionShadowResult } from "./directChatMemoryAdmissionShadow";
import type { DirectChatMemorySafetyVetoShadowEvaluation } from "./directChatMemorySafetyVetoShadow";
import type { DirectChatMemorySafetyVetoCanaryResult } from "./directChatMemorySafetyVetoCanary";
import {
  deriveLongEvidenceAccounting,
  isDirectChatMemoryLongEvidenceCollectorEnabled,
  recordDirectChatMemoryLongEvidence,
  type DirectChatMemoryLongEvidenceRecord,
  type DirectChatMemoryLongEvidenceScope,
} from "./directChatMemoryLongEvidenceCollector";

export { isDirectChatMemoryLongEvidenceCollectorEnabled } from "./directChatMemoryLongEvidenceCollector";

export interface DirectChatMemoryCanonicalReadback {
  activeClaimIds: readonly string[];
  activeSummaryClaimIds: readonly string[];
  projectionCanonicalRefs: readonly string[];
  legacyMemoryClaimIds: readonly string[];
  activeClaimCount: number;
  activeSummaryCount: number;
  projectionCount: number;
  legacyMemoryCount: number;
}

export interface DirectChatMemoryLongEvidenceRuntimeInput {
  scope: DirectChatMemoryLongEvidenceScope;
  extraction: MemoryExtractionResult;
  admissionShadow: DirectChatMemoryAdmissionShadowResult;
  safetyEvaluation?: DirectChatMemorySafetyVetoShadowEvaluation;
  canaryResult?: DirectChatMemorySafetyVetoCanaryResult;
  acceptedClaimsBefore: readonly KnowledgeClaim[];
  filteredAcceptedClaims: readonly KnowledgeClaim[];
  canonicalBefore: DirectChatMemoryCanonicalReadback;
  canonicalAfter: DirectChatMemoryCanonicalReadback;
  canonicalWriteSucceeded: boolean;
  cursorAdvanced: boolean;
  logicalActionId: string;
  extractionLatencyMs?: number;
  canaryFilteringLatencyMs?: number;
}

export interface DirectChatMemoryLongEvidenceRuntimeResult {
  recorded: readonly DirectChatMemoryLongEvidenceRecord[];
  accounting: ReturnType<typeof deriveLongEvidenceAccounting>;
}

const exactScope = (value: {
  characterId?: string;
  relationId?: string;
  userIdentityId?: string;
  conversationId?: string;
}, scope: DirectChatMemoryLongEvidenceScope): boolean => value.characterId === scope.characterId
  && value.relationId === scope.relationId
  && value.userIdentityId === scope.userIdentityId
  && value.conversationId === scope.conversationId;

function readActiveClaims(scope: DirectChatMemoryLongEvidenceScope): KnowledgeClaim[] {
  const loaded = loadKnowledgeClaims();
  if (!loaded.valid) return [];
  return listKnowledgeClaimsByRelation(scope, loaded.value).filter((claim) => claim.status === "active");
}

function readActiveSummaries(scope: DirectChatMemoryLongEvidenceScope) {
  const loaded = loadConversationSummaries();
  if (!loaded.valid) return [];
  return conversationSummaryRepository.listByRelation(scope, loaded.value)
    .filter((summary) => summary.status === "active");
}

function readLegacyMemories(scope: DirectChatMemoryLongEvidenceScope): MemoryItem[] {
  const loaded = loadMemories([]);
  if (!loaded.valid) return [];
  return loaded.value.filter((memory) => exactScope(memory, scope));
}

/**
 * Bounded, exact-scope, read-only canonical observation. The caller must gate
 * this function on collector enablement; it never writes or alters authority.
 */
export async function readDirectChatMemoryCanonicalReadback(
  scope: DirectChatMemoryLongEvidenceScope,
): Promise<DirectChatMemoryCanonicalReadback> {
  const [claims, summaries, projectionJobs] = await Promise.all([
    Promise.resolve(readActiveClaims(scope)),
    Promise.resolve(readActiveSummaries(scope)),
    memoryProjectionJobRepository.listByScope(scope).catch(() => []),
  ]);
  const legacyMemories = readLegacyMemories(scope);
  return {
    activeClaimIds: claims.map((claim) => claim.id),
    activeSummaryClaimIds: summaries.flatMap((summary) => summary.sourceClaimIds),
    projectionCanonicalRefs: projectionJobs.flatMap((job) => job.canonicalRefs),
    legacyMemoryClaimIds: legacyMemories.flatMap((memory) => memory.sourceKnowledgeClaimIds || []),
    activeClaimCount: claims.length,
    activeSummaryCount: summaries.length,
    projectionCount: projectionJobs.length,
    legacyMemoryCount: legacyMemories.length,
  };
}

function extractionLatencyBucket(value: number | undefined): "0_5s" | "5_15s" | "15_30s" | "30_60s" | "60s_plus" | "unknown" {
  if (!Number.isFinite(value) || value === undefined || value < 0) return "unknown";
  if (value < 5_000) return "0_5s";
  if (value < 15_000) return "5_15s";
  if (value < 30_000) return "15_30s";
  if (value < 60_000) return "30_60s";
  return "60s_plus";
}

function filteringLatencyBucket(value: number | undefined): "0_10ms" | "10_50ms" | "50_250ms" | "250ms_plus" | "unknown" {
  if (!Number.isFinite(value) || value === undefined || value < 0) return "unknown";
  if (value < 10) return "0_10ms";
  if (value < 50) return "10_50ms";
  if (value < 250) return "50_250ms";
  return "250ms_plus";
}

type BridgeObservation = DirectChatMemoryAdmissionShadowResult["bridgeShadow"]["observations"][number];

function correlationClass(observation: BridgeObservation): "shared_unique" | "shared_non_unique" | "cross_scope" | "unknown" {
  const scopeMismatch = observation.bridgeReason === "scope_mismatch"
    || observation.legacyIdentity?.scopeExact === false
    || observation.v2Identity?.scopeExact === false;
  if (scopeMismatch || observation.bridgeCorrelation === "unmatched_legacy" || observation.bridgeCorrelation === "unmatched_v2") return "cross_scope";
  if (observation.bridgeCorrelation === "conflict" && observation.pairUnique && observation.lineageStatus === "shared") return "shared_unique";
  if (observation.bridgeCorrelation === "exact" && observation.pairUnique) return "shared_unique";
  if (observation.bridgeCorrelation === "ambiguous" || observation.bridgeCorrelation === "duplicate" || observation.bridgeCorrelation === "conflict") return "shared_non_unique";
  return "unknown";
}

function lineageStatus(observation: BridgeObservation): "shared" | "missing" | "conflict" | "unknown" {
  if (observation.lineageStatus === "shared") return "shared";
  if (observation.lineageStatus === "mismatch") return "conflict";
  if (observation.lineageStatus === "partial" || observation.lineageStatus === "absent") return "missing";
  return "unknown";
}

function semanticKind(observation: BridgeObservation): "plan" | "preference" | "fact" | "unknown" {
  if (observation.conflictAnatomy?.v2.semanticKind === "plan") return "plan";
  if (observation.conflictAnatomy?.v2.semanticKind === "preference") return "preference";
  if (observation.conflictAnatomy?.v2.semanticKind === "fact") return "fact";
  return "unknown";
}

function metadataSource(observation: BridgeObservation): "v2_model_native" | "legacy_derived" | "mixed" | "unknown" {
  if (observation.v2MetadataSource === "v2_model_native") return "v2_model_native";
  if (observation.v2MetadataSource === "legacy_claim_semantics" || observation.v2MetadataSource === "legacy_policy_derived") return "legacy_derived";
  if (observation.v2MetadataSource === "runtime_owned") return "mixed";
  return "unknown";
}

function planLifecycle(observation: BridgeObservation): "cancelled" | "active" | "not_applicable" | "unknown" {
  const lifecycle = observation.conflictAnatomy?.v2.planLifecycle;
  return lifecycle === "cancelled" || lifecycle === "active" ? lifecycle : "unknown";
}

function claimIdsPresent(ids: readonly string[], readback: DirectChatMemoryCanonicalReadback): boolean {
  const all = new Set([
    ...readback.activeClaimIds,
    ...readback.activeSummaryClaimIds,
    ...readback.projectionCanonicalRefs,
    ...readback.legacyMemoryClaimIds,
  ]);
  return ids.some((id) => all.has(id));
}

function survivingClaimsPresent(
  claims: readonly KnowledgeClaim[],
  readback: DirectChatMemoryCanonicalReadback,
): boolean {
  return claims.length === 0 || claims.every((claim) => readback.activeClaimIds.includes(claim.id));
}

function filteredClaimIds(claims: readonly KnowledgeClaim[], filtered: readonly KnowledgeClaim[]): string[] {
  const kept = new Set(filtered.map((claim) => claim.id));
  return claims.filter((claim) => !kept.has(claim.id)).map((claim) => claim.id);
}

function ledgerRowsForAction(logicalActionId: string): AiRequestEnvelope[] {
  if (!logicalActionId.trim()) return [];
  return loadAiRequestLedger().filter((record) => record.logicalActionId === logicalActionId);
}

/**
 * Observe one completed automatic Direct Chat extraction. This function is
 * deliberately fail-open and never returns a write decision.
 */
export async function observeDirectChatMemoryLongEvidenceRuntime(
  input: DirectChatMemoryLongEvidenceRuntimeInput,
): Promise<DirectChatMemoryLongEvidenceRuntimeResult> {
  const empty: DirectChatMemoryLongEvidenceRuntimeResult = {
    recorded: [],
    accounting: deriveLongEvidenceAccounting([]),
  };
  if (!isDirectChatMemoryLongEvidenceCollectorEnabled()) return empty;
  try {
    const accounting = deriveLongEvidenceAccounting(ledgerRowsForAction(input.logicalActionId));
    const suppressedIds = filteredClaimIds(input.acceptedClaimsBefore, input.filteredAcceptedClaims);
    const suppressedAbsent = suppressedIds.length > 0 && !claimIdsPresent(suppressedIds, input.canonicalAfter);
    const vetoedSummaryPresent = suppressedIds.some((id) => input.canonicalAfter.activeSummaryClaimIds.includes(id));
    const vetoedProjectionPresent = suppressedIds.some((id) => input.canonicalAfter.projectionCanonicalRefs.includes(id));
    const unexpectedNewClaims = input.canonicalAfter.activeClaimIds.filter((id) =>
      !input.canonicalBefore.activeClaimIds.includes(id)
      && !input.filteredAcceptedClaims.some((claim) => claim.id === id));
    const safetyEvaluation = input.safetyEvaluation?.records || [];
    const canaryRecords = input.canaryResult?.records || [];
    const observations = input.admissionShadow.bridgeShadow.observations.length > 0
      ? input.admissionShadow.bridgeShadow.observations
      : input.admissionShadow.failedOpen ? [undefined] : [];
    const recorded: DirectChatMemoryLongEvidenceRecord[] = [];

    // MemoryExtractor deliberately represents a successful, honest empty
    // extraction as an empty shadowCandidatesV2 array with no rejected
    // candidates and no apiError. Preserve that batch-level fact without
    // manufacturing a candidate observation or a control/suppression result.
    const legitimateZeroCandidate = !input.extraction.apiError
      && Array.isArray(input.extraction.shadowCandidatesV2)
      && input.extraction.shadowCandidatesV2.length === 0
      && input.extraction.acceptedClaims.length === 0
      && input.extraction.rejectedCandidateCount === 0
      && observations.length === 0
      && !input.admissionShadow.failedOpen;
    if (legitimateZeroCandidate) {
      const zeroRecord = recordDirectChatMemoryLongEvidence({
        scope: input.scope,
        recordKind: "batch",
        candidateCount: 0,
        logicalActionId: input.logicalActionId,
        candidate: {
          featureScope: "automatic_direct_chat",
          canaryReason: "none",
          validatorResult: "not_evaluated",
          validatorReason: "legacy_or_v2_candidate_missing",
          bridgeState: "reject",
          bridgeReason: "v2_candidate_missing",
          correlationClass: "unknown",
          lineageStatus: "missing",
          pairUnique: false,
          exactScope: true,
          provenanceTrusted: true,
          metadataSource: "unknown",
          semanticKind: "unknown",
          planLifecycle: "not_applicable",
          legacyAccepted: false,
          legacyWriteEligible: false,
          candidateSuppressed: false,
          vetoedCandidateCanonicalAbsent: false,
          failOpen: false,
        },
        batch: {
          batchAcceptedBefore: 0,
          batchAcceptedAfter: 0,
          batchZeroCandidates: true,
          survivingCanonicalWritesExpected: false,
          survivingCanonicalWritesObserved: input.canonicalWriteSucceeded,
          cursorAdvanced: input.cursorAdvanced,
          canonicalWriteCountDelta: Math.max(0, input.canonicalAfter.activeClaimCount - input.canonicalBefore.activeClaimCount),
          summaryDelta: Math.max(0, input.canonicalAfter.activeSummaryCount - input.canonicalBefore.activeSummaryCount),
          projectionDelta: Math.max(0, input.canonicalAfter.projectionCount - input.canonicalBefore.projectionCount),
          v2OnlyWrite: false,
          cursorLoop: false,
          replayLoop: false,
          blockingMaterialUserRegression: false,
        },
        accounting,
        performance: {
          extractionLatencyBucket: extractionLatencyBucket(input.extractionLatencyMs),
          canaryFilteringLatencyBucket: filteringLatencyBucket(input.canaryFilteringLatencyMs),
          privacyStatus: "metadata_only",
        },
      });
      if (zeroRecord) recorded.push(zeroRecord);
      return { recorded, accounting };
    }

    observations.forEach((observation, index) => {
      const safety = safetyEvaluation[index];
      const canary = canaryRecords[index];
      const candidateSuppressed = Boolean(canary?.suppressed);
      const record = recordDirectChatMemoryLongEvidence({
        scope: input.scope,
        logicalActionId: input.logicalActionId,
        candidateObservationOrdinal: index + 1,
        candidate: {
          featureScope: "automatic_direct_chat",
          canaryReason: candidateSuppressed ? "SAFETY_VETO_CANCELLED_PLAN" : "none",
          validatorResult: safety?.validatorResult || "not_evaluated",
          validatorReason: safety?.validatorReason || "unknown_safety_veto_reason",
          bridgeState: observation?.bridgeState || "unknown",
          bridgeReason: observation?.bridgeReason || "unknown",
          correlationClass: observation ? correlationClass(observation) : "unknown",
          lineageStatus: observation ? lineageStatus(observation) : "unknown",
          pairUnique: observation?.pairUnique,
          exactScope: observation?.legacyIdentity?.scopeExact === true && observation?.v2Identity?.scopeExact === true,
          provenanceTrusted: observation?.legacyProvenanceTrusted === true && observation?.v2ProvenanceTrusted === true,
          metadataSource: observation ? metadataSource(observation) : "unknown",
          semanticKind: observation ? semanticKind(observation) : "unknown",
          planLifecycle: observation ? planLifecycle(observation) : "unknown",
          legacyAccepted: observation?.legacyAccepted,
          legacyWriteEligible: observation?.legacyWriteEligibility === "canonical_write",
          candidateSuppressed,
          vetoedCandidateCanonicalAbsent: candidateSuppressed && suppressedAbsent,
          failOpen: Boolean(input.admissionShadow.failedOpen || safety?.failOpen || canary?.failOpen),
        },
        batch: {
          batchAcceptedBefore: input.acceptedClaimsBefore.length,
          batchAcceptedAfter: input.filteredAcceptedClaims.length,
          batchZeroCandidates: input.filteredAcceptedClaims.length === 0,
          survivingCanonicalWritesExpected: input.filteredAcceptedClaims.length > 0,
          survivingCanonicalWritesObserved: input.canonicalWriteSucceeded
            && survivingClaimsPresent(input.filteredAcceptedClaims, input.canonicalAfter),
          cursorAdvanced: input.cursorAdvanced,
          canonicalWriteCountDelta: Math.max(0, input.canonicalAfter.activeClaimCount - input.canonicalBefore.activeClaimCount),
          summaryDelta: Math.max(0, input.canonicalAfter.activeSummaryCount - input.canonicalBefore.activeSummaryCount),
          projectionDelta: Math.max(0, input.canonicalAfter.projectionCount - input.canonicalBefore.projectionCount),
          vetoedCandidateSummaryPresent: vetoedSummaryPresent,
          vetoedCandidateProjectionPresent: vetoedProjectionPresent,
          v2OnlyWrite: unexpectedNewClaims.length > 0,
          cursorLoop: false,
          replayLoop: false,
          blockingMaterialUserRegression: false,
        },
        accounting,
        performance: {
          extractionLatencyBucket: extractionLatencyBucket(input.extractionLatencyMs),
          canaryFilteringLatencyBucket: filteringLatencyBucket(input.canaryFilteringLatencyMs),
          privacyStatus: "metadata_only",
        },
      });
      if (record) recorded.push(record);
    });
    return { recorded, accounting };
  } catch {
    return empty;
  }
}
