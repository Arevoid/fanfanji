import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  combineLongEvidenceExports,
  LONG_EVIDENCE_SCHEMA_VERSION,
  type DirectChatMemoryLongEvidenceCombinedReview,
} from "../src/features/chat/services/directChatMemoryLongEvidenceCollector";

/**
 * File-level privacy policy for evidence artifacts. The collector already
 * emits a sanitized shape; this second boundary protects the on-disk review
 * tool from accidentally accepting a future extra field that contains raw
 * identity or content data.
 */
const FORBIDDEN_KEYS = new Set([
  "windowreviewtoken",
  "logicalactionid",
  "characterid",
  "relationid",
  "identityid",
  "userid",
  "useridentityid",
  "conversationid",
  "candidateid",
  "sourceid",
  "lineageid",
  "message",
  "statement",
  "prompt",
  "response",
  "authorization",
  "apikey",
  "secret",
  "token",
]);

export interface MemoryAdmissionLongEvidenceArtifactReview {
  status: DirectChatMemoryLongEvidenceCombinedReview["status"];
  schemaVersion: typeof LONG_EVIDENCE_SCHEMA_VERSION;
  windowCount: number;
  windowFingerprint: string | null;
  mixedWindow: boolean;
  malformedExportCount: number;
  malformedRecordCount: number;
  rawRecordCount: number;
  dedupedRecordCount: number;
  formalSessionCount: number;
  distinctExactScopeCount: number;
  extractionBatchCount: number;
  validSuppressionCount: number;
  validControlCount: number;
  failOpenCount: number;
  invalidSampleCount: number;
  safetyIncidentCount: number;
  logicalActionTotal: number;
  physicalAttemptTotal: number;
  accountingConflictCount: number;
  unknownGroupingCount: number;
  firstEvidenceDay: string | null;
  lastEvidenceDay: string | null;
  distinctEvidenceDayCount: number;
  privacyViolationCount: number;
  authoritativeArtifactCount: number;
  rejectedArtifactCount: number;
}

interface ParsedArtifact {
  raw: string;
  value: Record<string, unknown>;
}

const REQUIRED_RECORD_KEYS = [
  "schemaVersion", "timeBucket", "featureScope", "sessionOrdinal", "windowOrdinal",
  "windowFingerprint", "sessionFingerprint", "evidenceRecordFingerprint", "observationOrdinal",
  "evidenceDay", "evidenceMode", "scopeFingerprint", "logicalActionFingerprint",
  "batchActionFingerprint", "canaryReason", "validatorResult", "validatorReason", "bridgeState",
  "bridgeReason", "correlationClass", "lineageStatus", "pairUnique", "exactScope",
  "provenanceTrusted", "metadataSource", "semanticKind", "planLifecycle", "legacyAccepted",
  "legacyWriteEligible", "candidateSuppressed", "vetoedCandidateCanonicalAbsent", "failOpen",
  "batchAcceptedBefore", "batchAcceptedAfter", "batchZeroCandidates", "survivingCanonicalWritesExpected",
  "survivingCanonicalWritesObserved", "cursorAdvanced", "canonicalWriteCountDelta", "summaryDelta",
  "projectionDelta", "providerLogicalRequestCount", "providerPhysicalAttemptCount", "accountingShape",
  "promptDelta", "canaryProviderDelta", "extractionLatencyBucket", "canaryFilteringLatencyBucket",
  "privacyStatus", "vetoedCandidateSummaryPresent", "vetoedCandidateProjectionPresent", "v2OnlyWrite",
  "cursorLoop", "replayLoop", "blockingMaterialUserRegression", "classification",
] as const;

function hasCompleteRecordShape(value: unknown): value is Record<string, unknown> {
  return isObject(value) && REQUIRED_RECORD_KEYS.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[\s_-]/gu, "");
}

function hasForbiddenPrivacy(value: unknown, pathValue = "$"): { path: string; key?: string; value?: string } | null {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string" && (/^memory-evidence-window-/iu.test(value) || /^bearer\s/iu.test(value) || /^sk-[a-z0-9]/iu.test(value))) {
      return { path: pathValue, value: "redacted-sensitive-value" };
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = hasForbiddenPrivacy(value[index], `${pathValue}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (FORBIDDEN_KEYS.has(normalized)
      || /^raw(?:id|token|error|content)/iu.test(normalized)
      || /^(?:error|exception)(?:message|text|body|content)?$/iu.test(normalized)
      || (normalized.includes("lineage") && normalized.endsWith("id"))) {
      return { path: `${pathValue}.${key}`, key };
    }
    const found = hasForbiddenPrivacy(child, `${pathValue}.${key}`);
    if (found) return found;
  }
  return null;
}

function readArtifact(filePath: string): { artifact?: ParsedArtifact; malformed: boolean; privacyViolation: boolean } {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return { malformed: true, privacyViolation: false };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return { malformed: true, privacyViolation: false };
  }
  if (!isObject(value)
    || value.schemaVersion !== LONG_EVIDENCE_SCHEMA_VERSION
    || !Array.isArray(value.records)
    || value.records.length === 0) {
    return { malformed: true, privacyViolation: false };
  }
  if (hasForbiddenPrivacy(value)) return { malformed: true, privacyViolation: true };
  return { artifact: { raw, value }, malformed: false, privacyViolation: false };
}

function projectReview(review: DirectChatMemoryLongEvidenceCombinedReview): Omit<MemoryAdmissionLongEvidenceArtifactReview, "privacyViolationCount" | "authoritativeArtifactCount" | "rejectedArtifactCount"> {
  return {
    status: review.status,
    schemaVersion: LONG_EVIDENCE_SCHEMA_VERSION,
    windowCount: review.windowCount,
    windowFingerprint: review.windowFingerprint,
    mixedWindow: review.status === "mixed_window",
    malformedExportCount: review.malformedExportCount,
    malformedRecordCount: review.malformedRecordCount,
    rawRecordCount: review.recordCount,
    dedupedRecordCount: review.dedupedRecordCount,
    formalSessionCount: review.formalSessionCount,
    distinctExactScopeCount: review.distinctExactScopeCount,
    extractionBatchCount: review.extractionBatchCount,
    validSuppressionCount: review.validSuppressionCount,
    validControlCount: review.validControlCount,
    failOpenCount: review.countsByClassification.FAIL_OPEN_OBSERVATION,
    invalidSampleCount: review.countsByClassification.INVALID_SAMPLE,
    safetyIncidentCount: review.safetyIncidentCount,
    logicalActionTotal: review.logicalActionTotal,
    physicalAttemptTotal: review.physicalAttemptTotal,
    accountingConflictCount: review.accountingConflictCount,
    unknownGroupingCount: review.unknownGroupingCount,
    firstEvidenceDay: review.firstEvidenceDay,
    lastEvidenceDay: review.lastEvidenceDay,
    distinctEvidenceDayCount: review.calendarDaySpan,
  };
}

/** Review complete sanitized export files using the production combiner. */
export function reviewMemoryAdmissionLongEvidenceArtifacts(
  filePaths: readonly string[],
): MemoryAdmissionLongEvidenceArtifactReview {
  const validExports: string[] = [];
  let malformedFileCount = 0;
  let malformedRecordCount = 0;
  let privacyViolationCount = 0;
  for (const filePath of filePaths) {
    const result = readArtifact(filePath);
    if (!result.artifact) {
      malformedFileCount += result.malformed ? 1 : 0;
      privacyViolationCount += result.privacyViolation ? 1 : 0;
      continue;
    }
    const records = Array.isArray(result.artifact.value.records) ? result.artifact.value.records : [];
    const completeRecords = records.filter(hasCompleteRecordShape);
    malformedRecordCount += records.length - completeRecords.length;
    if (completeRecords.length === 0) continue;
    if (completeRecords.length === records.length) {
      validExports.push(result.artifact.raw);
    } else {
      // Keep the on-disk artifact untouched while excluding incomplete records
      // from the machine review aggregation.
      validExports.push(JSON.stringify({ ...result.artifact.value, records: completeRecords }));
    }
  }

  const combined = combineLongEvidenceExports(validExports);
  const projected = projectReview(combined);
  const malformedExportCount = projected.malformedExportCount + malformedFileCount;
  const totalMalformedRecordCount = projected.malformedRecordCount + malformedRecordCount;
  return {
    ...projected,
    status: projected.status === "ok" && (malformedExportCount > 0 || totalMalformedRecordCount > 0) ? "malformed" : projected.status,
    malformedExportCount,
    privacyViolationCount,
    authoritativeArtifactCount: validExports.length,
    malformedRecordCount: totalMalformedRecordCount,
    rejectedArtifactCount: malformedFileCount,
  };
}

export function main(args: readonly string[]): number {
  if (args.length === 0) {
    console.error("Usage: tsx scripts/reviewMemoryAdmissionLongEvidence.ts <sanitized-export.json> [...]");
    return 1;
  }
  const report = reviewMemoryAdmissionLongEvidenceArtifacts(args.map((value) => path.resolve(value)));
  console.log(JSON.stringify(report, null, 2));
  return report.status === "ok" ? 0 : 1;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile && path.resolve(currentFile) === invokedFile && pathToFileURL(currentFile).protocol === "file:") {
  process.exitCode = main(process.argv.slice(2));
}
