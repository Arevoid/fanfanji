import {
  aggregateAiRequestLedgerAccounting,
  createAiActionId,
  type AiRequestEnvelope,
} from "../../../core/monitoring/aiRequestLedger";

export const LONG_EVIDENCE_SCHEMA_VERSION = "memory-admission-v2-long-evidence-1" as const;
export const LONG_EVIDENCE_MAX_RECORDS = 100 as const;

export type LongEvidenceClassification =
  | "VALID_ELIGIBLE_SUPPRESSION"
  | "VALID_CONTROL"
  | "FAIL_OPEN_OBSERVATION"
  | "INVALID_SAMPLE"
  | "SAFETY_INCIDENT";

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
}

export type LongEvidenceExtractionLatencyBucket = "0_5s" | "5_15s" | "15_30s" | "30_60s" | "60s_plus" | "unknown";
export type LongEvidenceFilteringLatencyBucket = "0_10ms" | "10_50ms" | "50_250ms" | "250ms_plus" | "unknown";

export interface DirectChatMemoryLongEvidenceRecord {
  schemaVersion: typeof LONG_EVIDENCE_SCHEMA_VERSION;
  timeBucket: string;
  featureScope: "automatic_direct_chat" | "unknown";
  sessionOrdinal: number;
  scopeFingerprint: string;
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
  recordCount: number;
  countsByClassification: Record<LongEvidenceClassification, number>;
  logicalActionTotal: number;
  physicalAttemptTotal: number;
  unknownGroupingCount: number;
}

export interface DirectChatMemoryLongEvidenceDebugApi {
  enable: () => void;
  disable: () => void;
  clear: () => void;
  count: () => number;
  exportJson: () => string;
  summary: () => DirectChatMemoryLongEvidenceSummary;
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

function scopeFingerprint(scope: DirectChatMemoryLongEvidenceScope, salt: string): string {
  const tuple = [scope.characterId, scope.relationId, scope.userIdentityId, scope.conversationId]
    .map((value) => typeof value === "string" ? value : "")
    .join("\u0000");
  return `scope-${fingerprint(`${salt}\u0000${tuple}`)}`;
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

function sanitizeInput(input: DirectChatMemoryLongEvidenceInput, currentSession: number, salt: string): DirectChatMemoryLongEvidenceRecord {
  const candidate = input.candidate || {};
  const batch = input.batch || {} as DirectChatMemoryLongEvidenceBatchInput;
  const accounting = input.accounting || {} as DirectChatMemoryLongEvidenceAccountingInput;
  const performance = input.performance || {} as DirectChatMemoryLongEvidencePerformanceInput;
  const record: DirectChatMemoryLongEvidenceRecord = {
    schemaVersion: LONG_EVIDENCE_SCHEMA_VERSION,
    timeBucket: coarseTimeBucket(),
    featureScope: candidate.featureScope === "automatic_direct_chat" ? "automatic_direct_chat" : "unknown",
    sessionOrdinal: currentSession,
    scopeFingerprint: scopeFingerprint(input.scope, salt),
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
    FAIL_OPEN_OBSERVATION: 0,
    INVALID_SAMPLE: 0,
    SAFETY_INCIDENT: 0,
  };
}

let configured = false;
let currentSessionOrdinal: number | null = null;
let sessionOrdinalCounter = 0;
let sessionSalt = "";
let records: DirectChatMemoryLongEvidenceRecord[] = [];

export function configureDirectChatMemoryLongEvidenceCollector(configuration: { enabled: boolean; explicitDebug?: boolean }): void {
  const nextEnabled = configuration.enabled && (isDevBuild() || (configuration.explicitDebug === true && isTestInjection()));
  if (nextEnabled) {
    configured = true;
    sessionOrdinalCounter += 1;
    currentSessionOrdinal = sessionOrdinalCounter;
    sessionSalt = createAiActionId();
    records = [];
    return;
  }
  configured = false;
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
    const record = sanitizeInput(input, currentSessionOrdinal, sessionSalt);
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

export function getDirectChatMemoryLongEvidenceSummary(): DirectChatMemoryLongEvidenceSummary {
  const countsByClassification = emptyCounts();
  let logicalActionTotal = 0;
  let physicalAttemptTotal = 0;
  let unknownGroupingCount = 0;
  records.forEach((record) => {
    countsByClassification[record.classification] += 1;
    logicalActionTotal += record.providerLogicalRequestCount;
    physicalAttemptTotal += record.providerPhysicalAttemptCount;
    if (record.accountingShape === "unknown") unknownGroupingCount += 1;
  });
  return {
    schemaVersion: LONG_EVIDENCE_SCHEMA_VERSION,
    persistenceMode: "in_memory_only",
    enabled: configured,
    sessionOrdinal: currentSessionOrdinal,
    recordCount: records.length,
    countsByClassification,
    logicalActionTotal,
    physicalAttemptTotal,
    unknownGroupingCount,
  };
}

export function exportDirectChatMemoryLongEvidenceJson(): string {
  return JSON.stringify({
    ...getDirectChatMemoryLongEvidenceSummary(),
    records: getDirectChatMemoryLongEvidenceRecords(),
  }, null, 2);
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
  };
}

installDevApi();
