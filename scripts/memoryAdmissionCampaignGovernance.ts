import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  combineLongEvidenceExports,
  LONG_EVIDENCE_SCHEMA_VERSION,
  type DirectChatMemoryLongEvidenceExport,
  type DirectChatMemoryLongEvidenceRecord,
} from "../src/features/chat/services/directChatMemoryLongEvidenceCollector";

export const WINDOW_CLOSURE_SCHEMA_VERSION = "memory-admission-v2-window-closure-1" as const;
export const CAMPAIGN_SCHEMA_VERSION = "memory-admission-v2-campaign-1" as const;
export const PROMOTION_POLICY_VERSION = "memory-admission-v2-promotion-1" as const;

export type WindowStatus = "closed" | "closed_unrecoverable";
export type WindowClosureReason =
  | "raw_token_continuity_lost"
  | "intentional_window_rotation"
  | "campaign_completed"
  | "safety_stop"
  | "privacy_stop"
  | "accounting_stop";
export type CampaignStatus = "planned" | "active" | "paused" | "blocked" | "completed";

export interface MemoryAdmissionWindowClosureManifest {
  schemaVersion: typeof WINDOW_CLOSURE_SCHEMA_VERSION;
  campaignFingerprint: string;
  windowFingerprint: string;
  windowStatus: WindowStatus;
  closureReason: WindowClosureReason;
  closedAtUtc: string;
  authoritativeArtifactCount: number;
  lastAuthoritativeEvidenceDay: string | null;
  interruptedRuntimeExcluded: boolean;
  rawTokenPersisted: false;
  safetyIncidentCount: number;
  privacyViolationCount: number;
  accountingConflictCount: number;
  authoritativeEvidence: false;
}

export interface MemoryAdmissionApprovedWindow {
  windowFingerprint: string;
  artifactPaths: string[];
  closurePath: string;
}

export interface PromotionScopeMapping {
  windowFingerprint: string;
  localScopeFingerprint: string;
  promotionScopeFingerprint: string;
}

export interface CampaignCounts {
  authoritativeArtifactCount: number;
  formalSessionCount: number;
  distinctExactScopeCount: number;
  extractionBatchCount: number;
  validControlCount: number;
  validSuppressionCount: number;
  logicalActionTotal: number;
  physicalAttemptTotal: number;
  distinctEvidenceDayCount: number;
  fallbackBatchCount: number;
  safetyIncidentCount: number;
  privacyViolationCount: number;
  accountingConflictCount: number;
}

export interface CampaignThresholdProgress {
  sessions: { current: number; minimum: number };
  suppressions: { current: number; minimum: number };
  scopes: { current: number; minimum: number };
  days: { current: number; minimum: number };
  batches: { current: number; minimum: number };
  allMinimumsSatisfied: boolean;
  promotionEligible: boolean;
}

export interface MemoryAdmissionCampaignManifest {
  schemaVersion: typeof CAMPAIGN_SCHEMA_VERSION;
  campaignFingerprint: string;
  campaignStatus: CampaignStatus;
  promotionPolicyVersion: typeof PROMOTION_POLICY_VERSION;
  approvedWindows: MemoryAdmissionApprovedWindow[];
  closedWindows: string[];
  createdAtUtc: string;
  cumulativeAuthoritativeCounts: CampaignCounts;
  zeroErrorState: {
    safety: boolean;
    privacy: boolean;
    accounting: boolean;
  };
  firstEvidenceDay: string | null;
  lastEvidenceDay: string | null;
  thresholdProgress: CampaignThresholdProgress;
  promotionScopeMappings: PromotionScopeMapping[];
}

export interface CampaignWindowEvidenceInput {
  windowFingerprint: string;
  artifacts: readonly (string | DirectChatMemoryLongEvidenceExport)[];
  closure: MemoryAdmissionWindowClosureManifest;
}

export interface CampaignReviewInput {
  manifest: MemoryAdmissionCampaignManifest;
  windows: readonly CampaignWindowEvidenceInput[];
}

export type CampaignReviewStatus = "ok" | "blocked" | "malformed";

export interface CampaignReviewResult extends CampaignCounts {
  status: CampaignReviewStatus;
  schemaVersion: typeof CAMPAIGN_SCHEMA_VERSION;
  campaignFingerprint: string | null;
  campaignStatus: CampaignStatus | null;
  approvedWindowCount: number;
  closedWindowCount: number;
  windowCount: number;
  firstEvidenceDay: string | null;
  lastEvidenceDay: string | null;
  stickyFailure: boolean;
  allMinimumsSatisfied: boolean;
  promotionEligible: boolean;
  manifestSnapshotMatchesDerived: boolean;
  unapprovedWindowCount: number;
  duplicateWindowCount: number;
  crossWindowCopyCount: number;
  conflictingScopeMappingCount: number;
  missingScopeMappingCount: number;
  errors: string[];
}

const CAMPAIGN_FINGERPRINT = /^campaign-[a-z0-9][a-z0-9-]{2,96}$/u;
const WINDOW_FINGERPRINT = /^window-[0-9a-f]{16}$/u;
const SESSION_FINGERPRINT = /^session-[0-9a-f]{16}$/u;
const SCOPE_FINGERPRINT = /^scope-[0-9a-f]{8}$/u;
const PROMOTION_SCOPE_FINGERPRINT = /^promotion-scope-[a-z0-9][a-z0-9-]{1,64}$/u;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const EVIDENCE_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const WINDOW_STATUSES = new Set<WindowStatus>(["closed", "closed_unrecoverable"]);
const CLOSURE_REASONS = new Set<WindowClosureReason>([
  "raw_token_continuity_lost",
  "intentional_window_rotation",
  "campaign_completed",
  "safety_stop",
  "privacy_stop",
  "accounting_stop",
]);
const CAMPAIGN_STATUSES = new Set<CampaignStatus>(["planned", "active", "paused", "blocked", "completed"]);
const THRESHOLDS = { sessions: 5, suppressions: 10, scopes: 3, days: 7, batches: 20 } as const;
const FORBIDDEN_MANIFEST_KEYS = new Set([
  "rawtoken",
  "windowtoken",
  "apikey",
  "authorization",
  "prompt",
  "response",
  "userid",
  "useridentityid",
  "characterid",
  "relationid",
  "conversationid",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keyName(value: string): string {
  return value.toLowerCase().replace(/[\s_-]/gu, "");
}

function hasForbiddenManifestData(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenManifestData);
  if (!isObject(value)) return false;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_MANIFEST_KEYS.has(keyName(key))) return true;
    if (hasForbiddenManifestData(child)) return true;
  }
  return false;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function validUtc(value: unknown): value is string {
  return typeof value === "string" && UTC_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}

function emptyCounts(): CampaignCounts {
  return {
    authoritativeArtifactCount: 0,
    formalSessionCount: 0,
    distinctExactScopeCount: 0,
    extractionBatchCount: 0,
    validControlCount: 0,
    validSuppressionCount: 0,
    logicalActionTotal: 0,
    physicalAttemptTotal: 0,
    distinctEvidenceDayCount: 0,
    fallbackBatchCount: 0,
    safetyIncidentCount: 0,
    privacyViolationCount: 0,
    accountingConflictCount: 0,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseArtifact(value: string | DirectChatMemoryLongEvidenceExport): DirectChatMemoryLongEvidenceExport | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!isObject(parsed) || parsed.schemaVersion !== LONG_EVIDENCE_SCHEMA_VERSION || !Array.isArray(parsed.records)) return null;
  return parsed as unknown as DirectChatMemoryLongEvidenceExport;
}

function artifactRaw(value: string | DirectChatMemoryLongEvidenceExport): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function stableArtifactFingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createPromotionScopeFingerprint(
  campaignFingerprint: string,
  canonicalScopeTuple: readonly string[],
): string {
  const digest = createHash("sha256")
    .update(campaignFingerprint, "utf8")
    .update("\u0000", "utf8")
    .update(canonicalScopeTuple.join("\u0000"), "utf8")
    .digest("hex")
    .slice(0, 16);
  return "promotion-scope-" + digest;
}

export function validateWindowClosureManifest(
  manifest: unknown,
  expectedCampaignFingerprint?: string,
  expectedWindowFingerprint?: string,
): string[] {
  const errors: string[] = [];
  if (!isObject(manifest)) return ["closure_manifest_not_object"];
  if (manifest.schemaVersion !== WINDOW_CLOSURE_SCHEMA_VERSION) errors.push("closure_schema_invalid");
  if (typeof manifest.campaignFingerprint !== "string" || !CAMPAIGN_FINGERPRINT.test(manifest.campaignFingerprint)) errors.push("closure_campaign_invalid");
  if (typeof manifest.windowFingerprint !== "string" || !WINDOW_FINGERPRINT.test(manifest.windowFingerprint)) errors.push("closure_window_invalid");
  if (expectedCampaignFingerprint && manifest.campaignFingerprint !== expectedCampaignFingerprint) errors.push("closure_campaign_mismatch");
  if (expectedWindowFingerprint && manifest.windowFingerprint !== expectedWindowFingerprint) errors.push("closure_window_mismatch");
  if (!WINDOW_STATUSES.has(manifest.windowStatus as WindowStatus)) errors.push("closure_status_invalid");
  if (!CLOSURE_REASONS.has(manifest.closureReason as WindowClosureReason)) errors.push("closure_reason_invalid");
  if (!validUtc(manifest.closedAtUtc)) errors.push("closure_timestamp_invalid");
  if (!nonNegativeInteger(manifest.authoritativeArtifactCount)) errors.push("closure_artifact_count_invalid");
  if (manifest.lastAuthoritativeEvidenceDay !== null && !EVIDENCE_DAY.test(String(manifest.lastAuthoritativeEvidenceDay))) errors.push("closure_last_day_invalid");
  if (manifest.interruptedRuntimeExcluded !== true) errors.push("closure_interrupted_runtime_not_excluded");
  if (manifest.rawTokenPersisted !== false) errors.push("closure_raw_token_persisted");
  if (manifest.authoritativeEvidence !== false) errors.push("closure_manifest_marked_as_evidence");
  for (const key of ["safetyIncidentCount", "privacyViolationCount", "accountingConflictCount"]) {
    if (!nonNegativeInteger(manifest[key])) errors.push("closure_" + key + "_invalid");
  }
  if (hasForbiddenManifestData(manifest)) errors.push("closure_forbidden_data");
  return [...new Set(errors)];
}

function validateCampaignManifest(manifest: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(manifest)) return ["campaign_manifest_not_object"];
  if (manifest.schemaVersion !== CAMPAIGN_SCHEMA_VERSION) errors.push("campaign_schema_invalid");
  if (typeof manifest.campaignFingerprint !== "string" || !CAMPAIGN_FINGERPRINT.test(manifest.campaignFingerprint)) errors.push("campaign_fingerprint_invalid");
  if (!CAMPAIGN_STATUSES.has(manifest.campaignStatus as CampaignStatus)) errors.push("campaign_status_invalid");
  if (manifest.promotionPolicyVersion !== PROMOTION_POLICY_VERSION) errors.push("promotion_policy_invalid");
  if (!validUtc(manifest.createdAtUtc)) errors.push("campaign_created_at_invalid");
  if (!Array.isArray(manifest.approvedWindows) || manifest.approvedWindows.length === 0) errors.push("approved_windows_invalid");
  if (!Array.isArray(manifest.closedWindows)) errors.push("closed_windows_invalid");
  if (!isObject(manifest.cumulativeAuthoritativeCounts)) errors.push("campaign_counts_missing");
  if (!isObject(manifest.zeroErrorState)) errors.push("campaign_zero_error_state_missing");
  if (!isObject(manifest.thresholdProgress)) errors.push("campaign_threshold_progress_missing");
  if (!Array.isArray(manifest.promotionScopeMappings)) errors.push("promotion_scope_mappings_invalid");
  if (hasForbiddenManifestData(manifest)) errors.push("campaign_forbidden_data");
  if (Array.isArray(manifest.approvedWindows)) {
    const seen = new Set<string>();
    for (const entry of manifest.approvedWindows) {
      if (!isObject(entry)
        || typeof entry.windowFingerprint !== "string"
        || !WINDOW_FINGERPRINT.test(entry.windowFingerprint)
        || !Array.isArray(entry.artifactPaths)
        || entry.artifactPaths.some((value) => typeof value !== "string" || value.length === 0)
        || typeof entry.closurePath !== "string"
        || entry.closurePath.length === 0) {
        errors.push("approved_window_entry_invalid");
        continue;
      }
      if (seen.has(entry.windowFingerprint)) errors.push("duplicate_approved_window");
      seen.add(entry.windowFingerprint);
    }
  }
  if (Array.isArray(manifest.closedWindows) && Array.isArray(manifest.approvedWindows)) {
    const approved = new Set(manifest.approvedWindows.filter(isObject).map((entry) => String(entry.windowFingerprint)));
    const closed = new Set<string>();
    for (const value of manifest.closedWindows) {
      if (typeof value !== "string" || !WINDOW_FINGERPRINT.test(value)) errors.push("closed_window_invalid");
      if (closed.has(value)) errors.push("duplicate_closed_window");
      closed.add(value);
      if (!approved.has(value)) errors.push("closed_window_not_approved");
    }
  }
  if (Array.isArray(manifest.promotionScopeMappings)) {
    const mappingKeys = new Set<string>();
    for (const mapping of manifest.promotionScopeMappings) {
      if (!isObject(mapping)
        || typeof mapping.windowFingerprint !== "string"
        || !WINDOW_FINGERPRINT.test(mapping.windowFingerprint)
        || typeof mapping.localScopeFingerprint !== "string"
        || !SCOPE_FINGERPRINT.test(mapping.localScopeFingerprint)
        || typeof mapping.promotionScopeFingerprint !== "string"
        || !PROMOTION_SCOPE_FINGERPRINT.test(mapping.promotionScopeFingerprint)) {
        errors.push("promotion_scope_mapping_invalid");
        continue;
      }
      const key = mapping.windowFingerprint + "|" + mapping.localScopeFingerprint;
      if (mappingKeys.has(key)) errors.push("duplicate_promotion_scope_mapping");
      mappingKeys.add(key);
    }
  }
  return [...new Set(errors)];
}

function deriveThresholdProgress(counts: CampaignCounts, stickyFailure: boolean): CampaignThresholdProgress {
  const allMinimumsSatisfied = counts.formalSessionCount >= THRESHOLDS.sessions
    && counts.validSuppressionCount >= THRESHOLDS.suppressions
    && counts.distinctExactScopeCount >= THRESHOLDS.scopes
    && counts.distinctEvidenceDayCount >= THRESHOLDS.days
    && counts.extractionBatchCount >= THRESHOLDS.batches;
  return {
    sessions: { current: counts.formalSessionCount, minimum: THRESHOLDS.sessions },
    suppressions: { current: counts.validSuppressionCount, minimum: THRESHOLDS.suppressions },
    scopes: { current: counts.distinctExactScopeCount, minimum: THRESHOLDS.scopes },
    days: { current: counts.distinctEvidenceDayCount, minimum: THRESHOLDS.days },
    batches: { current: counts.extractionBatchCount, minimum: THRESHOLDS.batches },
    allMinimumsSatisfied,
    promotionEligible: allMinimumsSatisfied && !stickyFailure,
  };
}

function compareCounts(left: unknown, right: CampaignCounts): boolean {
  if (!isObject(left)) return false;
  return (Object.keys(right) as (keyof CampaignCounts)[]).every((key) => left[key] === right[key]);
}

function emptyResult(errors: string[], manifest?: MemoryAdmissionCampaignManifest): CampaignReviewResult {
  return {
    ...emptyCounts(),
    status: errors.length > 0 ? "blocked" : "ok",
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    campaignFingerprint: manifest?.campaignFingerprint ?? null,
    campaignStatus: manifest?.campaignStatus ?? null,
    approvedWindowCount: manifest?.approvedWindows.length ?? 0,
    closedWindowCount: manifest?.closedWindows.length ?? 0,
    windowCount: 0,
    firstEvidenceDay: null,
    lastEvidenceDay: null,
    stickyFailure: false,
    allMinimumsSatisfied: false,
    promotionEligible: false,
    manifestSnapshotMatchesDerived: false,
    unapprovedWindowCount: 0,
    duplicateWindowCount: 0,
    crossWindowCopyCount: 0,
    conflictingScopeMappingCount: 0,
    missingScopeMappingCount: 0,
    errors,
  };
}

export function reviewMemoryAdmissionCampaignEvidence(input: CampaignReviewInput): CampaignReviewResult {
  const manifestErrors = validateCampaignManifest(input?.manifest);
  const manifest = input?.manifest;
  if (manifestErrors.length > 0 || !manifest) return emptyResult(manifestErrors.length > 0 ? manifestErrors : ["campaign_manifest_missing"]);
  const errors = [...manifestErrors];
  const approved = new Map<string, MemoryAdmissionApprovedWindow>();
  manifest.approvedWindows.forEach((entry) => approved.set(entry.windowFingerprint, entry));

  const inputWindows = new Map<string, CampaignWindowEvidenceInput>();
  let duplicateWindowCount = 0;
  for (const window of input.windows || []) {
    if (inputWindows.has(window.windowFingerprint)) duplicateWindowCount += 1;
    inputWindows.set(window.windowFingerprint, window);
  }
  const unapprovedWindowCount = [...inputWindows.keys()].filter((key) => !approved.has(key)).length;
  if (unapprovedWindowCount > 0) errors.push("unapproved_window");
  if (duplicateWindowCount > 0) errors.push("duplicate_window_input");
  if (inputWindows.size !== approved.size) errors.push("approved_window_set_incomplete");

  const mappings = new Map<string, PromotionScopeMapping>();
  const localToPromotion = new Map<string, string>();
  let conflictingScopeMappingCount = 0;
  for (const mapping of manifest.promotionScopeMappings) {
    const key = mapping.windowFingerprint + "|" + mapping.localScopeFingerprint;
    const existing = mappings.get(key);
    if (existing && existing.promotionScopeFingerprint !== mapping.promotionScopeFingerprint) conflictingScopeMappingCount += 1;
    mappings.set(key, mapping);
    const localKey = mapping.windowFingerprint + "|" + mapping.localScopeFingerprint;
    const localExisting = localToPromotion.get(localKey);
    if (localExisting && localExisting !== mapping.promotionScopeFingerprint) conflictingScopeMappingCount += 1;
    localToPromotion.set(localKey, mapping.promotionScopeFingerprint);
  }
  if (conflictingScopeMappingCount > 0) errors.push("conflicting_scope_mapping");

  const allRecords = new Map<string, { record: DirectChatMemoryLongEvidenceRecord; windows: Set<string> }>();
  const seenArtifactFingerprints = new Set<string>();
  const sessionWindows = new Map<string, Set<string>>();
  const actionWindows = new Map<string, Set<string>>();
  const batchWindows = new Map<string, Set<string>>();
  let authoritativeArtifactCount = 0;
  let privacyViolationCount = 0;
  let safetyIncidentCount = 0;
  let accountingConflictCount = 0;
  let missingScopeMappingCount = 0;
  let crossWindowCopyCount = 0;

  for (const [windowFingerprint, window] of inputWindows) {
    const approvedEntry = approved.get(windowFingerprint);
    if (!approvedEntry) continue;
    const closureErrors = validateWindowClosureManifest(window.closure, manifest.campaignFingerprint, windowFingerprint);
    errors.push(...closureErrors);
    if (!manifest.closedWindows.includes(windowFingerprint)) errors.push("window_not_closed");
    if (window.closure.authoritativeArtifactCount < 0) errors.push("closure_count_invalid");

    const artifactStrings = window.artifacts.map(artifactRaw);
    const uniqueArtifacts = artifactStrings.filter((raw, index) => artifactStrings.findIndex((candidate) => stableArtifactFingerprint(candidate) === stableArtifactFingerprint(raw)) === index);
    uniqueArtifacts.forEach((raw) => {
      const artifactFingerprint = stableArtifactFingerprint(raw);
      if (!seenArtifactFingerprints.has(artifactFingerprint)) {
        seenArtifactFingerprints.add(artifactFingerprint);
        authoritativeArtifactCount += 1;
      }
    });
    const review = combineLongEvidenceExports(uniqueArtifacts);
    if (review.status !== "ok") errors.push("window_level_review_failed");
    if (window.closure.authoritativeArtifactCount !== uniqueArtifacts.length
      || window.closure.lastAuthoritativeEvidenceDay !== review.lastEvidenceDay
      || window.closure.safetyIncidentCount !== review.safetyIncidentCount
      || window.closure.accountingConflictCount !== review.accountingConflictCount) {
      errors.push("closure_snapshot_mismatch");
    }
    if (review.status !== "ok") continue;

    const windowRecords = new Map<string, DirectChatMemoryLongEvidenceRecord>();
    for (const artifact of uniqueArtifacts) {
      const parsed = parseArtifact(artifact);
      if (!parsed) continue;
      for (const record of parsed.records) {
        if (!isObject(record) || typeof record.evidenceRecordFingerprint !== "string") continue;
        windowRecords.set(record.evidenceRecordFingerprint, record as DirectChatMemoryLongEvidenceRecord);
      }
    }
    let windowPrivacyViolationCount = 0;
    let windowSafetyIncidentCount = review.safetyIncidentCount;
    for (const [evidenceFingerprint, record] of windowRecords) {
      const prior = allRecords.get(evidenceFingerprint);
      if (prior && !prior.windows.has(windowFingerprint)) {
        crossWindowCopyCount += 1;
        prior.windows.add(windowFingerprint);
      } else if (!prior) {
        allRecords.set(evidenceFingerprint, { record, windows: new Set([windowFingerprint]) });
      }
      const session = record.sessionFingerprint;
      const action = record.logicalActionFingerprint;
      const batch = record.batchActionFingerprint;
      for (const [identity, target] of [[session, sessionWindows], [action, actionWindows], [batch, batchWindows]] as const) {
        if (typeof identity !== "string" || identity === "unknown") continue;
        const set = target.get(identity) || new Set<string>();
        set.add(windowFingerprint);
        target.set(identity, set);
      }
      if (record.privacyStatus !== "metadata_only") {
        privacyViolationCount += 1;
        windowPrivacyViolationCount += 1;
      }
      if (record.classification === "SAFETY_INCIDENT") safetyIncidentCount += 1;
      if (record.correlationClass === "cross_scope" || record.v2OnlyWrite || record.cursorLoop || record.replayLoop) {
        safetyIncidentCount += 1;
        windowSafetyIncidentCount += 1;
      }
    }
    if (window.closure.privacyViolationCount !== windowPrivacyViolationCount
      || window.closure.safetyIncidentCount !== windowSafetyIncidentCount) errors.push("closure_snapshot_mismatch");
    accountingConflictCount += review.accountingConflictCount;
  }

  for (const sets of [sessionWindows, actionWindows, batchWindows]) {
    sets.forEach((windows) => { if (windows.size > 1) crossWindowCopyCount += 1; });
  }
  if (crossWindowCopyCount > 0) errors.push("cross_window_copy_detected");

  const uniqueRecords = [...allRecords.values()].map((entry) => entry.record);
  const eligibleRecords = uniqueRecords.filter((record) =>
    record.classification === "VALID_ELIGIBLE_SUPPRESSION" || record.classification === "VALID_CONTROL");
  const actionGroups = new Map<string, { logical: number; physical: number; shape: string; conflict: boolean; records: DirectChatMemoryLongEvidenceRecord[] }>();
  for (const record of eligibleRecords) {
    const key = record.logicalActionFingerprint;
    if (key === "unknown" || record.accountingShape === "unknown") continue;
    const group = actionGroups.get(key);
    if (!group) {
      actionGroups.set(key, {
        logical: record.providerLogicalRequestCount,
        physical: record.providerPhysicalAttemptCount,
        shape: record.accountingShape,
        conflict: false,
        records: [record],
      });
    } else {
      if (group.logical !== record.providerLogicalRequestCount
        || group.physical !== record.providerPhysicalAttemptCount
        || group.shape !== record.accountingShape) group.conflict = true;
      group.records.push(record);
    }
  }

  const authoritativeActionKeys = new Set<string>();
  actionGroups.forEach((group, key) => {
    if (!group.conflict) authoritativeActionKeys.add(key);
    else accountingConflictCount += 1;
  });
  const authoritativeRecords = eligibleRecords.filter((record) => authoritativeActionKeys.has(record.logicalActionFingerprint));
  const promotionScopes = new Set<string>();
  const sessions = new Set<string>();
  const batches = new Set<string>();
  const evidenceDays = new Set<string>();
  let validControlCount = 0;
  let validSuppressionCount = 0;
  let physicalAttemptTotal = 0;
  const countedActions = new Set<string>();
  const countedDays = new Set<string>();
  for (const record of authoritativeRecords) {
    const mappingKey = record.windowFingerprint + "|" + record.scopeFingerprint;
    const mapping = mappings.get(mappingKey);
    if (!mapping) {
      missingScopeMappingCount += 1;
    } else if (record.exactScope && record.privacyStatus === "metadata_only" && record.scopeFingerprint !== "unknown") {
      promotionScopes.add(mapping.promotionScopeFingerprint);
    }
    if (record.sessionFingerprint && SESSION_FINGERPRINT.test(record.sessionFingerprint)) sessions.add(record.sessionFingerprint);
    if (record.batchActionFingerprint !== "unknown") batches.add(record.batchActionFingerprint);
    if (EVIDENCE_DAY.test(record.evidenceDay)) evidenceDays.add(record.evidenceDay);
    if (!countedActions.has(record.logicalActionFingerprint)) {
      countedActions.add(record.logicalActionFingerprint);
      const group = actionGroups.get(record.logicalActionFingerprint);
      physicalAttemptTotal += group?.physical || 0;
    }
    if (record.classification === "VALID_CONTROL") validControlCount += 1;
    if (record.classification === "VALID_ELIGIBLE_SUPPRESSION") validSuppressionCount += 1;
  }
  if (missingScopeMappingCount > 0) errors.push("missing_scope_mapping");

  const fallbackBatchCount = new Set(authoritativeRecords
    .filter((record) => record.accountingShape === "fallback_split_rows")
    .map((record) => record.batchActionFingerprint)
    .filter((value) => value !== "unknown")).size;

  const counts: CampaignCounts = {
    authoritativeArtifactCount,
    formalSessionCount: sessions.size,
    distinctExactScopeCount: promotionScopes.size,
    extractionBatchCount: batches.size,
    validControlCount,
    validSuppressionCount,
    logicalActionTotal: countedActions.size,
    physicalAttemptTotal,
    distinctEvidenceDayCount: evidenceDays.size,
    fallbackBatchCount,
    safetyIncidentCount,
    privacyViolationCount,
    accountingConflictCount,
  };
  const stickyFailure = safetyIncidentCount > 0
    || privacyViolationCount > 0
    || accountingConflictCount > 0
    || manifest.zeroErrorState.safety === false
    || manifest.zeroErrorState.privacy === false
    || manifest.zeroErrorState.accounting === false;
  if (stickyFailure) errors.push("sticky_failure");
  const thresholdProgress = deriveThresholdProgress(counts, stickyFailure);
  const status: CampaignReviewStatus = errors.length > 0 ? "blocked" : "ok";
  return {
    ...counts,
    status,
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    campaignFingerprint: manifest.campaignFingerprint,
    campaignStatus: manifest.campaignStatus,
    approvedWindowCount: manifest.approvedWindows.length,
    closedWindowCount: manifest.closedWindows.length,
    windowCount: inputWindows.size,
    firstEvidenceDay: evidenceDays.size > 0 ? [...evidenceDays].sort()[0] : null,
    lastEvidenceDay: evidenceDays.size > 0 ? [...evidenceDays].sort().at(-1) || null : null,
    stickyFailure,
    allMinimumsSatisfied: thresholdProgress.allMinimumsSatisfied,
    promotionEligible: status === "ok" && thresholdProgress.promotionEligible,
    manifestSnapshotMatchesDerived: compareCounts(manifest.cumulativeAuthoritativeCounts, counts),
    unapprovedWindowCount,
    duplicateWindowCount,
    crossWindowCopyCount,
    conflictingScopeMappingCount,
    missingScopeMappingCount,
    errors: [...new Set(errors)],
  };
}

export function loadCampaignManifest(filePath: string): MemoryAdmissionCampaignManifest {
  return JSON.parse(readFileSync(filePath, "utf8")) as MemoryAdmissionCampaignManifest;
}

export function loadCampaignWindowInput(
  projectRoot: string,
  approvedWindow: MemoryAdmissionApprovedWindow,
  manifestDirectory: string,
  campaignFingerprint: string,
): CampaignWindowEvidenceInput {
  const artifacts = approvedWindow.artifactPaths.map((filePath) => {
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
    if (!existsSync(resolved)) throw new Error("Missing artifact: " + resolved);
    return readFileSync(resolved, "utf8");
  });
  const closureFile = path.isAbsolute(approvedWindow.closurePath)
    ? approvedWindow.closurePath
    : path.resolve(projectRoot, approvedWindow.closurePath);
  if (!existsSync(closureFile)) throw new Error("Missing closure manifest: " + closureFile);
  const closure = JSON.parse(readFileSync(closureFile, "utf8")) as MemoryAdmissionWindowClosureManifest;
  if (manifestDirectory.length === 0 || campaignFingerprint.length === 0) throw new Error("Manifest context is required");
  return { windowFingerprint: approvedWindow.windowFingerprint, artifacts, closure };
}

export function buildCampaignManifest(
  input: Omit<MemoryAdmissionCampaignManifest, "cumulativeAuthoritativeCounts" | "zeroErrorState" | "firstEvidenceDay" | "lastEvidenceDay" | "thresholdProgress">,
  review: CampaignReviewResult,
): MemoryAdmissionCampaignManifest {
  return {
    ...input,
    cumulativeAuthoritativeCounts: {
      authoritativeArtifactCount: review.authoritativeArtifactCount,
      formalSessionCount: review.formalSessionCount,
      distinctExactScopeCount: review.distinctExactScopeCount,
      extractionBatchCount: review.extractionBatchCount,
      validControlCount: review.validControlCount,
      validSuppressionCount: review.validSuppressionCount,
      logicalActionTotal: review.logicalActionTotal,
      physicalAttemptTotal: review.physicalAttemptTotal,
      distinctEvidenceDayCount: review.distinctEvidenceDayCount,
      fallbackBatchCount: review.fallbackBatchCount,
      safetyIncidentCount: review.safetyIncidentCount,
      privacyViolationCount: review.privacyViolationCount,
      accountingConflictCount: review.accountingConflictCount,
    },
    zeroErrorState: {
      safety: review.safetyIncidentCount === 0,
      privacy: review.privacyViolationCount === 0,
      accounting: review.accountingConflictCount === 0,
    },
    firstEvidenceDay: review.firstEvidenceDay,
    lastEvidenceDay: review.lastEvidenceDay,
    thresholdProgress: {
      sessions: { current: review.formalSessionCount, minimum: THRESHOLDS.sessions },
      suppressions: { current: review.validSuppressionCount, minimum: THRESHOLDS.suppressions },
      scopes: { current: review.distinctExactScopeCount, minimum: THRESHOLDS.scopes },
      days: { current: review.distinctEvidenceDayCount, minimum: THRESHOLDS.days },
      batches: { current: review.extractionBatchCount, minimum: THRESHOLDS.batches },
      allMinimumsSatisfied: review.allMinimumsSatisfied,
      promotionEligible: review.promotionEligible,
    },
  };
}

export interface CurrentCampaignGovernanceArtifacts {
  closure: MemoryAdmissionWindowClosureManifest;
  manifest: MemoryAdmissionCampaignManifest;
  review: CampaignReviewResult;
}

/** Build the current campaign/closure metadata from one explicit disk artifact. */
export function buildCurrentCampaignGovernanceArtifacts(
  projectRoot: string,
  campaignFingerprint: string,
  windowFingerprint: string,
  artifactPath: string,
  closedAtUtc: string,
): CurrentCampaignGovernanceArtifacts {
  const artifactAbsolutePath = path.isAbsolute(artifactPath) ? artifactPath : path.resolve(projectRoot, artifactPath);
  if (!existsSync(artifactAbsolutePath)) throw new Error("Missing artifact: " + artifactAbsolutePath);
  const artifact = readFileSync(artifactAbsolutePath, "utf8");
  const levelOne = combineLongEvidenceExports([artifact]);
  if (levelOne.status !== "ok") throw new Error("Level-1 reviewer failed: " + levelOne.status);
  const closure: MemoryAdmissionWindowClosureManifest = {
    schemaVersion: WINDOW_CLOSURE_SCHEMA_VERSION,
    campaignFingerprint,
    windowFingerprint,
    windowStatus: "closed_unrecoverable",
    closureReason: "raw_token_continuity_lost",
    closedAtUtc,
    authoritativeArtifactCount: 1,
    lastAuthoritativeEvidenceDay: levelOne.lastEvidenceDay,
    interruptedRuntimeExcluded: true,
    rawTokenPersisted: false,
    safetyIncidentCount: levelOne.safetyIncidentCount,
    privacyViolationCount: 0,
    accountingConflictCount: levelOne.accountingConflictCount,
    authoritativeEvidence: false,
  };
  const relativeArtifactPath = path.relative(projectRoot, artifactAbsolutePath).replaceAll(path.sep, "/");
  const closurePath = path.join(path.dirname(relativeArtifactPath), "window-closure.json").replaceAll(path.sep, "/");
  const approvedWindow: MemoryAdmissionApprovedWindow = {
    windowFingerprint,
    artifactPaths: [relativeArtifactPath],
    closurePath,
  };
  const base: Omit<MemoryAdmissionCampaignManifest, "cumulativeAuthoritativeCounts" | "zeroErrorState" | "firstEvidenceDay" | "lastEvidenceDay" | "thresholdProgress"> = {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    campaignFingerprint,
    campaignStatus: "paused",
    promotionPolicyVersion: PROMOTION_POLICY_VERSION,
    approvedWindows: [approvedWindow],
    closedWindows: [windowFingerprint],
    createdAtUtc: closedAtUtc,
    promotionScopeMappings: [{
      windowFingerprint,
      localScopeFingerprint: "scope-bbb51957",
      promotionScopeFingerprint: "promotion-scope-001",
    }],
  };
  const emptyManifest = makePlaceholderCampaignManifest(base);
  const provisionalReview = reviewMemoryAdmissionCampaignEvidence({
    manifest: emptyManifest,
    windows: [{
      windowFingerprint,
      artifacts: [artifact],
      closure,
    }],
  });
  const manifest = buildCampaignManifest(base, provisionalReview);
  const review = reviewMemoryAdmissionCampaignEvidence({
    manifest,
    windows: [{
      windowFingerprint,
      artifacts: [artifact],
      closure,
    }],
  });
  return { closure, manifest, review };
}

function makePlaceholderCampaignManifest(
  base: Omit<MemoryAdmissionCampaignManifest, "cumulativeAuthoritativeCounts" | "zeroErrorState" | "firstEvidenceDay" | "lastEvidenceDay" | "thresholdProgress">,
): MemoryAdmissionCampaignManifest {
  return {
    ...base,
    cumulativeAuthoritativeCounts: emptyCounts(),
    zeroErrorState: { safety: true, privacy: true, accounting: true },
    firstEvidenceDay: null,
    lastEvidenceDay: null,
    thresholdProgress: {
      sessions: { current: 0, minimum: THRESHOLDS.sessions },
      suppressions: { current: 0, minimum: THRESHOLDS.suppressions },
      scopes: { current: 0, minimum: THRESHOLDS.scopes },
      days: { current: 0, minimum: THRESHOLDS.days },
      batches: { current: 0, minimum: THRESHOLDS.batches },
      allMinimumsSatisfied: false,
      promotionEligible: false,
    },
  };
}
