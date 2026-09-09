import { createId } from "../../../core/id/createId";
import type {
  DirectChatMemoryAdmissionShadowResult,
  DirectChatMemoryShadowObservation,
  DirectChatMemoryShadowSeverity,
} from "./directChatMemoryAdmissionShadow";

export type DirectChatMemoryShadowEvidenceOrigin = "real_runtime" | "synthetic";

export interface DirectChatMemoryAdmissionShadowScope {
  characterId: string;
  relationId: string;
  userIdentityId: string;
  conversationId: string;
}

export interface DirectChatMemoryAdmissionShadowEvidenceRecord {
  reportId: string;
  observedAt: number;
  evidenceOrigin: DirectChatMemoryShadowEvidenceOrigin;
  sessionScopeHash: string;
  producerVersion: "admission-v2-shadow.v2";
  candidateKind: DirectChatMemoryShadowObservation["candidateKind"];
  legacyDecision: DirectChatMemoryShadowObservation["legacyDecision"];
  legacyReasonCode: string;
  v2State: DirectChatMemoryShadowObservation["v2State"];
  v2ReasonCode: string;
  v2TargetKind?: DirectChatMemoryShadowObservation["v2TargetKind"];
  scopeExact: boolean;
  provenancePresent: boolean;
  evidenceTraceable: boolean;
  temporalStatus: DirectChatMemoryShadowObservation["temporalStatus"];
  metadataSource?: DirectChatMemoryShadowObservation["metadataSource"];
  epistemicStatus?: DirectChatMemoryShadowObservation["epistemicStatus"];
  planLifecycle?: DirectChatMemoryShadowObservation["planLifecycle"];
  proposedAuthorityRole?: DirectChatMemoryShadowObservation["proposedAuthorityRole"];
  resolvedAuthorityRole?: DirectChatMemoryShadowObservation["resolvedAuthorityRole"];
  duplicateDetected: boolean;
  sourceCount: number;
  sourceFingerprint: string;
  lineagePresent: boolean;
  kindMismatch: boolean;
  temporalMismatch: boolean;
  scopeMismatch: boolean;
  provenanceMismatch: boolean;
  severity: DirectChatMemoryShadowSeverity;
  mismatch: DirectChatMemoryShadowObservation["mismatch"];
}

export interface DirectChatMemoryAdmissionShadowMetrics {
  totalObservations: number;
  comparable: number;
  incomparable: number;
  bothAccepted: number;
  bothRejected: number;
  legacyAcceptedV2Rejected: number;
  legacyRejectedV2Accepted: number;
  kindMismatch: number;
  scopeMismatch: number;
  provenanceMismatch: number;
  temporalMismatch: number;
  duplicateMismatch: number;
  failedOpenCount: number;
  severityCounts: Record<DirectChatMemoryShadowSeverity, number>;
}

export interface DirectChatMemoryAdmissionShadowDebugConfiguration {
  enabled: boolean;
  /** Explicit test/debug injection may enable collection outside a Vite dev build. */
  explicitDebug?: boolean;
  maxObservations?: number;
}

export interface DirectChatMemoryAdmissionShadowDebugApi {
  enable: () => void;
  disable: () => void;
  clear: () => void;
  count: () => number;
  exportJson: () => string;
  download: () => boolean;
}

const DEFAULT_MAX_OBSERVATIONS = 100;
const MAX_OBSERVATIONS = 100;
const SESSION_SALT = createId("memory-shadow-session");
let configured = false;
let maxObservations = DEFAULT_MAX_OBSERVATIONS;
let recentRecords: DirectChatMemoryAdmissionShadowEvidenceRecord[] = [];
let failedOpenCount = 0;

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

const fingerprint = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const sessionFingerprint = (value: string): string => `session-fp-${fingerprint(`${SESSION_SALT}\u0000${value}`)}`;

function safeScopeHash(scope: {
  characterId?: string;
  relationId?: string;
  userIdentityId?: string;
  conversationId?: string;
}): string {
  return sessionFingerprint([
    scope.characterId || "",
    scope.relationId || "",
    scope.userIdentityId || "",
    scope.conversationId || "",
  ].join("\u0000"));
}

function sanitizeObservation(
  observation: DirectChatMemoryShadowObservation,
  scope: DirectChatMemoryAdmissionShadowScope,
  evidenceOrigin: DirectChatMemoryShadowEvidenceOrigin,
): DirectChatMemoryAdmissionShadowEvidenceRecord {
  return {
    reportId: createId("memory-shadow-report"),
    observedAt: Date.now(),
    evidenceOrigin,
    sessionScopeHash: safeScopeHash(scope),
    producerVersion: "admission-v2-shadow.v2",
    candidateKind: observation.candidateKind,
    legacyDecision: observation.legacyDecision,
    legacyReasonCode: observation.legacyReasonCode,
    v2State: observation.v2State,
    v2ReasonCode: observation.v2ReasonCode,
    ...(observation.v2TargetKind ? { v2TargetKind: observation.v2TargetKind } : {}),
    scopeExact: observation.scopeExact,
    provenancePresent: observation.provenancePresent,
    evidenceTraceable: observation.evidenceTraceable,
    temporalStatus: observation.temporalStatus,
    ...(observation.metadataSource ? { metadataSource: observation.metadataSource } : {}),
    ...(observation.epistemicStatus ? { epistemicStatus: observation.epistemicStatus } : {}),
    ...(observation.planLifecycle ? { planLifecycle: observation.planLifecycle } : {}),
    ...(observation.proposedAuthorityRole ? { proposedAuthorityRole: observation.proposedAuthorityRole } : {}),
    ...(observation.resolvedAuthorityRole ? { resolvedAuthorityRole: observation.resolvedAuthorityRole } : {}),
    duplicateDetected: observation.duplicateDetected,
    sourceCount: observation.sourceCount,
    sourceFingerprint: sessionFingerprint(observation.sourceFingerprint),
    lineagePresent: observation.lineagePresent,
    kindMismatch: observation.kindMismatch,
    temporalMismatch: observation.temporalMismatch,
    scopeMismatch: observation.scopeMismatch,
    provenanceMismatch: observation.provenanceMismatch,
    severity: observation.severity,
    mismatch: observation.mismatch,
  };
}

export function configureDirectChatMemoryAdmissionShadowEvidence(
  configuration: DirectChatMemoryAdmissionShadowDebugConfiguration,
): void {
  configured = configuration.enabled && (configuration.explicitDebug === true || isDevBuild());
  maxObservations = clampMaxObservations(configuration.maxObservations);
  if (!configured) {
    recentRecords = [];
    failedOpenCount = 0;
  }
}

export function isDirectChatMemoryAdmissionShadowEvidenceEnabled(): boolean {
  return configured;
}

export function clearDirectChatMemoryAdmissionShadowEvidence(): void {
  recentRecords = [];
  failedOpenCount = 0;
}

export function getDirectChatMemoryAdmissionShadowEvidence(): DirectChatMemoryAdmissionShadowEvidenceRecord[] {
  return recentRecords.slice();
}

export function aggregateDirectChatMemoryAdmissionShadowEvidence(
  records: readonly DirectChatMemoryAdmissionShadowEvidenceRecord[],
  failedOpenCount = 0,
): DirectChatMemoryAdmissionShadowMetrics {
  const severityCounts: Record<DirectChatMemoryShadowSeverity, number> = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0 };
  const metrics: DirectChatMemoryAdmissionShadowMetrics = {
    totalObservations: records.length,
    comparable: 0,
    incomparable: 0,
    bothAccepted: 0,
    bothRejected: 0,
    legacyAcceptedV2Rejected: 0,
    legacyRejectedV2Accepted: 0,
    kindMismatch: 0,
    scopeMismatch: 0,
    provenanceMismatch: 0,
    temporalMismatch: 0,
    duplicateMismatch: 0,
    failedOpenCount,
    severityCounts,
  };
  records.forEach((record) => {
    if (record.mismatch === "incomparable") metrics.incomparable += 1;
    else metrics.comparable += 1;
    if (record.mismatch === "both_allow") metrics.bothAccepted += 1;
    if (record.mismatch === "both_reject") metrics.bothRejected += 1;
    if (record.mismatch === "old_allow_new_reject") metrics.legacyAcceptedV2Rejected += 1;
    if (record.mismatch === "old_reject_new_accept") metrics.legacyRejectedV2Accepted += 1;
    if (record.kindMismatch) metrics.kindMismatch += 1;
    if (record.scopeMismatch) metrics.scopeMismatch += 1;
    if (record.provenanceMismatch) metrics.provenanceMismatch += 1;
    if (record.temporalMismatch) metrics.temporalMismatch += 1;
    if (record.duplicateDetected) metrics.duplicateMismatch += 1;
    severityCounts[record.severity] += 1;
  });
  return metrics;
}

export function recordDirectChatMemoryAdmissionShadowEvidence(input: {
  scope: DirectChatMemoryAdmissionShadowScope;
  result: DirectChatMemoryAdmissionShadowResult;
  evidenceOrigin?: DirectChatMemoryShadowEvidenceOrigin;
}): void {
  if (!configured) return;
  try {
    if (input.result.failedOpen) failedOpenCount += 1;
    const evidenceOrigin = input.evidenceOrigin || "real_runtime";
    const records = input.result.observations.map((observation) => sanitizeObservation(observation, input.scope, evidenceOrigin));
    recentRecords = [...recentRecords, ...records].slice(-maxObservations);
  } catch {
    // Shadow evidence is strictly fail-open. Production write and delivery do not depend on it.
  }
}

export function recordDirectChatMemoryAdmissionShadowFailure(): void {
  // Failure count is intentionally represented in the export metrics by the
  if (configured) failedOpenCount += 1;
}

export function exportDirectChatMemoryAdmissionShadowJson(): string {
  const records = getDirectChatMemoryAdmissionShadowEvidence();
  return JSON.stringify({
    schemaVersion: 2,
    evidenceOrigin: records.length > 0 && records.every((record) => record.evidenceOrigin === "real_runtime")
      ? "real_runtime"
      : records.length > 0 && records.every((record) => record.evidenceOrigin === "synthetic")
        ? "synthetic"
        : "mixed",
    exportedAt: Date.now(),
    metrics: aggregateDirectChatMemoryAdmissionShadowEvidence(records, failedOpenCount),
    observations: records,
  }, null, 2);
}

export function downloadDirectChatMemoryAdmissionShadowJson(): boolean {
  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") return false;
  try {
    const blob = new Blob([exportDirectChatMemoryAdmissionShadowJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fanfanji-memory-admission-shadow.json";
    anchor.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

function installDevApi(): void {
  if (!isDevBuild()) return;
  const root = globalThis as typeof globalThis & {
    __fanfanjiMemoryAdmissionShadow?: DirectChatMemoryAdmissionShadowDebugApi;
  };
  if (root.__fanfanjiMemoryAdmissionShadow) return;
  root.__fanfanjiMemoryAdmissionShadow = {
    enable: () => configureDirectChatMemoryAdmissionShadowEvidence({ enabled: true }),
    disable: () => configureDirectChatMemoryAdmissionShadowEvidence({ enabled: false }),
    clear: clearDirectChatMemoryAdmissionShadowEvidence,
    count: () => getDirectChatMemoryAdmissionShadowEvidence().length,
    exportJson: exportDirectChatMemoryAdmissionShadowJson,
    download: downloadDirectChatMemoryAdmissionShadowJson,
  };
}

installDevApi();
