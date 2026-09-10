import type {
  DirectChatMemoryBridgeShadowObservation,
} from "./directChatMemoryAdmissionBridgeShadow";
import {
  validateDirectChatSafetyVeto,
  type DirectChatSafetyVetoFeatureScope,
  type DirectChatSafetyVetoValidation,
} from "./directChatMemorySafetyVetoValidator";

export interface DirectChatMemorySafetyVetoShadowRecord {
  evaluated: boolean;
  validatorResult: DirectChatSafetyVetoValidation["result"] | "not_evaluated";
  validatorReason: string;
  proposedCanaryReason?: string;
  eligible: boolean;
  wouldVeto: boolean;
  skipped: boolean;
  failOpen: boolean;
  featureScope: DirectChatSafetyVetoFeatureScope;
  correlationState: string;
  bridgeState: string;
  metadataSourceClass: string;
}

export interface DirectChatMemorySafetyVetoShadowEvaluation {
  enabled: boolean;
  evaluated: number;
  eligible: number;
  wouldVeto: number;
  skipped: number;
  failOpen: number;
  records: readonly DirectChatMemorySafetyVetoShadowRecord[];
}

export interface DirectChatMemorySafetyVetoShadowConfiguration {
  enabled: boolean;
  /** Test/debug injection may enable collection outside a Vite dev build. */
  explicitDebug?: boolean;
  maxObservations?: number;
}

export interface DirectChatMemorySafetyVetoShadowDebugApi {
  enable: () => void;
  disable: () => void;
  clear: () => void;
  count: () => number;
  exportJson: () => string;
}

/** Minimal structural shape used by the Direct Chat hook; no authority is imported. */
export interface DirectChatSafetyVetoShadowExtractionResult {
  bridgeShadow: {
    observations: readonly DirectChatMemoryBridgeShadowObservation[];
  };
}

const DEFAULT_MAX_OBSERVATIONS = 100;
const MAX_OBSERVATIONS = 100;
let configured = false;
let maxObservations = DEFAULT_MAX_OBSERVATIONS;
let records: DirectChatMemorySafetyVetoShadowRecord[] = [];

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

function sanitizeRecord(input: {
  observation: DirectChatMemoryBridgeShadowObservation;
  validation: DirectChatSafetyVetoValidation;
  featureScope: DirectChatSafetyVetoFeatureScope;
  failOpen?: boolean;
}): DirectChatMemorySafetyVetoShadowRecord {
  const validation = input.validation;
  return {
    evaluated: true,
    validatorResult: validation.result,
    validatorReason: validation.reason,
    ...(validation.result === "allow_veto" ? { proposedCanaryReason: validation.reason } : {}),
    eligible: validation.result === "allow_veto",
    wouldVeto: validation.result === "allow_veto",
    skipped: false,
    failOpen: input.failOpen === true || validation.result === "insufficient",
    featureScope: input.featureScope,
    correlationState: input.observation.bridgeCorrelation,
    bridgeState: input.observation.bridgeState,
    metadataSourceClass: input.observation.v2MetadataSource,
  };
}

function sanitizeFailureRecord(
  observation: unknown,
  featureScope: DirectChatSafetyVetoFeatureScope,
): DirectChatMemorySafetyVetoShadowRecord {
  const candidate = observation && typeof observation === "object"
    ? observation as Partial<DirectChatMemoryBridgeShadowObservation>
    : {};
  return {
    evaluated: true,
    validatorResult: "insufficient",
    validatorReason: "validator_error_fail_open",
    eligible: false,
    wouldVeto: false,
    skipped: false,
    failOpen: true,
    featureScope,
    correlationState: typeof candidate.bridgeCorrelation === "string" ? candidate.bridgeCorrelation : "unknown",
    bridgeState: typeof candidate.bridgeState === "string" ? candidate.bridgeState : "unknown",
    metadataSourceClass: typeof candidate.v2MetadataSource === "string" ? candidate.v2MetadataSource : "unknown",
  };
}

function recordInMemory(next: readonly DirectChatMemorySafetyVetoShadowRecord[]): void {
  if (!configured || next.length === 0) return;
  records = [...records, ...next].slice(-maxObservations);
}

function inputFromObservation(observation: DirectChatMemoryBridgeShadowObservation) {
  const anatomy = observation.conflictAnatomy;
  const legacyIdentity = observation.legacyIdentity;
  const v2Identity = observation.v2Identity;
  const ambiguous = observation.bridgeCorrelation === "ambiguous"
    || observation.bridgeCorrelation === "unmatched_legacy"
    || observation.bridgeCorrelation === "unmatched_v2"
    || observation.bridgeCorrelation === "v2_only"
    || observation.bridgeCorrelation === "duplicate";
  const hasLegacy = observation.legacyIdentity !== undefined
    || observation.legacyWriteEligibility !== "unknown";
  const hasV2 = observation.v2Identity !== undefined
    || observation.v2MetadataSource !== "unknown";
  return {
    featureScope: "automatic_direct_chat" as const,
    legacy: hasLegacy ? {
      accepted: observation.legacyAccepted,
      semanticKind: observation.legacySemanticKind,
      writeEligibility: observation.legacyWriteEligibility,
    } : undefined,
    v2: hasV2 ? {
      semanticKind: observation.v2SemanticKind,
      ...(anatomy?.v2.durability ? { durability: anatomy.v2.durability } : {}),
      ...(anatomy?.v2.planLifecycle ? { planLifecycle: anatomy.v2.planLifecycle } : {}),
      metadataSource: observation.v2MetadataSource,
    } : undefined,
    bridgeState: observation.bridgeState,
    bridgeReason: observation.bridgeReason,
    correlationState: observation.bridgeCorrelation,
    correlation: {
      lineageStatus: observation.lineageStatus,
      sameExtractionOperation: observation.lineageStatus === "shared",
      pairUnique: observation.pairUnique,
      ambiguous,
      duplicate: observation.bridgeCorrelation === "duplicate" || observation.bridgeReason === "conflicting_duplicate",
      // The observation was produced by the current extraction call. There is
      // no historical cursor lookup here, so it is not marked stale.
      staleOperation: false,
    },
    exactScope: Boolean(
      legacyIdentity?.scopeExact === true
        && v2Identity?.scopeExact === true,
    ),
    trustedProvenance: observation.legacyProvenanceTrusted
      && observation.v2ProvenanceTrusted,
  };
}

/**
 * Evaluate current Bridge Shadow observations without changing any canonical
 * input. This adapter owns only sanitized, bounded in-memory telemetry.
 */
export function evaluateDirectChatSafetyVetoShadow(input: {
  observations: readonly DirectChatMemoryBridgeShadowObservation[];
  featureScope?: DirectChatSafetyVetoFeatureScope;
}): DirectChatMemorySafetyVetoShadowEvaluation {
  if (!configured) {
    return {
      enabled: false,
      evaluated: 0,
      eligible: 0,
      wouldVeto: 0,
      skipped: input.observations.length,
      failOpen: 0,
      records: [],
    };
  }
  const featureScope = input.featureScope || "automatic_direct_chat";
  const next: DirectChatMemorySafetyVetoShadowRecord[] = [];
  for (const observation of input.observations) {
    try {
      const validation = validateDirectChatSafetyVeto({
        ...inputFromObservation(observation),
        featureScope,
      });
      next.push(sanitizeRecord({ observation, validation, featureScope }));
    } catch {
      next.push(sanitizeFailureRecord(observation, featureScope));
    }
  }
  recordInMemory(next);
  return {
    enabled: true,
    evaluated: next.filter((item) => item.evaluated).length,
    eligible: next.filter((item) => item.eligible).length,
    wouldVeto: next.filter((item) => item.wouldVeto).length,
    skipped: next.filter((item) => item.skipped).length,
    failOpen: next.filter((item) => item.failOpen).length,
    records: next,
  };
}

/** Evaluate the current extraction result without exposing Bridge details in the controller. */
export function evaluateDirectChatSafetyVetoShadowForExtraction(
  input: DirectChatSafetyVetoShadowExtractionResult & { featureScope?: DirectChatSafetyVetoFeatureScope },
): DirectChatMemorySafetyVetoShadowEvaluation {
  return evaluateDirectChatSafetyVetoShadow({
    observations: input.bridgeShadow.observations,
    ...(input.featureScope ? { featureScope: input.featureScope } : {}),
  });
}

export function configureDirectChatMemorySafetyVetoShadow(
  configuration: DirectChatMemorySafetyVetoShadowConfiguration,
): void {
  configured = configuration.enabled && (configuration.explicitDebug === true || isDevBuild());
  maxObservations = clampMaxObservations(configuration.maxObservations);
  if (!configured) records = [];
}

export function isDirectChatMemorySafetyVetoShadowEnabled(): boolean {
  return configured;
}

export function clearDirectChatMemorySafetyVetoShadow(): void {
  records = [];
}

export function getDirectChatMemorySafetyVetoShadowRecords(): DirectChatMemorySafetyVetoShadowRecord[] {
  return records.slice();
}

export function exportDirectChatMemorySafetyVetoShadowJson(): string {
  return JSON.stringify({
    schemaVersion: 1,
    persistenceMode: "in_memory_only",
    maxObservations,
    records: getDirectChatMemorySafetyVetoShadowRecords(),
  }, null, 2);
}

function installDevApi(): void {
  if (!isDevBuild()) return;
  const root = globalThis as typeof globalThis & {
    __fanfanjiMemorySafetyVetoShadow?: DirectChatMemorySafetyVetoShadowDebugApi;
  };
  if (root.__fanfanjiMemorySafetyVetoShadow) return;
  root.__fanfanjiMemorySafetyVetoShadow = {
    enable: () => configureDirectChatMemorySafetyVetoShadow({ enabled: true }),
    disable: () => configureDirectChatMemorySafetyVetoShadow({ enabled: false }),
    clear: clearDirectChatMemorySafetyVetoShadow,
    count: () => getDirectChatMemorySafetyVetoShadowRecords().length,
    exportJson: exportDirectChatMemorySafetyVetoShadowJson,
  };
}

installDevApi();
