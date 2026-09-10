import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type {
  DirectChatMemoryBridgeShadowObservation,
  DirectChatMemoryBridgeShadowResult,
} from "./directChatMemoryAdmissionBridgeShadow";
import type { ApprovedDirectChatSafetyVetoReason } from "./directChatMemorySafetyVetoValidator";
import type {
  DirectChatMemorySafetyVetoShadowEvaluation,
  DirectChatMemorySafetyVetoShadowRecord,
} from "./directChatMemorySafetyVetoShadow";

/** Hard kill switch name reserved for the future runtime configuration seam. */
export const DIRECT_CHAT_MEMORY_ADMISSION_SAFETY_VETO_CANARY =
  "DIRECT_CHAT_MEMORY_ADMISSION_SAFETY_VETO_CANARY" as const;

/** V1 rollout policy: only the real-evidence-backed cancelled-plan reason. */
export const ENABLED_DIRECT_CHAT_MEMORY_SAFETY_VETO_CANARY_REASONS = [
  "SAFETY_VETO_CANCELLED_PLAN",
] as const satisfies readonly ApprovedDirectChatSafetyVetoReason[];

export interface DirectChatMemorySafetyVetoCanaryRecord {
  evaluated: boolean;
  canaryEligible: boolean;
  reasonEnabled: boolean;
  validatorResult: DirectChatMemorySafetyVetoShadowRecord["validatorResult"];
  validatorReason: string;
  suppressed: boolean;
  failOpen: boolean;
  featureScope: "automatic_direct_chat";
  correlationClass: string;
  metadataSource: string;
  batchCandidateCount: number;
  acceptedBeforeCount: number;
  acceptedAfterCount: number;
}

export interface DirectChatMemorySafetyVetoCanaryConfiguration {
  enabled: boolean;
  /** Test/debug injection may opt in outside a Vite dev build. */
  explicitDebug?: boolean;
  /** Runtime policy remains separate from the validator's approved reasons. */
  enabledReasons?: readonly string[];
  maxObservations?: number;
}

export interface DirectChatMemorySafetyVetoCanaryDebugApi {
  enable: () => void;
  disable: () => void;
  clear: () => void;
  count: () => number;
  exportJson: () => string;
}

export interface DirectChatMemorySafetyVetoCanaryResult {
  enabled: boolean;
  filteredAcceptedClaims: KnowledgeClaim[];
  evaluated: number;
  canaryEligible: number;
  suppressed: number;
  failOpen: number;
  records: readonly DirectChatMemorySafetyVetoCanaryRecord[];
}

const DEFAULT_MAX_OBSERVATIONS = 100;
const MAX_OBSERVATIONS = 100;
const SAFE_VALIDATOR_REASON_CODES = new Set([
  ...ENABLED_DIRECT_CHAT_MEMORY_SAFETY_VETO_CANARY_REASONS,
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
const SAFE_CORRELATION_CLASSES = new Set([
  "exact",
  "ambiguous",
  "unmatched_legacy",
  "unmatched_v2",
  "legacy_only",
  "v2_only",
  "duplicate",
  "conflict",
]);
const SAFE_METADATA_SOURCES = new Set([
  "legacy_claim_semantics",
  "legacy_policy_derived",
  "v2_model_native",
  "runtime_owned",
  "unknown",
]);
let configured = false;
let enabledReasons: ReadonlySet<string> = new Set();
let maxObservations = DEFAULT_MAX_OBSERVATIONS;
let records: DirectChatMemorySafetyVetoCanaryRecord[] = [];

const isDevBuild = (): boolean => {
  try {
    return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
};

const clampMaxObservations = (value: number | undefined): number => Math.max(
  1,
  Math.min(MAX_OBSERVATIONS, Math.floor(value ?? DEFAULT_MAX_OBSERVATIONS)),
);

const normalizeEnabledReasons = (values: readonly string[] | undefined): ReadonlySet<string> => {
  const approved = new Set<string>(ENABLED_DIRECT_CHAT_MEMORY_SAFETY_VETO_CANARY_REASONS);
  return new Set((values || []).filter((value): value is string => approved.has(value)));
};

const sanitizeCode = (value: string, allowed: ReadonlySet<string>, fallback: string): string =>
  allowed.has(value) ? value : fallback;

function recordInMemory(next: readonly DirectChatMemorySafetyVetoCanaryRecord[]): void {
  if (!configured || next.length === 0) return;
  records = [...records, ...next].slice(-maxObservations);
}

function fingerprintSourceRefs(values: readonly string[]): string {
  const normalized = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
  let hash = 2166136261;
  const source = normalized.join("\u0000");
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function fingerprintScope(claim: KnowledgeClaim): string {
  const source = [
    claim.characterId,
    claim.relationId,
    claim.userIdentityId,
    claim.conversationId || "",
  ].join("\u0000");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function claimSourceRefs(claim: KnowledgeClaim): string[] {
  return [
    ...(claim.source.messageIds || []),
    ...(claim.source.eventId ? [claim.source.eventId] : []),
    ...(claim.source.sourceRecordId ? [claim.source.sourceRecordId] : []),
    ...(claim.source.storyId ? [claim.source.storyId] : []),
  ];
}

function claimMatchesObservation(
  claim: KnowledgeClaim,
  observation: DirectChatMemoryBridgeShadowObservation,
): boolean {
  const identity = observation.legacyIdentity;
  if (!identity?.sourceSetFingerprint || claim.kind !== "plan") return false;
  return fingerprintSourceRefs(claimSourceRefs(claim)) === identity.sourceSetFingerprint
    && (!identity.scopeFingerprint || fingerprintScope(claim) === identity.scopeFingerprint)
    && claim.temporalStatus === identity.temporalStatus;
}

function hasCompleteCancelledPlanGates(
  observation: DirectChatMemoryBridgeShadowObservation,
  validation: DirectChatMemorySafetyVetoShadowRecord,
): boolean {
  const legacyIdentity = observation.legacyIdentity;
  const v2Identity = observation.v2Identity;
  return validation.validatorResult === "allow_veto"
    && validation.validatorReason === "SAFETY_VETO_CANCELLED_PLAN"
    && validation.featureScope === "automatic_direct_chat"
    && observation.bridgeState === "safety_veto"
    && observation.bridgeReason === "cancelled_plan_not_active"
    && observation.bridgeCorrelation === "conflict"
    && observation.lineageStatus === "shared"
    && observation.pairUnique
    && observation.legacyAccepted
    && observation.legacyWriteEligibility === "canonical_write"
    && observation.legacyProvenanceTrusted
    && observation.v2ProvenanceTrusted
    && observation.legacySemanticKind === "plan"
    && observation.v2SemanticKind === "plan"
    && observation.v2MetadataSource === "v2_model_native"
    && legacyIdentity?.scopeExact === true
    && v2Identity?.scopeExact === true
    && legacyIdentity.sourceSetFingerprint !== undefined
    && v2Identity.sourceSetFingerprint !== undefined
    && legacyIdentity.sourceSetFingerprint === v2Identity.sourceSetFingerprint
    && legacyIdentity.scopeFingerprint !== undefined
    && legacyIdentity.scopeFingerprint === v2Identity.scopeFingerprint;
}

const makeRecord = (input: {
  validation?: DirectChatMemorySafetyVetoShadowRecord;
  observation?: DirectChatMemoryBridgeShadowObservation;
  reasonEnabled: boolean;
  suppressed: boolean;
  failOpen: boolean;
  batchCandidateCount: number;
  acceptedBeforeCount: number;
  acceptedAfterCount: number;
}): DirectChatMemorySafetyVetoCanaryRecord => ({
  evaluated: Boolean(input.validation?.evaluated),
  canaryEligible: Boolean(input.validation?.eligible && input.reasonEnabled && !input.failOpen),
  reasonEnabled: input.reasonEnabled,
  validatorResult: input.validation?.validatorResult || "not_evaluated",
  validatorReason: sanitizeCode(input.validation?.validatorReason || "unknown_safety_veto_reason", SAFE_VALIDATOR_REASON_CODES, "unknown_safety_veto_reason"),
  suppressed: input.suppressed,
  failOpen: input.failOpen,
  featureScope: "automatic_direct_chat",
  correlationClass: sanitizeCode(input.observation?.bridgeCorrelation || "unknown", SAFE_CORRELATION_CLASSES, "unknown"),
  metadataSource: sanitizeCode(input.validation?.metadataSourceClass || input.observation?.v2MetadataSource || "unknown", SAFE_METADATA_SOURCES, "unknown"),
  batchCandidateCount: input.batchCandidateCount,
  acceptedBeforeCount: input.acceptedBeforeCount,
  acceptedAfterCount: input.acceptedAfterCount,
});

/**
 * Candidate-local, brake-only filter. The input claims are never mutated and
 * all uncertainty preserves the existing legacy write.
 */
export function applyDirectChatMemorySafetyVetoCanary(input: {
  claims: readonly KnowledgeClaim[];
  bridgeShadow?: DirectChatMemoryBridgeShadowResult;
  safetyEvaluation?: DirectChatMemorySafetyVetoShadowEvaluation;
}): DirectChatMemorySafetyVetoCanaryResult {
  const unchanged = [...input.claims];
  if (!configured) {
    return {
      enabled: false,
      filteredAcceptedClaims: unchanged,
      evaluated: 0,
      canaryEligible: 0,
      suppressed: 0,
      failOpen: 0,
      records: [],
    };
  }

  const observations = input.bridgeShadow?.observations || [];
  const validations = input.safetyEvaluation?.records || [];
  const suppressedClaims = new Set<KnowledgeClaim>();
  const nextRecords: DirectChatMemorySafetyVetoCanaryRecord[] = [];
  let evaluated = 0;
  let canaryEligible = 0;
  let failOpen = 0;

  if (validations.length === 0) {
    failOpen += 1;
    nextRecords.push(makeRecord({
      reasonEnabled: false,
      suppressed: false,
      failOpen: true,
      batchCandidateCount: input.claims.length,
      acceptedBeforeCount: input.claims.length,
      acceptedAfterCount: input.claims.length,
    }));
  }

  validations.forEach((validation, index) => {
    const observation = observations[index];
    const reasonEnabled = enabledReasons.has(validation.validatorReason);
    const matchedClaims = observation
      ? input.claims.filter((claim) => claimMatchesObservation(claim, observation))
      : [];
    const gateFailure = !observation
      || validation.failOpen
      || !hasCompleteCancelledPlanGates(observation, validation)
      || matchedClaims.length !== 1;
    const eligible = validation.validatorResult === "allow_veto" && reasonEnabled && !gateFailure;
    const shouldSuppress = eligible && matchedClaims[0] !== undefined;
    const recordFailOpen = validation.failOpen
      || (validation.validatorResult === "allow_veto" && gateFailure);
    if (validation.evaluated) evaluated += 1;
    if (eligible) canaryEligible += 1;
    if (recordFailOpen) failOpen += 1;
    if (shouldSuppress) suppressedClaims.add(matchedClaims[0]!);
    const acceptedAfterCount = input.claims.length - suppressedClaims.size;
    nextRecords.push(makeRecord({
      validation,
      observation,
      reasonEnabled,
      suppressed: shouldSuppress,
      failOpen: recordFailOpen,
      batchCandidateCount: input.claims.length,
      acceptedBeforeCount: input.claims.length,
      acceptedAfterCount,
    }));
  });

  const filteredAcceptedClaims = unchanged.filter((claim) => !suppressedClaims.has(claim));
  // Correct the batch-after count for every record without exposing IDs/text.
  const finalizedRecords = nextRecords.map((record) => ({
    ...record,
    acceptedAfterCount: filteredAcceptedClaims.length,
  }));
  recordInMemory(finalizedRecords);
  return {
    enabled: true,
    filteredAcceptedClaims,
    evaluated,
    canaryEligible,
    suppressed: suppressedClaims.size,
    failOpen,
    records: finalizedRecords,
  };
}

export function configureDirectChatMemorySafetyVetoCanary(
  configuration: DirectChatMemorySafetyVetoCanaryConfiguration,
): void {
  configured = configuration.enabled && (configuration.explicitDebug === true || isDevBuild());
  enabledReasons = configured ? normalizeEnabledReasons(configuration.enabledReasons) : new Set();
  maxObservations = clampMaxObservations(configuration.maxObservations);
  if (!configured) records = [];
}

export function isDirectChatMemorySafetyVetoCanaryEnabled(): boolean {
  return configured;
}

export function clearDirectChatMemorySafetyVetoCanary(): void {
  records = [];
}

export function getDirectChatMemorySafetyVetoCanaryRecords(): DirectChatMemorySafetyVetoCanaryRecord[] {
  return records.slice();
}

export function exportDirectChatMemorySafetyVetoCanaryJson(): string {
  return JSON.stringify({
    schemaVersion: 1,
    persistenceMode: "in_memory_only",
    enabledReasons: Array.from(enabledReasons),
    maxObservations,
    records: getDirectChatMemorySafetyVetoCanaryRecords(),
  }, null, 2);
}

function installDevApi(): void {
  if (!isDevBuild()) return;
  const root = globalThis as typeof globalThis & {
    __fanfanjiMemorySafetyVetoCanary?: DirectChatMemorySafetyVetoCanaryDebugApi;
  };
  if (root.__fanfanjiMemorySafetyVetoCanary) return;
  root.__fanfanjiMemorySafetyVetoCanary = {
    enable: () => configureDirectChatMemorySafetyVetoCanary({
      enabled: true,
      enabledReasons: ENABLED_DIRECT_CHAT_MEMORY_SAFETY_VETO_CANARY_REASONS,
    }),
    disable: () => configureDirectChatMemorySafetyVetoCanary({ enabled: false }),
    clear: clearDirectChatMemorySafetyVetoCanary,
    count: () => getDirectChatMemorySafetyVetoCanaryRecords().length,
    exportJson: exportDirectChatMemorySafetyVetoCanaryJson,
  };
}

installDevApi();
