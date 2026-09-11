import {
  aggregateAiRequestLedgerAccounting,
  createAiActionId,
  type AiRequestEnvelope,
} from "../../../core/monitoring/aiRequestLedger";
import { createId } from "../../../core/id/createId";

export const LONG_EVIDENCE_SCHEMA_VERSION = "memory-admission-v2-long-evidence-1" as const;
export const LONG_EVIDENCE_MAX_RECORDS = 100 as const;

export type LongEvidenceClassification =
  | "VALID_ELIGIBLE_SUPPRESSION"
  | "VALID_CONTROL"
  | "ZERO_CANDIDATE_BATCH"
  | "FAIL_OPEN_OBSERVATION"
  | "INVALID_SAMPLE"
  | "SAFETY_INCIDENT";

export type LongEvidenceRecordKind = "candidate" | "batch";

export type LongEvidenceValidatorResult = "allow_veto" | "deny_veto" | "not_evaluated" | "unknown";
export type LongEvidencePrivacyStatus = "metadata_only" | "violation";
export type LongEvidenceAccountingShape = "single_row" | "fallback_split_rows" | "unknown";

export interface DirectChatMemoryLongEvidenceScope {
  characterId: string;
  relationId: string;
  userIdentityId: string;
  conversationId: string;
}

export interface DirectChatMemoryLongEvidenceCandidateInput {
  featureScope?: string;
  canaryReason?: string;
  validatorResult?: string;
  validatorReason?: string;
  bridgeState?: string;
  bridgeReason?: string;
  correlationClass?: string;
  lineageStatus?: string;
  pairUnique?: boolean;
  exactScope?: boolean;
  provenanceTrusted?: boolean;
  metadataSource?: string;
  semanticKind?: string;
  planLifecycle?: string;
  legacyAccepted?: boolean;
  legacyWriteEligible?: boolean;
  candidateSuppressed?: boolean;
  vetoedCandidateCanonicalAbsent?: boolean;
  failOpen?: boolean;
}

export interface DirectChatMemoryLongEvidenceBatchInput {
  batchAcceptedBefore: number;
  batchAcceptedAfter: number;
  batchZeroCandidates: boolean;
  survivingCanonicalWritesExpected: boolean;
  survivingCanonicalWritesObserved: boolean;
  cursorAdvanced: boolean;
  canonicalWriteCountDelta: number;
  summaryDelta: number;
  projectionDelta: number;
  /** Read-only canonical readback safety signals. They never trigger a write. */
  vetoedCandidateSummaryPresent?: boolean;
  vetoedCandidateProjectionPresent?: boolean;
  v2OnlyWrite?: boolean;
  cursorLoop?: boolean;
  replayLoop?: boolean;
  blockingMaterialUserRegression?: boolean;
}

export interface DirectChatMemoryLongEvidenceAccountingInput {
  providerLogicalRequestCount: number;
  providerPhysicalAttemptCount: number;
  accountingShape: LongEvidenceAccountingShape;
  promptDelta: number;
  canaryProviderDelta: number;
}

export interface DirectChatMemoryLongEvidencePerformanceInput {
  extractionLatencyBucket: LongEvidenceExtractionLatencyBucket;
  canaryFilteringLatencyBucket: LongEvidenceFilteringLatencyBucket;
  privacyStatus: LongEvidencePrivacyStatus;
}

export interface DirectChatMemoryLongEvidenceInput {
  scope: DirectChatMemoryLongEvidenceScope;
  candidate: DirectChatMemoryLongEvidenceCandidateInput;
  batch: DirectChatMemoryLongEvidenceBatchInput;
  accounting: DirectChatMemoryLongEvidenceAccountingInput;
  performance: DirectChatMemoryLongEvidencePerformanceInput;
  /** Candidate records are the historical default; batch records are additive. */
  recordKind?: LongEvidenceRecordKind;
  /** Required to be zero for a ZERO_CANDIDATE_BATCH record. */
  candidateCount?: number;
  /** Raw lineage is consumed only to create an opaque, in-memory-safe token. */
  logicalActionId?: string;
  /** Optional bounded candidate-local ordinal; never a raw candidate identifier. */
  candidateObservationOrdinal?: number;
}

export type LongEvidenceExtractionLatencyBucket = "0_5s" | "5_15s" | "15_30s" | "30_60s" | "60s_plus" | "unknown";
export type LongEvidenceFilteringLatencyBucket = "0_10ms" | "10_50ms" | "50_250ms" | "250ms_plus" | "unknown";

export interface DirectChatMemoryLongEvidenceRecord {
  schemaVersion: typeof LONG_EVIDENCE_SCHEMA_VERSION;
  /** Optional for backward compatibility with pre-RG1 candidate artifacts. */
  recordKind?: LongEvidenceRecordKind;
  /** Present on new batch-level records; never contains candidate content. */
  candidateCount?: number;
  timeBucket: string;
  featureScope: "automatic_direct_chat" | "unknown";
  sessionOrdinal: number;
  windowOrdinal: number | null;
  /** Reviewer-safe identities; raw token/nonce values never leave memory. */
  windowFingerprint: string | null;
  sessionFingerprint: string;
  evidenceRecordFingerprint: string;
  observationOrdinal: number;
  evidenceDay: string;
  evidenceMode: "formal_window" | "dry_run";
  scopeFingerprint: string;
  logicalActionFingerprint: string;
  batchActionFingerprint: string;
  canaryReason: "SAFETY_VETO_CANCELLED_PLAN" | "none" | "unknown";
  validatorResult: LongEvidenceValidatorResult;
  validatorReason: string;
  bridgeState: string;
  bridgeReason: string;
  correlationClass: "shared_unique" | "shared_non_unique" | "cross_scope" | "unknown";
  lineageStatus: "shared" | "missing" | "conflict" | "unknown";
  pairUnique: boolean;
  exactScope: boolean;
  provenanceTrusted: boolean;
  metadataSource: "v2_model_native" | "legacy_derived" | "mixed" | "unknown";
  semanticKind: "plan" | "preference" | "fact" | "unknown";
  planLifecycle: "cancelled" | "active" | "not_applicable" | "unknown";
  legacyAccepted: boolean;
  legacyWriteEligible: boolean;
  candidateSuppressed: boolean;
  vetoedCandidateCanonicalAbsent: boolean;
  failOpen: boolean;
  batchAcceptedBefore: number;
  batchAcceptedAfter: number;
  batchZeroCandidates: boolean;
  survivingCanonicalWritesExpected: boolean;
  survivingCanonicalWritesObserved: boolean;
  cursorAdvanced: boolean;
  canonicalWriteCountDelta: number;
  summaryDelta: number;
  projectionDelta: number;
  providerLogicalRequestCount: number;
  providerPhysicalAttemptCount: number;
  accountingShape: LongEvidenceAccountingShape;
  promptDelta: number;
  canaryProviderDelta: number;
  extractionLatencyBucket: LongEvidenceExtractionLatencyBucket;
  canaryFilteringLatencyBucket: LongEvidenceFilteringLatencyBucket;
  privacyStatus: LongEvidencePrivacyStatus;
  vetoedCandidateSummaryPresent: boolean;
  vetoedCandidateProjectionPresent: boolean;
  v2OnlyWrite: boolean;
  cursorLoop: boolean;
  replayLoop: boolean;
  blockingMaterialUserRegression: boolean;
  classification: LongEvidenceClassification;
}

export interface DirectChatMemoryLongEvidenceSummary {
  schemaVersion: typeof LONG_EVIDENCE_SCHEMA_VERSION;
  persistenceMode: "in_memory_only";
  enabled: boolean;
  sessionOrdinal: number | null;
  windowOrdinal: number | null;
  windowState: "not_started" | "active" | "finished";
  recordCount: number;
  countsByClassification: Record<LongEvidenceClassification, number>;
  sessionCount: number;
  formalSessionCount: number;
  formalWindowCount: number;
  windowFingerprint: string | null;
  formalWindowRecordCount: number;
  distinctExactScopeCount: number;
  extractionBatchCount: number;
  validSuppressionCount: number;
  validControlCount: number;
  zeroCandidateBatchCount: number;
  controlCount: number;
  failOpenCount: number;
  invalidSampleCount: number;
  safetyIncidentCount: number;
  logicalActionTotal: number;
  physicalAttemptTotal: number;
  accountingConflictCount: number;
  unknownGroupingCount: number;
  firstEvidenceDay: string | null;
  lastEvidenceDay: string | null;
  calendarDaySpan: number;
}

export interface DirectChatMemoryLongEvidenceExport {
  schemaVersion: typeof LONG_EVIDENCE_SCHEMA_VERSION;
  records: DirectChatMemoryLongEvidenceRecord[];
  [key: string]: unknown;
}

export interface DirectChatMemoryLongEvidenceCombinedReview {
  schemaVersion: typeof LONG_EVIDENCE_SCHEMA_VERSION;
  status: "ok" | "mixed_window" | "malformed";
  windowCount: number;
  windowFingerprint: string | null;
  recordCount: number;
  dedupedRecordCount: number;
  malformedExportCount: number;
  malformedRecordCount: number;
  countsByClassification: Record<LongEvidenceClassification, number>;
  formalWindowRecordCount: number;
  formalSessionCount: number;
  distinctExactScopeCount: number;
  extractionBatchCount: number;
  validSuppressionCount: number;
  validControlCount: number;
  zeroCandidateBatchCount: number;
  controlCount: number;
  logicalActionTotal: number;
  physicalAttemptTotal: number;
  accountingConflictCount: number;
  unknownGroupingCount: number;
  safetyIncidentCount: number;
  firstEvidenceDay: string | null;
  lastEvidenceDay: string | null;
  calendarDaySpan: number;
}

export interface DirectChatMemoryLongEvidenceDebugApi {
  enable: () => void;
  disable: () => void;
  clear: () => void;
  count: () => number;
  exportJson: () => string;
  summary: () => DirectChatMemoryLongEvidenceSummary;
  startWindow: (windowToken: string) => number | null;
  resumeWindow: (windowToken: string) => number | null;
  finishWindow: () => void;
  clearWindow: () => void;
  createWindowToken: () => string;
}

const SAFE_VALIDATOR_REASONS = new Set([
  "SAFETY_VETO_CANCELLED_PLAN",
  "SAFETY_VETO_TEMPORARY_PREFERENCE",
  "validator_error_fail_open",
  "feature_scope_not_eligible",
  "legacy_or_v2_candidate_missing",
  "legacy_rejected",
  "bridge_not_safety_veto",
  "predicate_disabled",
  "reason_not_allowlisted",
  "correlation_not_reliable",
  "scope_not_exact",
  "provenance_not_trusted",
  "legacy_not_write_eligible",
  "v2_metadata_not_trusted",
  "cancelled_plan_semantic_mismatch",
  "cancelled_plan_predicate_failed",
  "temporary_preference_semantic_mismatch",
  "temporary_preference_predicate_failed",
]);
const SAFE_BRIDGE_STATES = new Set([
  "legacy_passthrough",
  "write_proposal",
  "review",
  "reject",
  "route",
  "safety_veto",
]);
const SAFE_BRIDGE_REASONS = new Set([
  "cancelled_plan_not_active",
  "legacy_rejected",
  "legacy_not_write_eligible",
  "v2_candidate_missing",
  "correlation_not_reliable",
  "scope_not_exact",
  "provenance_not_trusted",
  "metadata_source_not_trusted",
  "semantic_kind_mismatch",
  "plan_lifecycle_mismatch",
  "safety_veto_reason_not_enabled",
  "no_veto",
]);

const normalizeCode = (value: unknown, allowed: ReadonlySet<string>, fallback = "unknown"): string => {
  const candidate = typeof value === "string" ? value.trim() : "";
  return allowed.has(candidate) ? candidate : fallback;
};

const normalizeBoolean = (value: unknown): boolean => value === true;

const clampCount = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1000, Math.floor(value)));
};

const normalizeLatencyBucket = <T extends string>(value: unknown, allowed: ReadonlySet<T>): T => {
  const candidate = typeof value === "string" ? value : "";
  return (allowed.has(candidate as T) ? candidate : "unknown") as T;
};

const EXTRACTION_LATENCIES = new Set<LongEvidenceExtractionLatencyBucket>([
  "0_5s", "5_15s", "15_30s", "30_60s", "60s_plus", "unknown",
]);
const FILTERING_LATENCIES = new Set<LongEvidenceFilteringLatencyBucket>([
  "0_10ms", "10_50ms", "50_250ms", "250ms_plus", "unknown",
]);

function isDevBuild(): boolean {
  try {
    return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

function isTestInjection(): boolean {
  try {
    return typeof process !== "undefined" && process.env.NODE_ENV === "test";
  } catch {
    return false;
  }
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * A bounded, deterministic reviewer token. The input may contain a developer-held
 * secret, but only the digest is retained/exported. Two independent 32-bit lanes
 * keep accidental collisions unlikely without introducing a new crypto scheme.
 */
function reviewerFingerprint(prefix: string, value: string): string {
  return `${prefix}-${fingerprint(value)}${fingerprint(`v2\u0000${value}`)}`;
}

function isSufficientWindowToken(value: string): boolean {
  const token = value.trim();
  if (token.length < 24) return false;
  return new Set(token).size >= 10;
}

/** Generate a developer-held token through the project's governed ID utility. */
export function createDirectChatMemoryLongEvidenceWindowToken(): string {
  return createId("memory-evidence-window");
}

function evidenceDayFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function currentEvidenceDay(): string {
  return evidenceDayFromDate(new Date());
}

function calculateEvidenceDayWindow(days: readonly string[]): {
  firstEvidenceDay: string | null;
  lastEvidenceDay: string | null;
  calendarDaySpan: number;
} {
  const validDays = [...new Set(days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort();
  return {
    firstEvidenceDay: validDays[0] ?? null,
    lastEvidenceDay: validDays[validDays.length - 1] ?? null,
    // The formal requirement is based on distinct UTC calendar dates represented,
    // not elapsed hours or an inclusive gap with no evidence.
    calendarDaySpan: validDays.length,
  };
}

function scopeFingerprint(scope: DirectChatMemoryLongEvidenceScope, salt: string): string {
  const tuple = [scope.characterId, scope.relationId, scope.userIdentityId, scope.conversationId]
    .map((value) => typeof value === "string" ? value : "")
    .join("\u0000");
  return `scope-${fingerprint(`${salt}\u0000${tuple}`)}`;
}

function actionFingerprint(logicalActionId: unknown, salt: string, prefix: "action" | "batch"): string {
  const normalized = typeof logicalActionId === "string" ? logicalActionId.trim() : "";
  if (!normalized) return "unknown";
  return `${prefix}-${fingerprint(`${salt}\u0000${prefix}\u0000${normalized}`)}`;
}

function buildEvidenceRecordFingerprint(
  windowToken: string,
  sessionNonceValue: string,
  batchFingerprintValue: string,
  observationOrdinal: number,
): string {
  return reviewerFingerprint(
    "evidence",
    [windowToken, sessionNonceValue, batchFingerprintValue, String(observationOrdinal)].join("\u0000"),
  );
}

function coarseTimeBucket(): string {
  const now = new Date();
  return `${now.toISOString().slice(0, 13)}:00Z`;
}

function validSuppressionCandidate(record: DirectChatMemoryLongEvidenceRecord): boolean {
  return record.featureScope === "automatic_direct_chat"
    && record.canaryReason === "SAFETY_VETO_CANCELLED_PLAN"
    && record.validatorResult === "allow_veto"
    && record.validatorReason === "SAFETY_VETO_CANCELLED_PLAN"
    && record.bridgeState === "safety_veto"
    && record.bridgeReason === "cancelled_plan_not_active"
    && record.correlationClass === "shared_unique"
    && record.lineageStatus === "shared"
    && record.pairUnique
    && record.exactScope
    && record.provenanceTrusted
    && record.metadataSource === "v2_model_native"
    && record.semanticKind === "plan"
    && record.planLifecycle === "cancelled"
    && record.legacyAccepted
    && record.legacyWriteEligible
    && record.batchAcceptedBefore >= 1
    && record.candidateSuppressed
    && record.vetoedCandidateCanonicalAbsent
    && !record.failOpen
    && record.privacyStatus === "metadata_only";
}

function validSuppressionBatch(record: DirectChatMemoryLongEvidenceRecord): boolean {
  const partial = record.batchAcceptedBefore > record.batchAcceptedAfter
    && record.batchAcceptedAfter > 0
    && !record.batchZeroCandidates
    && record.survivingCanonicalWritesExpected
    && record.survivingCanonicalWritesObserved
    && record.canonicalWriteCountDelta > 0
    && record.cursorAdvanced;
  const allVeto = record.batchAcceptedBefore > 0
    && record.batchAcceptedAfter === 0
    && record.batchZeroCandidates
    && !record.survivingCanonicalWritesExpected
    && record.survivingCanonicalWritesObserved
    && record.cursorAdvanced
    && record.canonicalWriteCountDelta === 0
    && record.summaryDelta === 0
    && record.projectionDelta === 0;
  return partial || allVeto;
}

function isZeroCandidateBatch(record: DirectChatMemoryLongEvidenceRecord): boolean {
  return record.recordKind === "batch";
}

function validZeroCandidateBatch(record: DirectChatMemoryLongEvidenceRecord): boolean {
  return record.featureScope === "automatic_direct_chat"
    && isZeroCandidateBatch(record)
    && record.candidateCount === 0
    && record.batchZeroCandidates
    && record.batchAcceptedBefore === 0
    && record.batchAcceptedAfter === 0
    && !record.candidateSuppressed
    && !record.legacyAccepted
    && !record.legacyWriteEligible
    && !record.v2OnlyWrite
    && record.exactScope
    && record.provenanceTrusted
    && record.survivingCanonicalWritesObserved
    && record.cursorAdvanced
    && !record.cursorLoop
    && !record.replayLoop
    && record.canonicalWriteCountDelta === 0
    && record.summaryDelta === 0
    && record.projectionDelta === 0
    && record.providerLogicalRequestCount > 0
    && record.providerPhysicalAttemptCount > 0
    && record.accountingShape !== "unknown"
    && record.privacyStatus === "metadata_only";
}

function hasSafetyIncident(record: DirectChatMemoryLongEvidenceRecord): boolean {
  if (record.privacyStatus !== "metadata_only"
    || record.promptDelta > 0
    || record.canaryProviderDelta > 0
    || record.vetoedCandidateSummaryPresent
    || record.vetoedCandidateProjectionPresent
    || record.v2OnlyWrite
    || record.cursorLoop
    || record.replayLoop
    || record.blockingMaterialUserRegression) return true;
  if (record.candidateSuppressed && (!record.exactScope || record.correlationClass === "cross_scope" || !record.vetoedCandidateCanonicalAbsent)) return true;
  if (!record.legacyAccepted && record.canonicalWriteCountDelta > 0) return true;
  return false;
}

/** Pure, side-effect-free classification of an already sanitized record. */
export function classifyLongEvidenceRecord(record: DirectChatMemoryLongEvidenceRecord): LongEvidenceClassification {
  if (!record || typeof record !== "object") return "INVALID_SAMPLE";
  if (hasSafetyIncident(record)) return "SAFETY_INCIDENT";
  if (record.failOpen) return "FAIL_OPEN_OBSERVATION";
  if (isZeroCandidateBatch(record)) return validZeroCandidateBatch(record) ? "ZERO_CANDIDATE_BATCH" : "INVALID_SAMPLE";
  if (record.candidateSuppressed) {
    return validSuppressionCandidate(record) && validSuppressionBatch(record)
      ? "VALID_ELIGIBLE_SUPPRESSION"
      : "INVALID_SAMPLE";
  }
  const validControl = record.featureScope === "automatic_direct_chat"
    && record.legacyAccepted
    && !record.candidateSuppressed
    && !record.v2OnlyWrite
    && record.canaryReason !== "SAFETY_VETO_CANCELLED_PLAN"
    && record.validatorResult !== "allow_veto"
    && record.bridgeState !== "safety_veto"
    && record.exactScope
    && record.provenanceTrusted
    && record.cursorAdvanced
    && record.survivingCanonicalWritesExpected
    && record.survivingCanonicalWritesObserved
    && record.canonicalWriteCountDelta > 0
    && record.privacyStatus === "metadata_only";
  return validControl ? "VALID_CONTROL" : "INVALID_SAMPLE";
}

function sanitizeInput(
  input: DirectChatMemoryLongEvidenceInput,
  currentSession: number,
  sessionNonceValue: string,
  currentSessionFingerprint: string,
  activeWindow: { ordinal: number; salt: string; fingerprint: string } | null,
  nextObservationOrdinal: number,
): DirectChatMemoryLongEvidenceRecord {
  const candidate = input.candidate || {};
  const batch = input.batch || {} as DirectChatMemoryLongEvidenceBatchInput;
  const accounting = input.accounting || {} as DirectChatMemoryLongEvidenceAccountingInput;
  const performance = input.performance || {} as DirectChatMemoryLongEvidencePerformanceInput;
  const identitySalt = activeWindow?.salt || sessionNonceValue;
  const batchFingerprintValue = actionFingerprint(input.logicalActionId, identitySalt, "batch");
  const requestedObservationOrdinal = typeof input.candidateObservationOrdinal === "number"
    && Number.isFinite(input.candidateObservationOrdinal)
    ? Math.max(1, Math.min(1000, Math.floor(input.candidateObservationOrdinal)))
    : nextObservationOrdinal;
  const record: DirectChatMemoryLongEvidenceRecord = {
    schemaVersion: LONG_EVIDENCE_SCHEMA_VERSION,
    ...(input.recordKind ? { recordKind: input.recordKind } : {}),
    ...(input.recordKind ? { candidateCount: clampCount(input.candidateCount) } : {}),
    timeBucket: coarseTimeBucket(),
    evidenceDay: currentEvidenceDay(),
    featureScope: candidate.featureScope === "automatic_direct_chat" ? "automatic_direct_chat" : "unknown",
    sessionOrdinal: currentSession,
    windowOrdinal: activeWindow?.ordinal ?? null,
    windowFingerprint: activeWindow?.fingerprint ?? null,
    sessionFingerprint: currentSessionFingerprint,
    evidenceRecordFingerprint: buildEvidenceRecordFingerprint(
      activeWindow?.salt || "dry-run-window",
      sessionNonceValue,
      batchFingerprintValue,
      requestedObservationOrdinal,
    ),
    observationOrdinal: requestedObservationOrdinal,
    evidenceMode: activeWindow ? "formal_window" : "dry_run",
    scopeFingerprint: scopeFingerprint(input.scope, identitySalt),
    logicalActionFingerprint: actionFingerprint(input.logicalActionId, identitySalt, "action"),
    batchActionFingerprint: batchFingerprintValue,
    canaryReason: candidate.canaryReason === "SAFETY_VETO_CANCELLED_PLAN" || candidate.canaryReason === "none"
      ? candidate.canaryReason
      : "unknown",
    validatorResult: candidate.validatorResult === "allow_veto" || candidate.validatorResult === "deny_veto" || candidate.validatorResult === "not_evaluated"
      ? candidate.validatorResult
      : "unknown",
    validatorReason: normalizeCode(candidate.validatorReason, SAFE_VALIDATOR_REASONS),
    bridgeState: normalizeCode(candidate.bridgeState, SAFE_BRIDGE_STATES),
    bridgeReason: normalizeCode(candidate.bridgeReason, SAFE_BRIDGE_REASONS),
    correlationClass: candidate.correlationClass === "shared_unique" || candidate.correlationClass === "shared_non_unique" || candidate.correlationClass === "cross_scope"
      ? candidate.correlationClass
      : "unknown",
    lineageStatus: candidate.lineageStatus === "shared" || candidate.lineageStatus === "missing" || candidate.lineageStatus === "conflict"
      ? candidate.lineageStatus
      : "unknown",
    pairUnique: normalizeBoolean(candidate.pairUnique),
    exactScope: normalizeBoolean(candidate.exactScope),
    provenanceTrusted: normalizeBoolean(candidate.provenanceTrusted),
    metadataSource: candidate.metadataSource === "v2_model_native" || candidate.metadataSource === "legacy_derived" || candidate.metadataSource === "mixed"
      ? candidate.metadataSource
      : "unknown",
    semanticKind: candidate.semanticKind === "plan" || candidate.semanticKind === "preference" || candidate.semanticKind === "fact"
      ? candidate.semanticKind
      : "unknown",
    planLifecycle: candidate.planLifecycle === "cancelled" || candidate.planLifecycle === "active" || candidate.planLifecycle === "not_applicable"
      ? candidate.planLifecycle
      : "unknown",
    legacyAccepted: normalizeBoolean(candidate.legacyAccepted),
    legacyWriteEligible: normalizeBoolean(candidate.legacyWriteEligible),
    candidateSuppressed: normalizeBoolean(candidate.candidateSuppressed),
    vetoedCandidateCanonicalAbsent: normalizeBoolean(candidate.vetoedCandidateCanonicalAbsent),
    failOpen: normalizeBoolean(candidate.failOpen),
    batchAcceptedBefore: clampCount(batch.batchAcceptedBefore),
    batchAcceptedAfter: clampCount(batch.batchAcceptedAfter),
    batchZeroCandidates: normalizeBoolean(batch.batchZeroCandidates),
    survivingCanonicalWritesExpected: normalizeBoolean(batch.survivingCanonicalWritesExpected),
    survivingCanonicalWritesObserved: normalizeBoolean(batch.survivingCanonicalWritesObserved),
    cursorAdvanced: normalizeBoolean(batch.cursorAdvanced),
    canonicalWriteCountDelta: clampCount(batch.canonicalWriteCountDelta),
    summaryDelta: clampCount(batch.summaryDelta),
    projectionDelta: clampCount(batch.projectionDelta),
    providerLogicalRequestCount: clampCount(accounting.providerLogicalRequestCount),
    providerPhysicalAttemptCount: clampCount(accounting.providerPhysicalAttemptCount),
    accountingShape: accounting.accountingShape === "single_row" || accounting.accountingShape === "fallback_split_rows"
      ? accounting.accountingShape
      : "unknown",
    promptDelta: clampCount(accounting.promptDelta),
    canaryProviderDelta: clampCount(accounting.canaryProviderDelta),
    extractionLatencyBucket: normalizeLatencyBucket(performance.extractionLatencyBucket, EXTRACTION_LATENCIES),
    canaryFilteringLatencyBucket: normalizeLatencyBucket(performance.canaryFilteringLatencyBucket, FILTERING_LATENCIES),
    privacyStatus: performance.privacyStatus === "metadata_only" ? "metadata_only" : "violation",
    vetoedCandidateSummaryPresent: normalizeBoolean(batch.vetoedCandidateSummaryPresent),
    vetoedCandidateProjectionPresent: normalizeBoolean(batch.vetoedCandidateProjectionPresent),
    v2OnlyWrite: normalizeBoolean(batch.v2OnlyWrite),
    cursorLoop: normalizeBoolean(batch.cursorLoop),
    replayLoop: normalizeBoolean(batch.replayLoop),
    blockingMaterialUserRegression: normalizeBoolean(batch.blockingMaterialUserRegression),
    classification: "INVALID_SAMPLE",
  };
  record.classification = classifyLongEvidenceRecord(record);
  return record;
}

function emptyCounts(): Record<LongEvidenceClassification, number> {
  return {
    VALID_ELIGIBLE_SUPPRESSION: 0,
    VALID_CONTROL: 0,
    ZERO_CANDIDATE_BATCH: 0,
    FAIL_OPEN_OBSERVATION: 0,
    INVALID_SAMPLE: 0,
    SAFETY_INCIDENT: 0,
  };
}

let configured = false;
let currentSessionOrdinal: number | null = null;
let sessionOrdinalCounter = 0;
let sessionNonce = "";
let currentSessionFingerprint = "";
let sessionObservationOrdinal = 0;
let windowOrdinalCounter = 0;
let activeWindow: { ordinal: number; salt: string; fingerprint: string } | null = null;
let windowState: "not_started" | "active" | "finished" = "not_started";
let lastWindowOrdinal: number | null = null;
let lastWindowFingerprint: string | null = null;
let records: DirectChatMemoryLongEvidenceRecord[] = [];

export function configureDirectChatMemoryLongEvidenceCollector(configuration: { enabled: boolean; explicitDebug?: boolean }): void {
  const nextEnabled = configuration.enabled && (isDevBuild() || (configuration.explicitDebug === true && isTestInjection()));
  if (nextEnabled) {
    configured = true;
    const continuingFormalWindow = activeWindow !== null;
    startEvidenceSession();
    if (!continuingFormalWindow) records = [];
    return;
  }
  configured = false;
}

function startEvidenceSession(): void {
  sessionOrdinalCounter += 1;
  currentSessionOrdinal = sessionOrdinalCounter;
  sessionObservationOrdinal = 0;
  sessionNonce = createAiActionId();
  currentSessionFingerprint = reviewerFingerprint(
    "session",
    `${activeWindow?.salt || "dry-run-window"}\u0000${sessionNonce}\u0000session`,
  );
}

/** Start a formal window with an explicit developer-held token; the token is never exported or persisted. */
export function startDirectChatMemoryLongEvidenceWindow(windowToken: string): number | null {
  if (!configured || typeof windowToken !== "string" || !isSufficientWindowToken(windowToken)) return null;
  const normalizedToken = windowToken.trim();
  windowOrdinalCounter += 1;
  activeWindow = {
    ordinal: windowOrdinalCounter,
    salt: normalizedToken,
    fingerprint: reviewerFingerprint("window", normalizedToken),
  };
  lastWindowOrdinal = activeWindow.ordinal;
  lastWindowFingerprint = activeWindow.fingerprint;
  windowState = "active";
  records = [];
  startEvidenceSession();
  return activeWindow.ordinal;
}

/** Resume the same formal window after a reload by explicitly re-entering its local token. */
export function resumeDirectChatMemoryLongEvidenceWindow(windowToken: string): number | null {
  if (!configured || typeof windowToken !== "string" || !isSufficientWindowToken(windowToken)) return null;
  const normalizedToken = windowToken.trim();
  if (activeWindow && activeWindow.salt !== normalizedToken) return null;
  if (!activeWindow) {
    windowOrdinalCounter += 1;
    activeWindow = {
      ordinal: windowOrdinalCounter,
      salt: normalizedToken,
      fingerprint: reviewerFingerprint("window", normalizedToken),
    };
    lastWindowOrdinal = activeWindow.ordinal;
    lastWindowFingerprint = activeWindow.fingerprint;
  } else {
    activeWindow = {
      ...activeWindow,
      salt: normalizedToken,
      fingerprint: reviewerFingerprint("window", normalizedToken),
    };
    lastWindowOrdinal = activeWindow.ordinal;
    lastWindowFingerprint = activeWindow.fingerprint;
  }
  windowState = "active";
  startEvidenceSession();
  return activeWindow.ordinal;
}

export function finishDirectChatMemoryLongEvidenceWindow(): void {
  if (activeWindow) windowState = "finished";
  activeWindow = null;
}

export function clearDirectChatMemoryLongEvidenceWindow(): void {
  activeWindow = null;
  windowState = "not_started";
  lastWindowOrdinal = null;
  lastWindowFingerprint = null;
  records = [];
}

export function isDirectChatMemoryLongEvidenceCollectorEnabled(): boolean {
  return configured;
}

export function clearDirectChatMemoryLongEvidenceCollector(): void {
  records = [];
}

export function getDirectChatMemoryLongEvidenceRecords(): DirectChatMemoryLongEvidenceRecord[] {
  return records.slice();
}

export function recordDirectChatMemoryLongEvidence(input: DirectChatMemoryLongEvidenceInput): DirectChatMemoryLongEvidenceRecord | null {
  if (!configured || currentSessionOrdinal === null) return null;
  try {
    if (!input || !input.scope) return null;
    sessionObservationOrdinal += 1;
    const record = sanitizeInput(
      input,
      currentSessionOrdinal,
      sessionNonce,
      currentSessionFingerprint,
      activeWindow,
      sessionObservationOrdinal,
    );
    records = [...records, record].slice(-LONG_EVIDENCE_MAX_RECORDS);
    return record;
  } catch {
    // Observation is strictly fail-open: malformed evidence cannot affect a write or request.
    return null;
  }
}

export function deriveLongEvidenceAccounting(
  ledgerRecords: readonly AiRequestEnvelope[],
): DirectChatMemoryLongEvidenceAccountingInput {
  const summary = aggregateAiRequestLedgerAccounting(ledgerRecords);
  const known = ledgerRecords.filter((record) => typeof record.logicalActionId === "string" && record.logicalActionId.trim());
  const logicalIds = new Set(known.map((record) => record.logicalActionId!.trim()));
  const accountingShape: LongEvidenceAccountingShape = summary.logicalGroupingUnknownRows > 0 || logicalIds.size !== 1
    ? "unknown"
    : known.length > 1 ? "fallback_split_rows" : "single_row";
  return {
    providerLogicalRequestCount: summary.logicalActionCount,
    providerPhysicalAttemptCount: summary.physicalProviderAttemptCount,
    accountingShape,
    promptDelta: 0,
    canaryProviderDelta: 0,
  };
}

interface AccountingGroup {
  logical: number;
  physical: number;
  shape: LongEvidenceAccountingShape;
  conflict: boolean;
}

function isAuthoritativeRecord(record: DirectChatMemoryLongEvidenceRecord): boolean {
  return record.classification === "VALID_ELIGIBLE_SUPPRESSION"
    || record.classification === "VALID_CONTROL"
    || record.classification === "ZERO_CANDIDATE_BATCH";
}

function aggregateFormalRecords(formalRecords: readonly DirectChatMemoryLongEvidenceRecord[]): {
  logicalActionTotal: number;
  physicalAttemptTotal: number;
  accountingConflictCount: number;
  unknownGroupingCount: number;
  extractionBatchCount: number;
  distinctExactScopeCount: number;
  validSuppressionCount: number;
  validControlCount: number;
  zeroCandidateBatchCount: number;
  formalSessionCount: number;
} {
  const groups = new Map<string, AccountingGroup>();
  let unknownGroupingCount = 0;
  for (const record of formalRecords) {
    if (!isAuthoritativeRecord(record)) continue;
    if (record.logicalActionFingerprint === "unknown" || record.accountingShape === "unknown") {
      unknownGroupingCount += 1;
      continue;
    }
    const existing = groups.get(record.logicalActionFingerprint);
    if (!existing) {
      groups.set(record.logicalActionFingerprint, {
        logical: record.providerLogicalRequestCount,
        physical: record.providerPhysicalAttemptCount,
        shape: record.accountingShape,
        conflict: false,
      });
      continue;
    }
    if (existing.logical !== record.providerLogicalRequestCount
      || existing.physical !== record.providerPhysicalAttemptCount
      || existing.shape !== record.accountingShape) {
      existing.conflict = true;
    }
  }
  let accountingConflictCount = 0;
  let logicalActionTotal = 0;
  let physicalAttemptTotal = 0;
  const authoritativeActionFingerprints = new Set<string>();
  groups.forEach((group, actionFingerprintValue) => {
    if (group.conflict) {
      accountingConflictCount += 1;
      return;
    }
    authoritativeActionFingerprints.add(actionFingerprintValue);
    logicalActionTotal += 1;
    physicalAttemptTotal += group.physical;
  });
  const authoritativeRecords = formalRecords.filter((record) =>
    isAuthoritativeRecord(record) && authoritativeActionFingerprints.has(record.logicalActionFingerprint));
  const scopeFingerprints = new Set(
    authoritativeRecords
      .filter((record) => record.exactScope && record.privacyStatus === "metadata_only" && record.scopeFingerprint !== "unknown")
      .map((record) => record.scopeFingerprint),
  );
  const batchFingerprints = new Set(authoritativeRecords.map((record) => record.batchActionFingerprint).filter((value) => value !== "unknown"));
  const sessionFingerprints = new Set(authoritativeRecords
    .map((record) => record.sessionFingerprint)
    .filter((value) => typeof value === "string" && value.length > 0));
  return {
    logicalActionTotal,
    physicalAttemptTotal,
    accountingConflictCount,
    unknownGroupingCount,
    extractionBatchCount: batchFingerprints.size,
    distinctExactScopeCount: scopeFingerprints.size,
    validSuppressionCount: authoritativeRecords.filter((record) => record.classification === "VALID_ELIGIBLE_SUPPRESSION").length,
    validControlCount: authoritativeRecords.filter((record) => record.classification === "VALID_CONTROL").length,
    zeroCandidateBatchCount: authoritativeRecords.filter((record) => record.classification === "ZERO_CANDIDATE_BATCH").length,
    formalSessionCount: sessionFingerprints.size,
  };
}

export function getDirectChatMemoryLongEvidenceSummary(): DirectChatMemoryLongEvidenceSummary {
  const countsByClassification = emptyCounts();
  const sessionOrdinals = new Set<number>();
  const formalRecords: DirectChatMemoryLongEvidenceRecord[] = [];
  records.forEach((record) => {
    countsByClassification[record.classification] += 1;
    sessionOrdinals.add(record.sessionOrdinal);
    if (record.windowOrdinal !== null) formalRecords.push(record);
  });
  const formalAggregation = aggregateFormalRecords(formalRecords);
  const formalClassificationCounts = emptyCounts();
  formalRecords.forEach((record) => { formalClassificationCounts[record.classification] += 1; });
  return {
    schemaVersion: LONG_EVIDENCE_SCHEMA_VERSION,
    persistenceMode: "in_memory_only",
    enabled: configured,
    sessionOrdinal: currentSessionOrdinal,
    windowOrdinal: activeWindow?.ordinal ?? lastWindowOrdinal,
    windowState,
    recordCount: records.length,
    countsByClassification,
    sessionCount: sessionOrdinals.size,
    formalSessionCount: formalAggregation.formalSessionCount,
    formalWindowCount: new Set(formalRecords
      .map((record) => record.windowFingerprint)
      .filter((value): value is string => typeof value === "string" && value.length > 0)).size,
    windowFingerprint: activeWindow?.fingerprint ?? lastWindowFingerprint,
    formalWindowRecordCount: formalRecords.length,
    ...formalAggregation,
    failOpenCount: formalClassificationCounts.FAIL_OPEN_OBSERVATION,
    invalidSampleCount: formalClassificationCounts.INVALID_SAMPLE,
    safetyIncidentCount: formalClassificationCounts.SAFETY_INCIDENT,
    controlCount: formalAggregation.validControlCount,
    ...calculateEvidenceDayWindow(formalRecords.map((record) => record.evidenceDay)),
  };
}

export function exportDirectChatMemoryLongEvidenceJson(): string {
  return JSON.stringify({
    ...getDirectChatMemoryLongEvidenceSummary(),
    records: getDirectChatMemoryLongEvidenceRecords(),
  }, null, 2);
}

const FORBIDDEN_EXPORT_KEYS = /^(?:prompt|response|message|statement|authorization|api[_-]?key|secret|nonce|token|raw(?:Id|Error)?|sourceId|logicalActionId|windowToken|sessionNonce)$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasForbiddenExportKey(value: unknown, depth = 0): boolean {
  if (depth > 4 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasForbiddenExportKey(item, depth + 1));
  return Object.entries(value).some(([key, child]) =>
    FORBIDDEN_EXPORT_KEYS.test(key) || hasForbiddenExportKey(child, depth + 1));
}

function isEvidenceDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && evidenceDayFromDate(parsed) === value;
}

function isSanitizedEvidenceRecord(value: unknown): value is DirectChatMemoryLongEvidenceRecord {
  if (!isObject(value)) return false;
  const windowFingerprintValue = value.windowFingerprint;
  const sessionFingerprintValue = value.sessionFingerprint;
  const evidenceRecordFingerprintValue = value.evidenceRecordFingerprint;
  const classificationValue = value.classification;
  if (value.schemaVersion !== LONG_EVIDENCE_SCHEMA_VERSION
    || (value.evidenceMode !== "formal_window" && value.evidenceMode !== "dry_run")
    || (typeof windowFingerprintValue !== "string" && windowFingerprintValue !== null)
    || typeof sessionFingerprintValue !== "string" || !/^session-[0-9a-f]{16}$/.test(sessionFingerprintValue)
    || typeof evidenceRecordFingerprintValue !== "string" || !/^evidence-[0-9a-f]{16}$/.test(evidenceRecordFingerprintValue)
    || typeof value.observationOrdinal !== "number" || !Number.isSafeInteger(value.observationOrdinal)
    || !isEvidenceDay(value.evidenceDay)
    || typeof classificationValue !== "string") return false;
  if (value.evidenceMode === "formal_window" && !value.windowFingerprint) return false;
  if (value.evidenceMode === "dry_run" && value.windowFingerprint !== null) return false;
  if (typeof windowFingerprintValue === "string" && !/^window-[0-9a-f]{16}$/.test(windowFingerprintValue)) return false;
  const scopeFingerprintValue = value.scopeFingerprint;
  const logicalActionFingerprintValue = value.logicalActionFingerprint;
  const batchActionFingerprintValue = value.batchActionFingerprint;
  if (typeof scopeFingerprintValue !== "string" || !/^scope-[0-9a-f]{8}$/.test(scopeFingerprintValue)) return false;
  if (typeof logicalActionFingerprintValue !== "string"
    || (logicalActionFingerprintValue !== "unknown" && !/^action-[0-9a-f]{8}$/.test(logicalActionFingerprintValue))) return false;
  if (typeof batchActionFingerprintValue !== "string"
    || (batchActionFingerprintValue !== "unknown" && !/^batch-[0-9a-f]{8}$/.test(batchActionFingerprintValue))) return false;
  if (!["VALID_ELIGIBLE_SUPPRESSION", "VALID_CONTROL", "ZERO_CANDIDATE_BATCH", "FAIL_OPEN_OBSERVATION", "INVALID_SAMPLE", "SAFETY_INCIDENT"].includes(classificationValue as string)) return false;
  const recordKind = value.recordKind === undefined ? "candidate" : value.recordKind;
  if (recordKind !== "candidate" && recordKind !== "batch") return false;
  if (recordKind === "batch" && (classificationValue !== "ZERO_CANDIDATE_BATCH"
    || value.candidateCount !== 0
    || value.batchZeroCandidates !== true
    || value.candidateSuppressed !== false
    || value.legacyAccepted !== false
    || value.legacyWriteEligible !== false
    || value.survivingCanonicalWritesExpected !== false
    || value.canonicalWriteCountDelta !== 0
    || value.summaryDelta !== 0
    || value.projectionDelta !== 0
    || value.cursorAdvanced !== true
    || value.exactScope !== true
    || value.provenanceTrusted !== true
    || value.survivingCanonicalWritesObserved !== true
    || typeof value.providerLogicalRequestCount !== "number"
    || value.providerLogicalRequestCount < 1
    || typeof value.providerPhysicalAttemptCount !== "number"
    || value.providerPhysicalAttemptCount < 1
    || (value.accountingShape !== "single_row" && value.accountingShape !== "fallback_split_rows")
    || value.v2OnlyWrite !== false
    || value.privacyStatus !== "metadata_only")) return false;
  if (recordKind === "candidate" && classificationValue === "ZERO_CANDIDATE_BATCH") return false;
  return true;
}

function duplicateRecordSignature(record: DirectChatMemoryLongEvidenceRecord): string {
  const { sessionOrdinal: _sessionOrdinal, windowOrdinal: _windowOrdinal, timeBucket: _timeBucket, ...stable } = record;
  return JSON.stringify(stable);
}

function emptyCombinedReview(status: DirectChatMemoryLongEvidenceCombinedReview["status"]): DirectChatMemoryLongEvidenceCombinedReview {
  return {
    schemaVersion: LONG_EVIDENCE_SCHEMA_VERSION,
    status,
    windowCount: 0,
    windowFingerprint: null,
    recordCount: 0,
    dedupedRecordCount: 0,
    malformedExportCount: 0,
    malformedRecordCount: 0,
    countsByClassification: emptyCounts(),
    formalWindowRecordCount: 0,
    formalSessionCount: 0,
    distinctExactScopeCount: 0,
    extractionBatchCount: 0,
    validSuppressionCount: 0,
    validControlCount: 0,
    zeroCandidateBatchCount: 0,
    controlCount: 0,
    logicalActionTotal: 0,
    physicalAttemptTotal: 0,
    accountingConflictCount: 0,
    unknownGroupingCount: 0,
    safetyIncidentCount: 0,
    firstEvidenceDay: null,
    lastEvidenceDay: null,
    calendarDaySpan: 0,
  };
}

/**
 * Pure offline review combiner for sanitized exports. It never reads storage,
 * sends data over the network, or attempts to infer identity from prose.
 */
export function combineLongEvidenceExports(
  exports: readonly (string | DirectChatMemoryLongEvidenceExport)[],
): DirectChatMemoryLongEvidenceCombinedReview {
  const review = emptyCombinedReview("ok");
  const uniqueRecords = new Map<string, DirectChatMemoryLongEvidenceRecord>();
  let duplicateConflictCount = 0;

  if (!Array.isArray(exports)) {
    review.status = "malformed";
    review.malformedExportCount = 1;
    return review;
  }

  for (const candidateExport of exports) {
    let parsed: unknown = candidateExport;
    if (typeof candidateExport === "string") {
      try {
        parsed = JSON.parse(candidateExport) as unknown;
      } catch {
        review.malformedExportCount += 1;
        continue;
      }
    }
    if (!isObject(parsed)
      || parsed.schemaVersion !== LONG_EVIDENCE_SCHEMA_VERSION
      || !Array.isArray(parsed.records)
      || hasForbiddenExportKey(parsed)) {
      review.malformedExportCount += 1;
      continue;
    }
    for (const candidateRecord of parsed.records) {
      if (!isSanitizedEvidenceRecord(candidateRecord)) {
        review.malformedRecordCount += 1;
        continue;
      }
      review.recordCount += 1;
      const prior = uniqueRecords.get(candidateRecord.evidenceRecordFingerprint);
      if (!prior) {
        uniqueRecords.set(candidateRecord.evidenceRecordFingerprint, candidateRecord);
      } else if (duplicateRecordSignature(prior) !== duplicateRecordSignature(candidateRecord)) {
        duplicateConflictCount += 1;
      }
    }
  }

  review.dedupedRecordCount = uniqueRecords.size;
  const allRecords = [...uniqueRecords.values()];
  allRecords.forEach((record) => { review.countsByClassification[record.classification] += 1; });
  const windowFingerprints = new Set(allRecords
    .map((record) => record.windowFingerprint)
    .filter((value): value is string => typeof value === "string" && value.length > 0));
  review.windowCount = windowFingerprints.size;
  review.windowFingerprint = windowFingerprints.size === 1 ? [...windowFingerprints][0] : null;
  if (windowFingerprints.size > 1) {
    review.status = "mixed_window";
    review.safetyIncidentCount = allRecords.filter((record) => record.classification === "SAFETY_INCIDENT").length;
    return review;
  }

  const formalRecords = allRecords.filter((record) => record.evidenceMode === "formal_window" && record.windowFingerprint !== null);
  review.formalWindowRecordCount = formalRecords.length;
  const formalAggregation = aggregateFormalRecords(formalRecords);
  Object.assign(review, formalAggregation);
  review.controlCount = review.validControlCount;
  review.safetyIncidentCount = allRecords.filter((record) => record.classification === "SAFETY_INCIDENT").length;
  review.accountingConflictCount += duplicateConflictCount;
  Object.assign(review, calculateEvidenceDayWindow(formalRecords.map((record) => record.evidenceDay)));
  if (review.malformedExportCount > 0 || review.malformedRecordCount > 0) review.status = "malformed";
  return review;
}

function installDevApi(): void {
  if (!isDevBuild()) return;
  const root = globalThis as typeof globalThis & {
    __fanfanjiMemoryAdmissionLongEvidence?: DirectChatMemoryLongEvidenceDebugApi;
  };
  if (root.__fanfanjiMemoryAdmissionLongEvidence) return;
  root.__fanfanjiMemoryAdmissionLongEvidence = {
    enable: () => configureDirectChatMemoryLongEvidenceCollector({ enabled: true }),
    disable: () => configureDirectChatMemoryLongEvidenceCollector({ enabled: false }),
    clear: clearDirectChatMemoryLongEvidenceCollector,
    count: () => records.length,
    exportJson: exportDirectChatMemoryLongEvidenceJson,
    summary: getDirectChatMemoryLongEvidenceSummary,
    startWindow: startDirectChatMemoryLongEvidenceWindow,
    resumeWindow: resumeDirectChatMemoryLongEvidenceWindow,
    finishWindow: finishDirectChatMemoryLongEvidenceWindow,
    clearWindow: clearDirectChatMemoryLongEvidenceWindow,
    createWindowToken: createDirectChatMemoryLongEvidenceWindowToken,
  };
}

installDevApi();
